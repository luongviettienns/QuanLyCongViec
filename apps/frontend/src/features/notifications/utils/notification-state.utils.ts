import type {
  Notification,
  NotificationFilterTab,
  NotificationType,
} from '../types/notification.types.ts';

export interface RealtimeNotificationPayload {
  id?: number;
  type?: NotificationType;
  title?: string;
  content?: string;
  taskId?: number | null;
  subtaskId?: number | null;
  commentId?: number | null;
  teamId?: number | null;
  isRead?: boolean;
  createdAt?: string;
}

export interface NotificationDestination {
  type: 'task' | 'team';
  id: number;
  subtaskId?: number | null;
  commentId?: number | null;
  targetTab?: 'info' | 'collaborators' | 'subtasks' | 'comments';
}

export type NotificationTimeGroupKey = 'today' | 'yesterday' | 'earlier';

export interface NotificationTimeGroup {
  key: NotificationTimeGroupKey;
  label: 'Hôm nay' | 'Hôm qua' | 'Trước đó';
  items: Notification[];
}

export type NotificationSemanticTone = 'danger' | 'warning' | 'primary' | 'success';

export interface NotificationVisualStyle {
  tone: NotificationSemanticTone;
  iconColor: string;
  iconBgColor: string;
  isOverdue: boolean;
}

/**
 * Mirrors backend IMPORTANT_NOTIFICATION_TYPES (16 types) for consistent
 * "Quan trọng" filtering across cursor queries and live SSE arrivals.
 */
export const IMPORTANT_NOTIFICATION_TYPES: ReadonlySet<NotificationType> = new Set([
  'TASK_OVERDUE',
  'TASK_DEADLINE_SOON',
  'DEADLINE_SOON',
  'TASK_DEADLINE_CHANGED',
  'TASK_ASSIGNED',
  'SUBTASK_ASSIGNED',
  'TASK_RETURNED',
  'TASK_COLLABORATOR_INVITED',
  'TASK_DELETED',
  'TEAM_INVITED',
  'TEAM_OWNERSHIP_TRANSFERRED',
  'TEAM_MEMBER_REMOVED',
  'TEAM_ROLE_CHANGED',
  'TEAM_DELETED',
  'TASK_COMMENT_MENTIONED',
  'TASK_COMMENT_REPLIED',
]);

const VN_CALENDAR_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TONE_COLORS: Record<
  NotificationSemanticTone,
  { iconColor: string; iconBgColor: string }
> = {
  danger: { iconColor: '#ff4d4f', iconBgColor: '#fff1f0' },
  warning: { iconColor: '#fa8c16', iconBgColor: '#fff7e6' },
  primary: { iconColor: '#1677ff', iconBgColor: '#e6f4ff' },
  success: { iconColor: '#52c41a', iconBgColor: '#f6ffed' },
};

const DANGER_TYPES: ReadonlySet<NotificationType> = new Set([
  'TASK_OVERDUE',
  'TASK_DELETED',
  'TEAM_DELETED',
  'TEAM_MEMBER_REMOVED',
  'TASK_COLLABORATOR_DECLINED',
]);

const WARNING_TYPES: ReadonlySet<NotificationType> = new Set([
  'TASK_DEADLINE_SOON',
  'DEADLINE_SOON',
  'TASK_RETURNED',
  'TASK_DEADLINE_CHANGED',
  'TASK_UNASSIGNED',
  'SUBTASK_UNASSIGNED',
  'TASK_COLLABORATOR_REMOVED',
  'SUBTASK_REOPENED',
]);

const SUCCESS_TYPES: ReadonlySet<NotificationType> = new Set([
  'TASK_COMPLETED',
  'SUBTASK_COMPLETED',
  'TASK_COLLABORATOR_ACCEPTED',
]);

/** Returns true if the notification belongs to the "Quan trọng" filter tab. */
export function isImportantNotification(type: NotificationType): boolean {
  return IMPORTANT_NOTIFICATION_TYPES.has(type);
}

