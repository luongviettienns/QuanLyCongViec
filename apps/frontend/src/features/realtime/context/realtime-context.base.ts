import { createContext } from 'react';
import type { RealtimeEventData, RealtimeEventType } from '../types/realtime.types';
import type { RealtimeConnectionStatus } from '../utils/realtime-connection.utils';

export type EventHandler = (event: RealtimeEventData) => void;
export type ReconnectHandler = () => void;

export interface RealtimeContextType {
  subscribe: (eventType: RealtimeEventType, handler: EventHandler) => () => void;
  subscribeReconnect: (handler: ReconnectHandler) => () => void;
  connectionStatus: RealtimeConnectionStatus;
}

export const RealtimeContext = createContext<RealtimeContextType | null>(null);
