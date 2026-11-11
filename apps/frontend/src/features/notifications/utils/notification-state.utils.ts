import type { Notification, NotificationType } from '../types/notification.types';

export interface RealtimeNotificationPayload {
  id?: number;
  type?: NotificationType;
  title?: string;
  content?: string;
  taskId?: number | null;
  subtaskId?: number | null;
  teamId?: number | null;
  isRead?: boolean;
  createdAt?: string;
}

export interface NotificationDestination {
  type: 'task' | 'team';
  id: number;
  subtaskId?: number | null;
}

/**
 * Merges a live `NOTIFICATION_NEW` SSE payload into the current notification list
 * without wiping paginated items or double-counting duplicate arrivals.
 */
export function mergeRealtimeNotificationState(
  prevItems: Notification[],
  payload: RealtimeNotificationPayload | null | undefined,
  currentUserId: number,
  activeTab: 'all' | 'unread',
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
    teamId: payload.teamId ?? null,
    eventKey: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  if (activeTab === 'unread' && isRead) {
    return {
      items: prevItems,
      unreadDelta: 0,
      needsServerFetch: false,
    };
  }

  return {
    items: [newNotification, ...prevItems],
    unreadDelta: isRead ? 0 : 1,
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
  notification: Pick<Notification, 'taskId' | 'subtaskId' | 'teamId'>,
): NotificationDestination | null {
  if (notification.taskId) {
    return {
      type: 'task',
      id: notification.taskId,
      subtaskId: notification.subtaskId ?? null,
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
