import type {
  Notification,
  NotificationsResponse,
  QueryNotificationsParams,
} from '../types/notification.types';
import {
  getAuthHeaders,
  handleApiResponse,
} from '../../../shared/api';

export async function getNotifications(
  params?: QueryNotificationsParams,
  signal?: AbortSignal,
): Promise<NotificationsResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', String(params.cursor));
  if (params?.filter) query.set('filter', params.filter);
  if (params?.type) query.set('type', params.type);

  const queryString = query.toString();
  const url = `/api/notifications${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<NotificationsResponse>(response, 'Không thể tải danh sách thông báo');
}

export async function getUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const response = await fetch('/api/notifications/unread-count', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    signal,
  });

  const data = await handleApiResponse<{ unreadCount: number }>(
    response,
    'Không thể lấy số thông báo chưa đọc',
  );
  return data.unreadCount;
}

export async function markNotificationAsRead(id: number): Promise<Notification> {
  const response = await fetch(`/api/notifications/${id}/read`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<Notification>(response, 'Không thể đánh dấu thông báo là đã đọc');
}

export async function markAllNotificationsAsRead(): Promise<{ success: boolean; updatedCount: number }> {
  const response = await fetch('/api/notifications/read-all', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<{ success: boolean; updatedCount: number }>(
    response,
    'Không thể đánh dấu tất cả thông báo là đã đọc',
  );
}

export async function markBulkNotificationsAsRead(
  ids: number[],
): Promise<{ success: boolean; updatedCount: number }> {
  const response = await fetch('/api/notifications/read-bulk', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ ids }),
  });

  return handleApiResponse<{ success: boolean; updatedCount: number }>(
    response,
    'Không thể đánh dấu danh sách thông báo là đã đọc',
  );
}
