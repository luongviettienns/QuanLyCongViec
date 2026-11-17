import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import type { Notification, NotificationFilterTab } from '../types/notification.types';
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../api/notifications.api';
import { useAuth } from '../../auth/hooks/useAuth';
import {
  isAbortError,
  isUnauthorizedError,
  getFriendlyErrorMessage,
} from '../../../shared/api';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  appendPaginatedNotifications,
  applyOptimisticMarkAllRead,
  applyOptimisticMarkRead,
  mergeRealtimeNotificationState,
  rollbackOptimisticMarkAllRead,
  rollbackOptimisticMarkRead,
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
  const [activeTab, setActiveTabState] = useState<NotificationFilterTab>('all');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextCursorRef = useRef<number | null>(null);
  const notificationsRef = useRef<Notification[]>([]);
  const activeTabRef = useRef<NotificationFilterTab>('all');
  const unreadCountRef = useRef<number>(0);
  const unreadSyncEpochRef = useRef<number>(0);
  const inFlightMarkReadRef = useRef<Set<number>>(new Set());
  const inFlightMarkAllRef = useRef<boolean>(false);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    try {
      const count = await getUnreadNotificationCount();
      unreadSyncEpochRef.current += 1;
      unreadCountRef.current = count;
      setUnreadCount(count);
    } catch {
      // Ignore transient background poll errors
    }
  }, [user]);

  const loadNotifications = useCallback(
    async (reset = true, silent = false) => {
      if (!user) {
        notificationsRef.current = [];
        unreadSyncEpochRef.current += 1;
        unreadCountRef.current = 0;
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
      const requestTab = activeTabRef.current;

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
            filter: requestTab,
          },
          controller.signal,
        );

        if (controller.signal.aborted || requestTab !== activeTabRef.current) {
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
        unreadSyncEpochRef.current += 1;
        unreadCountRef.current = res.unreadCount;
        setUnreadCount(res.unreadCount);
      } catch (err: unknown) {
        if (
          controller.signal.aborted ||
          requestTab !== activeTabRef.current ||
          isAbortError(err) ||
          isUnauthorizedError(err)
        ) {
          return;
        }
        setError(getFriendlyErrorMessage(err, 'Không thể tải danh sách thông báo'));
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [user],
  );

  const handleRealtimeNotification = useCallback(
    (event: RealtimeEventData) => {
      if (!user) return;
      const payload = (event.payload ?? null) as RealtimeNotificationPayload | null;
      const merged = mergeRealtimeNotificationState(
        notificationsRef.current,
        payload,
        user.id,
        activeTabRef.current,
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
        setUnreadCount((prev) => {
          const next = Math.max(0, prev + merged.unreadDelta);
          unreadCountRef.current = next;
          return next;
        });
      }
    },
    [user, loadNotifications],
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

  const setActiveTab = useCallback(
    (nextTab: NotificationFilterTab) => {
      if (nextTab === activeTabRef.current) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      activeTabRef.current = nextTab;
      nextCursorRef.current = null;
      notificationsRef.current = [];
      setNextCursor(null);
      setHasMore(false);
      setError(null);
      setNotifications([]);
      setLoading(Boolean(user));
      setLoadingMore(false);
      setActiveTabState(nextTab);
    },
    [user],
  );

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

      setNotifications((current) => {
        const res = applyOptimisticMarkRead(current, id);
        notificationsRef.current = res.items;
        return res.items;
      });
      if (wasActuallyUnread) {
        setUnreadCount((current) => {
          const next = Math.max(0, current - 1);
          unreadCountRef.current = next;
          return next;
        });
      }

      try {
        await markNotificationAsRead(id);
      } catch (err: unknown) {
        if (wasActuallyUnread) {
          setNotifications((current) => {
            const rolled = rollbackOptimisticMarkRead(current, id);
            notificationsRef.current = rolled;
            return rolled;
          });
          setUnreadCount((current) => {
            const next = current + 1;
            unreadCountRef.current = next;
            return next;
          });
        }
        if (isAbortError(err) || isUnauthorizedError(err)) {
          return;
        }
        message.error(getFriendlyErrorMessage(err, 'Không thể đánh dấu đã đọc'));
      } finally {
        inFlightMarkReadRef.current.delete(id);
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    if (inFlightMarkAllRef.current) {
      return;
    }

    const requestTab = activeTabRef.current;
    const startEpoch = unreadSyncEpochRef.current;
    const clearedCount = unreadCountRef.current;
    const prevItems = notificationsRef.current;
    const prevCursor = nextCursorRef.current;
    const prevHasMore = prevItems.length > 0 && prevCursor !== null;
    const applied = applyOptimisticMarkAllRead(prevItems, requestTab);

    if (clearedCount === 0 && applied.flippedIds.length === 0) {
      return;
    }

    inFlightMarkAllRef.current = true;
    if (requestTab === 'unread') {
      nextCursorRef.current = null;
      setNextCursor(null);
      setHasMore(false);
    }
    setNotifications((current) => {
      const next = applyOptimisticMarkAllRead(current, requestTab).items;
      notificationsRef.current = next;
      return next;
    });
    unreadCountRef.current = 0;
    setUnreadCount(0);

    try {
      await markAllNotificationsAsRead();
    } catch (err: unknown) {
      if (requestTab === 'unread') {
        if (activeTabRef.current === 'unread') {
          setNotifications((current) => {
            const restored = rollbackOptimisticMarkAllRead(
              appendPaginatedNotifications(current, prevItems),
              applied.flippedIds,
            );
            notificationsRef.current = restored;
            return restored;
          });
          nextCursorRef.current = prevCursor;
          setNextCursor(prevCursor);
          setHasMore(prevHasMore);
        }
      } else {
        setNotifications((current) => {
          const rolled = rollbackOptimisticMarkAllRead(current, applied.flippedIds);
          notificationsRef.current = rolled;
          return rolled;
        });
      }
      if (unreadSyncEpochRef.current === startEpoch && clearedCount > 0) {
        setUnreadCount((current) => {
          const next = current + clearedCount;
          unreadCountRef.current = next;
          return next;
        });
      }
      if (isAbortError(err) || isUnauthorizedError(err)) {
        return;
      }
      message.error(getFriendlyErrorMessage(err, 'Không thể đánh dấu đọc tất cả'));
    } finally {
      inFlightMarkAllRef.current = false;
    }
  }, []);

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
        unreadSyncEpochRef.current += 1;
        unreadCountRef.current = 0;
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