/** Formats a timestamp into a YYYY-MM-DD calendar key in Asia/Ho_Chi_Minh timezone. */
export function getVietnamCalendarDateKey(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return VN_CALENDAR_FORMATTER.format(date);
}

function shiftCalendarDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return '';
  }
  const [year, month, day] = parts;
  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}

/**
 * Groups notifications into "Hôm nay", "Hôm qua", and "Trước đó" buckets using
 * Vietnam calendar days while omitting empty sections.
 */
export function groupNotificationsByTime(
  notifications: readonly Notification[],
  now: Date = new Date(),
): NotificationTimeGroup[] {
  if (notifications.length === 0) {
    return [];
  }

  const todayKey = getVietnamCalendarDateKey(now);
  const yesterdayKey = shiftCalendarDateKey(todayKey, -1);

  const todayItems: Notification[] = [];
  const yesterdayItems: Notification[] = [];
  const earlierItems: Notification[] = [];

  for (const item of notifications) {
    const key = getVietnamCalendarDateKey(item.createdAt);
    if (key && key === todayKey) {
      todayItems.push(item);
    } else if (key && key === yesterdayKey) {
      yesterdayItems.push(item);
    } else {
      earlierItems.push(item);
    }
  }

  const groups: NotificationTimeGroup[] = [];
  if (todayItems.length > 0) {
    groups.push({ key: 'today', label: 'Hôm nay', items: todayItems });
  }
  if (yesterdayItems.length > 0) {
    groups.push({ key: 'yesterday', label: 'Hôm qua', items: yesterdayItems });
  }
  if (earlierItems.length > 0) {
    groups.push({ key: 'earlier', label: 'Trước đó', items: earlierItems });
  }

  return groups;
}

/** Maps a notification type to one of 4 restrained semantic color tones. */
export function getNotificationVisualStyle(type: NotificationType): NotificationVisualStyle {
  let tone: NotificationSemanticTone = 'primary';
  if (DANGER_TYPES.has(type)) {
    tone = 'danger';
  } else if (WARNING_TYPES.has(type)) {
    tone = 'warning';
  } else if (SUCCESS_TYPES.has(type)) {
    tone = 'success';
  }

  const { iconColor, iconBgColor } = TONE_COLORS[tone];
  return {
    tone,
    iconColor,
    iconBgColor,
    isOverdue: type === 'TASK_OVERDUE',
  };
}

/**
 * Resolves which modal tab to focus when opening a task from a notification.
 * Prioritizes comment navigation, then subtask navigation, then collaborator
 * events, falling back to 'info'.
 */
export function resolveNotificationModalTab(
  type?: NotificationType,
  subtaskId?: number | null,
  commentId?: number | null,
): 'info' | 'collaborators' | 'subtasks' | 'comments' {
  if (
    commentId ||
    type === 'TASK_COMMENT_MENTIONED' ||
    type === 'TASK_COMMENT_REPLIED'
  ) {
    return 'comments';
  }
  if (subtaskId) {
    return 'subtasks';
  }
  if (
    type === 'TASK_COLLABORATOR_INVITED' ||
    type === 'TASK_COLLABORATOR_ACCEPTED' ||
    type === 'TASK_COLLABORATOR_DECLINED' ||
    type === 'TASK_COLLABORATOR_REMOVED'
  ) {
    return 'collaborators';
  }
  return 'info';
}

/**
 * Merges a live `NOTIFICATION_NEW` SSE payload into the current notification list
 * without wiping paginated items or double-counting duplicate arrivals.
 */
