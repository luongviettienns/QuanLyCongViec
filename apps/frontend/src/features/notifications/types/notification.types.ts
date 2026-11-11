export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_UNASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMPLETED'
  | 'TASK_RETURNED'
  | 'TASK_DEADLINE_CHANGED'
  | 'TASK_DEADLINE_SOON'
  | 'TASK_OVERDUE'
  | 'TASK_DELETED'
  | 'TASK_MOVED_TEAM'
  | 'TEAM_MEMBER_ADDED'
  | 'TEAM_MEMBER_REMOVED'
  | 'TEAM_ROLE_CHANGED'
  | 'TEAM_OWNERSHIP_TRANSFERRED'
  | 'TEAM_DELETED'
  | 'TEAM_INVITED'
  | 'DEADLINE_SOON'
  | 'TASK_COLLABORATOR_INVITED'
  | 'TASK_COLLABORATOR_ACCEPTED'
  | 'TASK_COLLABORATOR_DECLINED'
  | 'TASK_COLLABORATOR_REMOVED'
  | 'SUBTASK_ASSIGNED';

export interface NotificationActor {
  id: number;
  name: string;
  email: string;
}

export interface Notification {
  id: number;
  userId: number;
  actorId: number | null;
  type: NotificationType;
  title: string;
  content: string;
  isRead: boolean;
  readAt: string | null;
  taskId: number | null;
  teamId: number | null;
  eventKey: string | null;
  createdAt: string;
  updatedAt: string;
  actor?: NotificationActor | null;
}

export interface NotificationsResponse {
  items: Notification[];
  nextCursor: number | null;
  unreadCount: number;
}

export interface QueryNotificationsParams {
  limit?: number;
  cursor?: number;
  filter?: 'all' | 'unread';
  type?: NotificationType;
}
