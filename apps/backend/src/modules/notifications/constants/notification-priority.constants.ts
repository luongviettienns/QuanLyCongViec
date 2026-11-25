import { NotificationType } from '@prisma/client';

/**
 * Notification types surfaced in the "Quan trọng" (Important) tab:
 * urgent deadlines, new task/subtask assignments, returns, collaboration invites,
 * and high-impact task/team governance changes.
 */
export const IMPORTANT_NOTIFICATION_TYPES: readonly NotificationType[] = [
  NotificationType.TASK_OVERDUE,
  NotificationType.TASK_DEADLINE_SOON,
  NotificationType.DEADLINE_SOON,
  NotificationType.TASK_DEADLINE_CHANGED,
  NotificationType.TASK_ASSIGNED,
  NotificationType.SUBTASK_ASSIGNED,
  NotificationType.TASK_RETURNED,
  NotificationType.TASK_COLLABORATOR_INVITED,
  NotificationType.TASK_DELETED,
  NotificationType.TEAM_INVITED,
  NotificationType.TEAM_OWNERSHIP_TRANSFERRED,
  NotificationType.TEAM_MEMBER_REMOVED,
  NotificationType.TEAM_ROLE_CHANGED,
  NotificationType.TEAM_DELETED,
  NotificationType.TASK_COMMENT_MENTIONED,
  NotificationType.TASK_COMMENT_REPLIED,
] as const;

const IMPORTANT_NOTIFICATION_TYPE_SET: ReadonlySet<NotificationType> = new Set(
  IMPORTANT_NOTIFICATION_TYPES,
);

/** Checks whether a notification type belongs to the "Important" filter bucket. */
export function isImportantNotificationType(type: NotificationType): boolean {
  return IMPORTANT_NOTIFICATION_TYPE_SET.has(type);
}