export function mergeRealtimeNotificationState(
  prevItems: Notification[],
  payload: RealtimeNotificationPayload | null | undefined,
  currentUserId: number,
  activeTab: NotificationFilterTab,
): {
  items: Notification[];
  unreadDelta: number;
  needsServerFetch: boolean;
} {
  if (!payload || typeof payload.id !== 'number' || !payload.type || !payload.title) {
    return {
      items: prevItems,
      unreadDelta: 0,
      needsServerFetch: true,
    };
  }

  if (prevItems.some((item) => item.id === payload.id)) {
    return {
      items: prevItems,
      unreadDelta: 0,
      needsServerFetch: false,
    };
  }

  const nowIso = payload.createdAt ?? new Date().toISOString();
  const isRead = Boolean(payload.isRead);
  const unreadDelta = isRead ? 0 : 1;

  if (activeTab === 'unread' && isRead) {
    return {
      items: prevItems,
      unreadDelta,
      needsServerFetch: false,
    };
  }

  if (activeTab === 'important' && !isImportantNotification(payload.type)) {
    return {
      items: prevItems,
      unreadDelta,
      needsServerFetch: false,
    };
  }

  const newNotification: Notification = {
    id: payload.id,
    userId: currentUserId,
    actorId: null,
    type: payload.type,
    title: payload.title,
    content: payload.content ?? '',
    isRead,
    readAt: null,
    taskId: payload.taskId ?? null,
    subtaskId: payload.subtaskId ?? null,
    commentId: payload.commentId ?? null,
    teamId: payload.teamId ?? null,
    eventKey: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    items: [newNotification, ...prevItems],
    unreadDelta,
    needsServerFetch: false,
  };
}

/**
 * Appends paginated notifications while preserving deduplicated order.
 */
export function appendPaginatedNotifications(
  prevItems: Notification[],
  incomingItems: Notification[],
): Notification[] {
  const seenIds = new Set(prevItems.map((item) => item.id));
  const additions = incomingItems.filter((item) => !seenIds.has(item.id));
  return [...prevItems, ...additions];
}

/**
 * Resolves navigation destination for a clicked notification, keeping `subtaskId`
 * so the router can deep-link directly to the subtask tab and highlight it.
 */
export function buildNotificationDestination(
  notification: Pick<Notification, 'taskId' | 'subtaskId' | 'commentId' | 'teamId'>,
): NotificationDestination | null {
  if (notification.taskId) {
    return {
      type: 'task',
      id: notification.taskId,
      subtaskId: notification.subtaskId ?? null,
      ...(notification.commentId ? { commentId: notification.commentId } : {}),
    };
  }

  if (notification.teamId) {
    return {
      type: 'team',
      id: notification.teamId,
    };
  }

  return null;
}

/** Optimistically marks a target notification as read without mutating when already read. */
export function applyOptimisticMarkRead(
  items: Notification[],
  targetId: number,
): { items: Notification[]; didChange: boolean } {
  const target = items.find((item) => item.id === targetId);
  if (!target || target.isRead) {
    return { items, didChange: false };
  }
  return {
    items: items.map((item) => (item.id === targetId ? { ...item, isRead: true } : item)),
    didChange: true,
  };
}

/** Reverts optimistic read status only for the failed notification IDs. */
export function rollbackOptimisticMarkAllRead(
  items: Notification[],
  targetIds: readonly number[],
): Notification[] {
  if (targetIds.length === 0) {
    return items;
  }
  const targetSet = new Set(targetIds);
  return items.map((item) =>
    targetSet.has(item.id) ? { ...item, isRead: false } : item,
  );
}

/** Optimistically marks all currently unread notifications as read, clearing the visible list when on the unread tab. */
export function applyOptimisticMarkAllRead(
  items: Notification[],
  activeTab: NotificationFilterTab = 'all',
): { items: Notification[]; flippedIds: number[] } {
  const flippedIds: number[] = [];
  const nextItems = items.map((item) => {
    if (item.isRead) {
      return item;
    }
    flippedIds.push(item.id);
    return { ...item, isRead: true };
  });
  if (activeTab === 'unread') {
    return {
      items: [],
      flippedIds,
    };
  }
  return {
    items: flippedIds.length > 0 ? nextItems : items,
    flippedIds,
  };
}

/** Reverts optimistic read status only for the failed notification ID. */
export function rollbackOptimisticMarkRead(
  items: Notification[],
  targetId: number,
): Notification[] {
  return rollbackOptimisticMarkAllRead(items, [targetId]);
}
