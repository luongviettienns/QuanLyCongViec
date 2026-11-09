import { useState, useEffect, useCallback, useRef } from 'react';
import type { Notification } from '../types/notification.types';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../api/notifications.api';
import { useAuth } from '../../auth/hooks/useAuth';
import { useRealtimeEvent } from '../../realtime';

const POLL_INTERVAL_MS = 45000;
const PAGE_SIZE = 15;

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<number | null>(null);
  const inFlightMarkReadRef = useRef<Set<number>>(new Set());

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(count);
    } catch {
      // Ignore background poll errors
    }
  }, [user]);

  const handleRealtimeNotification = useCallback(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  useRealtimeEvent('NOTIFICATION_NEW', handleRealtimeNotification);

  const loadNotifications = useCallback(
    async (reset = true) => {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (reset) {
        setLoading(true);
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
          abortControllerRef.current.signal,
        );

        if (reset) {
          setNotifications(res.items);
        } else {
          setNotifications((prev) => [...prev, ...res.items]);
        }

        nextCursorRef.current = res.nextCursor;
        setNextCursor(res.nextCursor);
        setHasMore(res.nextCursor !== null);
        setUnreadCount(res.unreadCount);
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Ignore abort errors
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, activeTab],
  );

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore || nextCursor === null) return;
    await loadNotifications(false);
  }, [loading, loadingMore, hasMore, nextCursor, loadNotifications]);

  const markRead = useCallback(
    async (id: number) => {
      // 1. Vô hiệu hóa thao tác lặp trên cùng ID khi request còn đang chạy
      if (inFlightMarkReadRef.current.has(id)) {
        return;
      }

      // 2. Kiểm tra trạng thái: nếu notification đã đọc trước đó, không làm gì
      const target = notifications.find((item) => item.id === id);
      if (target && target.isRead) {
        return;
      }

      inFlightMarkReadRef.current.add(id);

      // Chỉ giảm unreadCount khi xác định notification thực sự đang chưa đọc
      const wasActuallyUnread = target ? !target.isRead : false;

      // 3. Optimistic update: chỉ cập nhật item tương ứng
      setNotifications((current) =>
        current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
      );
      if (wasActuallyUnread) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }

      try {
        await markNotificationAsRead(id);
      } catch {
        // 4. Targeted rollback: chỉ hoàn nguyên nếu trước đó thực sự chưa đọc
        if (wasActuallyUnread) {
          setNotifications((current) =>
            current.map((item) => (item.id === id ? { ...item, isRead: false } : item)),
          );
          setUnreadCount((current) => current + 1);
        }
        // 5. Refetch fresh source of truth from server
        void fetchUnreadCount();
        void loadNotifications(true);
      } finally {
        inFlightMarkReadRef.current.delete(id);
      }
    },
    [notifications, fetchUnreadCount, loadNotifications],
  );

  const markAllRead = useCallback(async () => {
    // 1. Optimistic update: mark all items as read
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
    } catch {
      // 2. On failure, refetch fresh source of truth from server
      void fetchUnreadCount();
      void loadNotifications(true);
    }
  }, [fetchUnreadCount, loadNotifications]);

  // Initial load & when activeTab changes
  useEffect(() => {
    let active = true;

    async function sync() {
      await Promise.resolve();
      if (!active) return;
      if (user) {
        void loadNotifications(true);
      } else {
        nextCursorRef.current = null;
        setNotifications([]);
        setUnreadCount(0);
        setNextCursor(null);
        setHasMore(false);
      }
    }

    void sync();

    return () => {
      active = false;
    };
  }, [user, activeTab, loadNotifications]);

  // Controlled polling with Page Visibility API
  useEffect(() => {
    if (!user) return;

    const startPolling = () => {
      stopPolling();
      pollTimerRef.current = setInterval(() => {
        fetchUnreadCount();
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
        // Resume immediately on tab focus
        fetchUnreadCount();
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
    hasMore,
    activeTab,
    setActiveTab,
    fetchNotifications: () => loadNotifications(true),
    loadMore,
    markRead,
    markAllRead,
  };
}
