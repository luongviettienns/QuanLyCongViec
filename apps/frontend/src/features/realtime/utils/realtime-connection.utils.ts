import type { RealtimeEventData, RealtimeEventType } from '../types/realtime.types';

export type RealtimeConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface EventSourceLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  addEventListener: (type: string, listener: (event: { data: string }) => void) => void;
  close: () => void;
}

export interface RealtimeConnectionConfig {
  reconnectDelayMs?: number;
  getToken: () => string | null;
  isTokenExpired: () => boolean;
  createEventSource: (url: string, token?: string) => EventSourceLike;
  scheduleTimer?: (callback: () => void, delayMs: number) => unknown;
  cancelTimer?: (timerId: unknown) => void;
  onEvent: (event: RealtimeEventData) => void;
  onReconnect: () => void;
  onStatusChange?: (status: RealtimeConnectionStatus) => void;
  onAuthExpired?: () => void;
}

const STREAM_EVENT_NAMES: readonly RealtimeEventType[] = [
  'TASK_STATUS_CHANGED',
  'TASK_CREATED',
  'TASK_UPDATED',
  'TASK_DELETED',
  'TASK_REORDERED',
  'TASK_ASSIGNED',
  'TASK_RETURNED',
  'NOTIFICATION_NEW',
  'SUBTASK_CREATED',
  'SUBTASK_UPDATED',
  'SUBTASK_DELETED',
  'SUBTASK_REORDERED',
  'TASK_COLLABORATORS_CHANGED',
  'TEAM_UPDATED',
  'TEAM_DELETED',
  'TEAM_ACTIVITY_CREATED',
  'TEAM_CATEGORY_CHANGED',
];

/**
 * Manages a single EventSource instance with deterministic reconnect detection,
 * duplicate-connection prevention, auth-expiry short-circuiting, and full cleanup.
 */
export function createRealtimeConnectionManager(config: RealtimeConnectionConfig) {
  const reconnectDelayMs = config.reconnectDelayMs ?? 3000;
  const schedule = config.scheduleTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const cancel = config.cancelTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let activeSource: EventSourceLike | null = null;
  let reconnectTimer: unknown = null;
  let stopped = true;
  let hasOpenedOnce = false;
  let wasDisconnected = false;

  function setStatus(status: RealtimeConnectionStatus) {
    config.onStatusChange?.(status);
  }

  function clearReconnectTimer() {
    if (reconnectTimer !== null) {
      cancel(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function closeActiveSource() {
    if (activeSource) {
      activeSource.onopen = null;
      activeSource.onmessage = null;
      activeSource.onerror = null;
      activeSource.close();
      activeSource = null;
    }
  }

  function connect() {
    if (stopped || activeSource) {
      return;
    }

    const token = config.getToken();
    if (!token || config.isTokenExpired()) {
      stopped = true;
      setStatus('idle');
      config.onAuthExpired?.();
      return;
    }

    setStatus(wasDisconnected ? 'reconnecting' : 'connecting');

    const url = '/api/realtime/stream';
    const es = config.createEventSource(url, token);
    activeSource = es;

    const dispatchRaw = (raw: string) => {
      if (stopped || activeSource !== es) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as RealtimeEventData;
        if (parsed && parsed.type) {
          config.onEvent(parsed);
        }
      } catch {
        // Ignore heartbeat or malformed messages
      }
    };

    es.onopen = () => {
      if (stopped || activeSource !== es) {
        return;
      }
      const isReconnect = hasOpenedOnce && wasDisconnected;
      hasOpenedOnce = true;
      wasDisconnected = false;
      setStatus('connected');
      if (isReconnect) {
        config.onReconnect();
      }
    };

    es.onmessage = (e) => {
      dispatchRaw(e.data);
    };

    for (const name of STREAM_EVENT_NAMES) {
      es.addEventListener(name, (e) => {
        dispatchRaw(e.data);
      });
    }

    es.onerror = () => {
      if (activeSource !== es) {
        return;
      }
      closeActiveSource();

      if (stopped) {
        return;
      }

      const currentToken = config.getToken();
      if (!currentToken || config.isTokenExpired()) {
        stopped = true;
        clearReconnectTimer();
        setStatus('idle');
        config.onAuthExpired?.();
        return;
      }

      wasDisconnected = true;
      setStatus('reconnecting');
      clearReconnectTimer();
      reconnectTimer = schedule(() => {
        reconnectTimer = null;
        connect();
      }, reconnectDelayMs);
    };
  }

  return {
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      hasOpenedOnce = false;
      wasDisconnected = false;
      clearReconnectTimer();
      closeActiveSource();
      setStatus('idle');
    },
  };
}
