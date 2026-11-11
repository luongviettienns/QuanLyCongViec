import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from '../../auth/hooks/useAuth';
import { getAuthToken } from '../../../shared/api/auth-session';
import {
  RealtimeContext,
  type EventHandler,
} from './realtime-context.base';
import type { RealtimeEventData, RealtimeEventType } from '../types/realtime.types';

const RECONNECT_DELAY_MS = 3000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const listenersRef = useRef<Map<RealtimeEventType, Set<EventHandler>>>(new Map());
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscribe = useCallback((eventType: RealtimeEventType, handler: EventHandler) => {
    if (!listenersRef.current.has(eventType)) {
      listenersRef.current.set(eventType, new Set());
    }
    listenersRef.current.get(eventType)!.add(handler);

    return () => {
      listenersRef.current.get(eventType)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;

      const currentToken = getAuthToken();
      if (!currentToken) return;

      const url = `/api/realtime/stream?token=${encodeURIComponent(currentToken)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      const handleEvent = (data: RealtimeEventData) => {
        if (!data || !data.type) return;
        const handlers = listenersRef.current.get(data.type);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(data);
            } catch (err) {
              console.error('[Realtime] Handler error:', err);
            }
          }
        }
      };

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as RealtimeEventData;
          handleEvent(parsed);
        } catch {
          // Ignore non-json or heartbeat messages
        }
      };

      const eventNames: RealtimeEventType[] = [
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
      ];

      for (const name of eventNames) {
        es.addEventListener(name, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data) as RealtimeEventData;
            handleEvent(parsed);
          } catch {
            // Ignore parse errors
          }
        });
      }

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (!isUnmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [user]);

  return (
    <RealtimeContext.Provider value={{ subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
