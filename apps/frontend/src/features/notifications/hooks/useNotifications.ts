import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import type { Notification } from '../types/notification.types';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../api/notifications.api';
import { useAuth } from '../../auth/hooks/useAuth';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  appendPaginatedNotifications,
  mergeRealtimeNotificationState,
  type RealtimeNotificationPayload,
} from '../utils/notification-state.utils';

const POLL_INTERVAL_MS = 45000;
const PAGE_SIZE = 15;

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<number | null>(null);
  const notificationsRef = useRef<Notification[]>([]);
  const inFlightMarkReadRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Ignore transient background poll errors
    }
  }, [user]);

  const loadNotifications = useCallback(
    async (reset = true, silent = false) => {
      if (!user) {
        notificationsRef.current = [];
        setNotifications([]);
        setUnreadCount(0);
        setError(null);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (reset) {
        if (!silent) {
          setLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        const cursor = reset ? undefined : (nextCursorRef.current ?? undefined);
        const res = await getNotifications(
          {
            limit: PAGE_SIZE,
            cursor,
            filter: activeTab,
          },
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setError(null);
        if (reset) {
          notificationsRef.current = res.items;
          setNotifications(res.items);
        } else {
          setNotifications((prev) => {
            const merged = appendPaginatedNotifications(prev, res.items);
            notificationsRef.current = merged;
            return merged;
          });
        }

        nextCursorRef.current = res.nextCursor;
        setNextCursor(res.nextCursor);
        setHasMore(res.nextCursor !== null);
        setUnreadCount(res.unreadCount);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách thông báo');
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [user, activeTab],
  );

  const handleRealtimeNotification = useCallback(
    (event: RealtimeEventData) => {
      if (!user) return;
      const payload = (event.payload ?? null) as RealtimeNotificationPayload | null;
      const merged = mergeRealtimeNotificationState(
        notificationsRef.current,
        payload,
        user.id,
        activeTab,
      );

      if (merged.needsServerFetch) {
        void loadNotifications(true, true);
        return;
      }

      if (merged.items !== notificationsRef.current) {
        notificationsRef.current = merged.items;
        setNotifications(merged.items);
      }
      if (merged.unreadDelta !== 0) {
        setUnreadCount((prev) => Math.max(0, prev + merged.unreadDelta));
      }
    },
    [user, activeTab, loadNotifications],
  );

  useRealtimeEvent('NOTIFICATION_NEW', handleRealtimeNotification);

  const handleReconnectResync = useCallback(() => {
    void loadNotifications(true, true);
  }, [loadNotifications]);

  useRealtimeReconnect(handleReconnectResync);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || nextCursor === null) return;
    await loadNotifications(false);
  }, [loading, loadingMore, hasMore, nextCursor, loadNotifications]);

  const markRead = useCallback(
    async (id: number) => {
      if (inFlightMarkReadRef.current.has(id)) {
        return;
      }

      const target = notificationsRef.current.find((item) => item.id === id);
      if (target && target.isRead) {
        return;
      }

      inFlightMarkReadRef.current.add(id);
      const wasActuallyUnread = target ? !target.isRead : false;

      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );
      if (wasActuallyUnread) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      try {
        await markNotificationAsRead(id);
      } catch (err: unknown) {
        if (wasActuallyUnread) {
          setNotifications((current) =>
            current.map((item) => (item.id === id ? { ...item, isRead: false } : item)),
          );
          setUnreadCount((current) => current + 1);
        }
        message.error(err instanceof Error ? err.message : 'Không thể đánh dấu đã đọc');
        void loadNotifications(true, true);
      } finally {
        inFlightMarkReadRef.current.delete(id);
      }
    },
    [loadNotifications],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể đánh dấu đọc tất cả');
      void loadNotifications(true, true);
    }
  }, [loadNotifications]);

  useEffect(() => {
    let active = true;

    async function sync() {
      await Promise.resolve();
      if (!active) return;
      if (user) {
        void loadNotifications(true);
      } else {
        nextCursorRef.current = null;
        notificationsRef.current = [];
        setNotifications([]);
        setUnreadCount(0);
        setNextCursor(null);
        setHasMore(false);
        setError(null);
      }
    }

    void sync();

    return () => {
      active = false;
    };
  }, [user, activeTab, loadNotifications]);

  useEffect(() => {
    if (!user) return;

    const startPolling = () => {
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        void fetchUnreadCount();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        void fetchUnreadCount();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    error,
    hasMore,
    activeTab,
    setActiveTab,
    fetchNotifications: (opts?: { silent?: boolean }) =>
      loadNotifications(true, Boolean(opts?.silent)),
    loadMore,
    markRead,
    markAllRead,
  };
}
