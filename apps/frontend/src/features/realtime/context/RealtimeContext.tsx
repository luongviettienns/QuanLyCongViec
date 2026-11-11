import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  getAuthToken,
  getTokenRemainingTime,
  notifyUnauthorized,
} from '../../../shared/api/auth-session';
import {
  RealtimeContext,
  type EventHandler,
  type ReconnectHandler,
} from './realtime-context.base';
import {
  createRealtimeConnectionManager,
  type RealtimeConnectionStatus,
} from '../utils/realtime-connection.utils';
import type { RealtimeEventType } from '../types/realtime.types';

const RECONNECT_DELAY_MS = 3000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const listenersRef = useRef<Map<RealtimeEventType, Set<EventHandler>>>(new Map());
  const reconnectListenersRef = useRef<Set<ReconnectHandler>>(new Set());
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('idle');

  const subscribe = useCallback((eventType: RealtimeEventType, handler: EventHandler) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(handler);

    return () => {
      listenersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  const subscribeReconnect = useCallback((handler: ReconnectHandler) => {
    reconnectListenersRef.current.add(handler);
    return () => {
      reconnectListenersRef.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      Promise.resolve().then(() => setConnectionStatus('idle'));
      return;
    }

    const token = getAuthToken();
    if (!token) {
      Promise.resolve().then(() => setConnectionStatus('idle'));
      return;
    }

    const manager = createRealtimeConnectionManager({
      reconnectDelayMs: RECONNECT_DELAY_MS,
      getToken: getAuthToken,
      isTokenExpired: () => {
        const remaining = getTokenRemainingTime();
        return remaining !== null && remaining <= 0;
      },
      createEventSource: (url) => {
        const es = new EventSource(url);
        let currentOpen: (() => void) | null = null;
        let currentMessage: ((event: { data: string }) => void) | null = null;
        let currentError: (() => void) | null = null;
        return {
          get onopen() {
            return currentOpen;
          },
          set onopen(handler: (() => void) | null) {
            currentOpen = handler;
            es.onopen = handler ? () => handler() : null;
          },
          get onmessage() {
            return currentMessage;
          },
          set onmessage(handler: ((event: { data: string }) => void) | null) {
            currentMessage = handler;
            es.onmessage = handler ? (ev) => handler({ data: String(ev.data) }) : null;
          },
          get onerror() {
            return currentError;
          },
          set onerror(handler: (() => void) | null) {
            currentError = handler;
            es.onerror = handler ? () => handler() : null;
          },
          addEventListener: (type, listener) => {
            es.addEventListener(type, (ev) => {
              if (ev instanceof MessageEvent) {
                listener({ data: String(ev.data) });
              }
            });
          },
          close: () => es.close(),
        };
      },
      onEvent: (data) => {
        const handlers = listenersRef.current.get(data.type);
        if (!handlers) return;
        for (const handler of handlers) {
          try {
            handler(data);
          } catch (err) {
            console.error('[Realtime] Handler error:', err);
          }
        }
      },
      onReconnect: () => {
        for (const handler of reconnectListenersRef.current) {
          try {
            handler();
          } catch (err) {
            console.error('[Realtime] Reconnect handler error:', err);
          }
        }
      },
      onStatusChange: (nextStatus) => {
        setConnectionStatus(nextStatus);
      },
      onAuthExpired: () => {
        notifyUnauthorized();
      },
    });

    manager.start();

    return () => {
      manager.stop();
    };
  }, [userId]);

  return (
    <RealtimeContext.Provider value={{ subscribe, subscribeReconnect, connectionStatus }}>
      {children}
    </RealtimeContext.Provider>
  );
}
