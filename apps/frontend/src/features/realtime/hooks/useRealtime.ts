import { useContext, useEffect, useRef } from 'react';
import { RealtimeContext, type RealtimeContextType } from '../context/realtime-context.base';
import type { RealtimeEventData, RealtimeEventType } from '../types/realtime.types';

export function useRealtime(): RealtimeContextType {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

export function useRealtimeEvent(
  eventType: RealtimeEventType,
  handler: (event: RealtimeEventData) => void,
) {
  const { subscribe } = useRealtime();

  useEffect(() => {
    return subscribe(eventType, handler);
  }, [subscribe, eventType, handler]);
}

/**
 * Listens for SSE connection reconnects with built-in debouncing (default 300ms).
 * Prevents multiple concurrent API re-fetches when connection rapidly flaps,
 * and cancels pending timers on unmount.
 */
export function useRealtimeReconnect(handler: () => void, debounceMs = 300) {
  const { subscribeReconnect } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedHandler = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        handlerRef.current();
      }, debounceMs);
    };

    const unsubscribe = subscribeReconnect(debouncedHandler);
    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [subscribeReconnect, debounceMs]);
}
