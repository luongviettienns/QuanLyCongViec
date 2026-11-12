export type RealtimeEventType =
  | 'TASK_STATUS_CHANGED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED'
  | 'TASK_REORDERED'
  | 'TASK_ASSIGNED'
  | 'TASK_RETURNED'
  | 'NOTIFICATION_NEW'
  | 'HEARTBEAT'
  | 'SUBTASK_CREATED'
  | 'SUBTASK_UPDATED'
  | 'SUBTASK_DELETED'
  | 'SUBTASK_REORDERED'
  | 'TASK_COLLABORATORS_CHANGED'
  | 'TEAM_UPDATED'
  | 'TEAM_DELETED'
  | 'TEAM_ACTIVITY_CREATED'
  | 'TEAM_CATEGORY_CHANGED';

export interface RealtimeBroadcastEvent {
  type: RealtimeEventType;
  actorId?: number;
  teamId?: number | null;
  targetUserIds?: number[];
  payload: any;
  timestamp: number;
}
