export type RealtimeEventType =
  | 'TASK_STATUS_CHANGED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED'
  | 'TASK_REORDERED'
  | 'TASK_ASSIGNED'
  | 'TASK_RETURNED'
  | 'NOTIFICATION_NEW'
  | 'HEARTBEAT';

export interface RealtimeEventData {
  type: RealtimeEventType;
  actorId?: number;
  teamId?: number | null;
  payload: unknown;
  timestamp?: number;
}
