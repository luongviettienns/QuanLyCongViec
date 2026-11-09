import { createContext } from 'react';
import type { RealtimeEventData, RealtimeEventType } from '../types/realtime.types';

export type EventHandler = (event: RealtimeEventData) => void;

export interface RealtimeContextType {
  subscribe: (eventType: RealtimeEventType, handler: EventHandler) => () => void;
}

export const RealtimeContext = createContext<RealtimeContextType | null>(null);
