import { useContext, useEffect } from 'react';
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
