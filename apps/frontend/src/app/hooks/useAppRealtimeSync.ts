import { useCallback, useEffect, useRef } from 'react';
import {
  useRealtimeEvent,
  type RealtimeEventData,
} from '../../features/realtime';

import type { AppNavKey } from '../layouts/AppLayout';

export interface UseAppRealtimeSyncOptions {
  token?: string | null;
  userId?: number;
  currentNav?: AppNavKey;
  activeModalTaskId?: number | null;
  activeModalTab?: 'info' | 'collaborators' | 'subtasks';
  onRefetchTasks: () => void | Promise<void>;
  onRefetchCategories: () => void | Promise<void>;
  onRefetchTeams: () => void | Promise<void>;
  onRefreshModalTask: (taskId: number, forceDeleted?: boolean) => void | Promise<void>;
  onNotificationNew?: () => void;
  onCloseModalIfDeleted?: () => void;
  onDashboardReload?: () => void;
}

export function useAppRealtimeSync(options: UseAppRealtimeSyncOptions) {
  const optionsRef = useRef<UseAppRealtimeSyncOptions>(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      const { currentNav, onRefetchTasks, onDashboardReload } = optionsRef.current;
      if (currentNav === 'tasks' || currentNav === 'calendar') {
        void onRefetchTasks();
      } else if (currentNav === 'dashboard') {
        onDashboardReload?.();
      }
    }, 400);
  }, []);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current !== null) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, []);

  const handleRealtimeTaskEvent = useCallback(
    (event: RealtimeEventData) => {
      const { userId } = optionsRef.current;
      // Bỏ qua sự kiện do chính mình thực hiện vì UI đã cập nhật lạc quan
      if (event.actorId && event.actorId === userId) {
        return;
      }
      scheduleRefetch();
    },
    [scheduleRefetch],
  );

  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_CREATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_UPDATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_DELETED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_REORDERED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_REORDERED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeTaskEvent);

  const handleRealtimeNotification = useCallback(() => {
    const { onNotificationNew } = optionsRef.current;
    if (onNotificationNew) {
      onNotificationNew();
    }
    scheduleRefetch();
  }, [scheduleRefetch]);

  useRealtimeEvent('NOTIFICATION_NEW', handleRealtimeNotification);

  const handleRealtimeTeamMeta = useCallback(
    (event: RealtimeEventData) => {
      const { userId, currentNav, onRefetchTeams } = optionsRef.current;
      if (event.actorId && event.actorId === userId) {
        return;
      }
      if (currentNav === 'tasks' || currentNav === 'calendar') {
        void onRefetchTeams();
        scheduleRefetch();
      }
    },
    [scheduleRefetch],
  );

  const handleRealtimeTeamCategory = useCallback(
    (event: RealtimeEventData) => {
      const { userId, currentNav, onRefetchCategories } = optionsRef.current;
      if (event.actorId && event.actorId === userId) {
        return;
      }
      if (currentNav === 'tasks' || currentNav === 'calendar') {
        void onRefetchCategories();
        scheduleRefetch();
      }
    },
    [scheduleRefetch],
  );

  useRealtimeEvent('TEAM_UPDATED', handleRealtimeTeamMeta);
  useRealtimeEvent('TEAM_DELETED', handleRealtimeTeamMeta);
  useRealtimeEvent('TEAM_CATEGORY_CHANGED', handleRealtimeTeamCategory);

  const handleRealtimeModalEvent = useCallback(
    (event: RealtimeEventData) => {
      const { userId, activeModalTaskId, onRefreshModalTask, onCloseModalIfDeleted } =
        optionsRef.current;
      if (event.actorId && event.actorId === userId && event.type !== 'TASK_DELETED') {
        return;
      }
      const openTaskId = activeModalTaskId;
      if (!openTaskId) {
        return;
      }
      const payload = event.payload as { taskId?: number } | undefined;
      if (payload?.taskId !== undefined && payload.taskId !== openTaskId) {
        return;
      }
      void onRefreshModalTask(openTaskId, event.type === 'TASK_DELETED');
      if (event.type === 'TASK_DELETED') {
        onCloseModalIfDeleted?.();
      }
    },
    [],
  );

  useRealtimeEvent('TASK_UPDATED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_DELETED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_REORDERED', handleRealtimeModalEvent);

  return {
    scheduleRefetch,
  };
}
