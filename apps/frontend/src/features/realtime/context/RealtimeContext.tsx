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
      createEventSource: (url, token) => {
        const controller = new AbortController();
        const listeners = new Map<string, Set<(event: { data: string }) => void>>();
        let currentOpen: (() => void) | null = null;
        let currentMessage: ((event: { data: string }) => void) | null = null;
        let currentError: (() => void) | null = null;
        let isClosed = false;

        async function start() {
          try {
            const response = await fetch(url, {
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                Accept: 'text/event-stream',
              },
              signal: controller.signal,
            });

            if (!response.ok || !response.body) {
              if (!isClosed && currentError) {
                currentError();
              }
              return;
            }

            if (!isClosed && currentOpen) {
              currentOpen();
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (!isClosed) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const frames = buffer.split('\n\n');
              buffer = frames.pop() ?? '';

              for (const frame of frames) {
                if (!frame.trim()) continue;
                let eventType = 'message';
                let data = '';

                for (const line of frame.split('\n')) {
                  if (line.startsWith('event:')) {
                    eventType = line.slice(6).trim();
                  } else if (line.startsWith('data:')) {
                    data = line.slice(5).trim();
                  }
                }

                if (data) {
                  if (eventType === 'message') {
                    if (currentMessage) {
                      currentMessage({ data });
                    }
                  } else {
                    const typeListeners = listeners.get(eventType);
                    if (typeListeners) {
                      for (const l of typeListeners) {
                        l({ data });
                      }
                    }
                  }
                }
              }
            }

            if (!isClosed && currentError) {
              currentError();
            }
          } catch (err: unknown) {
            if (isClosed || (err instanceof DOMException && err.name === 'AbortError')) {
              return;
            }
            if (currentError) {
              currentError();
            }
          }
        }

        void start();

        return {
          get onopen() {
            return currentOpen;
          },
          set onopen(handler: (() => void) | null) {
            currentOpen = handler;
          },
          get onmessage() {
            return currentMessage;
          },
          set onmessage(handler: ((event: { data: string }) => void) | null) {
            currentMessage = handler;
          },
          get onerror() {
            return currentError;
          },
          set onerror(handler: (() => void) | null) {
            currentError = handler;
          },
          addEventListener: (type, listener) => {
            if (!listeners.has(type)) {
              listeners.set(type, new Set());
            }
            listeners.get(type)!.add(listener);
          },
          close: () => {
            isClosed = true;
            controller.abort();
          },
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
