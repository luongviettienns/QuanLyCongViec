import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { message } from 'antd';
import type {
  Subtask,
  Task,
  TaskPriority,
  TaskStatus,
} from '../types/task.types';
import type { Team } from '../../teams/types/team.types';
import type { User } from '../../auth/types/auth.types';
import {
  createTask,
  getTasks,
  returnTask,
  updateTaskContent,
  updateTaskStatus,
} from '../api/tasks.api';
import { useRealtimeEvent, useRealtimeReconnect, type RealtimeEventData } from '../../realtime';
import { getFriendlyErrorMessage } from '../../../shared/api';
import { shouldClearTaskListOnError, shouldIgnoreTaskApiError } from '../utils/task-error.utils';
import { canTransitionTask } from '../utils/task-permission.utils';
import {
  computeMyTasksStats,
  createDefaultMyTasksFilterState,
  filterAndSortMyTasks,
  selectMyTasksStatusTab,
  toggleMyTasksDeadlineCard,
  type MyTaskDeadlineCardKey,
  type MyTaskRoleFilter,
  type MyTasksFilterState,
  type MyTasksNavigationPreset,
  type MyTaskSortKey,
  type MyTaskStatusTab,
} from '../utils/my-tasks.utils';

export type MyTaskDetailFocus = 'overview' | 'checklist';

export interface UseMyTasksOptions {
  enabled: boolean;
  user: User | null;
  teams: Team[];
  initialPreset?: MyTasksNavigationPreset | null;
  presetKey?: number;
  refreshKey?: number;
  onPresetConsumed?: () => void;
  onExternalSync?: () => void;
}

export function useMyTasks({
  enabled,
  user,
  teams,
  initialPreset = null,
  presetKey = 0,
  refreshKey = 0,
  onPresetConsumed,
  onExternalSync,
}: UseMyTasksOptions) {
  const [allMyTasks, setAllMyTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [creatingQuick, setCreatingQuick] = useState(false);

  const [filterState, setFilterState] = useState<MyTasksFilterState>(() =>
    createDefaultMyTasksFilterState(initialPreset),
  );
  const [appliedPresetKey, setAppliedPresetKey] = useState(presetKey);
  if (presetKey !== appliedPresetKey) {
    setAppliedPresetKey(presetKey);
    if (initialPreset) {
      setFilterState(createDefaultMyTasksFilterState(initialPreset));
    }
  }

  useEffect(() => {
    if (initialPreset) {
      onPresetConsumed?.();
    }
  }, [initialPreset, presetKey, onPresetConsumed]);

  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [detailFocusSection, setDetailFocusSection] = useState<MyTaskDetailFocus>('overview');
  const [detailFocusVersion, setDetailFocusVersion] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksRef = useRef<Task[]>([]);
  const teamsRef = useRef<Team[]>(teams);
  const userRef = useRef<User | null>(user);
  const enabledRef = useRef<boolean>(enabled);
  const onExternalSyncRef = useRef<(() => void) | undefined>(onExternalSync);

  useEffect(() => {
    tasksRef.current = allMyTasks;
  }, [allMyTasks]);

  useEffect(() => {
    teamsRef.current = teams;
  }, [teams]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onExternalSyncRef.current = onExternalSync;
  }, [onExternalSync]);

  const fetchMyTasks = useCallback(async (opts?: { silent?: boolean }) => {
    if (!enabledRef.current || !userRef.current) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (!opts?.silent) {
      setLoading(true);
    }

    try {
      const data = await getTasks({ scope: 'my_work' }, controller.signal);
      if (abortControllerRef.current !== controller) {
        return;
      }
      tasksRef.current = data;
      setAllMyTasks(data);
      setError(null);
      setSelectedTaskId((currentId) =>
        currentId !== null && data.some((t) => t.id === currentId) ? currentId : null,
      );
    } catch (err: unknown) {
      if (shouldIgnoreTaskApiError(err)) {
        return;
      }
      if (abortControllerRef.current !== controller) {
        return;
      }
      if (shouldClearTaskListOnError(err)) {
        tasksRef.current = [];
        setAllMyTasks([]);
      }
      setError(err);
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function sync() {
      await Promise.resolve();
      if (!active) return;

      if (!enabled || !user) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        if (!user) {
          tasksRef.current = [];
          setAllMyTasks([]);
          setSelectedTaskId(null);
          setError(null);
        }
        return;
      }

      const silent = tasksRef.current.length > 0 && refreshKey > 0;
      void fetchMyTasks({ silent });
    }

    void sync();

    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [enabled, user, refreshKey, fetchMyTasks]);

  const scheduleSilentRefresh = useCallback(() => {
    if (!enabledRef.current || !userRef.current) {
      return;
    }
    if (realtimeTimerRef.current !== null) {
      clearTimeout(realtimeTimerRef.current);
    }
    realtimeTimerRef.current = setTimeout(() => {
      realtimeTimerRef.current = null;
      void fetchMyTasks({ silent: true });
    }, 350);
  }, [fetchMyTasks]);

  useEffect(() => {
    return () => {
      if (realtimeTimerRef.current !== null) {
        clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
    };
  }, []);

  const handleRealtimeChange = useCallback(
    (event: RealtimeEventData) => {
      if (!enabledRef.current || !userRef.current) {
        return;
      }
      if (event.actorId && event.actorId === userRef.current.id && event.type !== 'TASK_DELETED') {
        return;
      }
      scheduleSilentRefresh();
    },
    [scheduleSilentRefresh],
  );

  useRealtimeEvent('TASK_CREATED', handleRealtimeChange);
  useRealtimeEvent('TASK_UPDATED', handleRealtimeChange);
  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeChange);
  useRealtimeEvent('TASK_DELETED', handleRealtimeChange);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeChange);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeChange);
  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeChange);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeChange);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeChange);
  useRealtimeEvent('SUBTASK_REORDERED', handleRealtimeChange);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeChange);

  useRealtimeReconnect(() => {
    if (enabledRef.current && userRef.current) {
      void fetchMyTasks({ silent: true });
    }
  });

  const stats = useMemo(() => computeMyTasksStats(allMyTasks), [allMyTasks]);

  const visibleTasks = useMemo(
    () => filterAndSortMyTasks(allMyTasks, filterState, user?.id),
    [allMyTasks, filterState, user?.id],
  );

  const selectedTask = useMemo(
    () => (selectedTaskId !== null ? allMyTasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [allMyTasks, selectedTaskId],
  );

  const hasActiveFilters = useMemo(
    () =>
      filterState.searchText.trim().length > 0 ||
      filterState.statusTab !== 'ALL' ||
      filterState.deadlineCard !== null ||
      filterState.roleFilter !== 'all' ||
      filterState.sortBy !== 'smart_deadline',
    [filterState],
  );

  const setSearchText = useCallback((searchText: string) => {
    setFilterState((prev) => ({ ...prev, searchText }));
  }, []);

  const setRoleFilter = useCallback((roleFilter: MyTaskRoleFilter) => {
    setFilterState((prev) => ({ ...prev, roleFilter }));
  }, []);

  const setSortBy = useCallback((sortBy: MyTaskSortKey) => {
    setFilterState((prev) => ({ ...prev, sortBy }));
  }, []);

  const selectStatusTab = useCallback((tab: MyTaskStatusTab) => {
    setFilterState((prev) => selectMyTasksStatusTab(prev, tab));
  }, []);

  const toggleDeadlineCard = useCallback((card: MyTaskDeadlineCardKey) => {
    setFilterState((prev) => toggleMyTasksDeadlineCard(prev, card));
  }, []);

  const resetFilters = useCallback(() => {
    setFilterState(createDefaultMyTasksFilterState());
  }, []);

  const selectTask = useCallback(
    (taskId: number | null, focus: MyTaskDetailFocus = 'overview') => {
      setSelectedTaskId(taskId);
      setDetailFocusSection(focus);
      if (taskId !== null) {
        setDetailFocusVersion((v) => v + 1);
      }
    },
    [],
  );

  const updateTaskStatusQuick = useCallback(
    async (taskId: number, nextStatus: TaskStatus): Promise<boolean> => {
      const currentUser = userRef.current;
      const targetTask = tasksRef.current.find((t) => t.id === taskId);
      if (!currentUser || !targetTask || targetTask.status === nextStatus) {
        return false;
      }

      const taskTeam = targetTask.teamId
        ? teamsRef.current.find((t) => t.id === targetTask.teamId) ?? null
        : null;

      if (!canTransitionTask(currentUser, targetTask, nextStatus, taskTeam)) {
        if (targetTask.status === 'TODO' && nextStatus === 'DONE') {
          message.warning('Người thực hiện cần chuyển qua "Đang làm" trước khi Hoàn thành.');
        } else if (targetTask.status === 'DONE') {
          message.warning('Chỉ người tạo hoặc quản trị viên mới có thể mở lại công việc đã hoàn thành.');
        } else {
          message.warning('Bạn không có quyền thay đổi trạng thái công việc này.');
        }
        return false;
      }

      const prevTasks = tasksRef.current;
      const optimistic = prevTasks.map((t) =>
        t.id === taskId ? { ...t, status: nextStatus } : t,
      );
      tasksRef.current = optimistic;
      setAllMyTasks(optimistic);

      try {
        const updated = await updateTaskStatus(taskId, nextStatus);
        setAllMyTasks((curr) => {
          const merged = curr.map((t) => (t.id === taskId ? { ...t, ...updated } : t));
          tasksRef.current = merged;
          return merged;
        });
        onExternalSyncRef.current?.();
        return true;
      } catch (err: unknown) {
        tasksRef.current = prevTasks;
        setAllMyTasks(prevTasks);
        if (!shouldIgnoreTaskApiError(err)) {
          message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật trạng thái công việc'));
        }
        return false;
      }
    },
    [],
  );

  const updateTaskFieldQuick = useCallback(
    async (
      taskId: number,
      patch: { priority?: TaskPriority; dueDate?: string | null },
    ): Promise<boolean> => {
      const prevTasks = tasksRef.current;
      const optimistic = prevTasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t));
      tasksRef.current = optimistic;
      setAllMyTasks(optimistic);

      try {
        const updated = await updateTaskContent(taskId, patch);
        setAllMyTasks((curr) => {
          const merged = curr.map((t) => (t.id === taskId ? { ...t, ...updated } : t));
          tasksRef.current = merged;
          return merged;
        });
        onExternalSyncRef.current?.();
        return true;
      } catch (err: unknown) {
        tasksRef.current = prevTasks;
        setAllMyTasks(prevTasks);
        if (!shouldIgnoreTaskApiError(err)) {
          message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật thông tin công việc'));
        }
        return false;
      }
    },
    [],
  );

  const returnTaskQuick = useCallback(
    async (taskId: number, reason: string): Promise<boolean> => {
      try {
        await returnTask(taskId, reason);
        message.success('Đã trả lại công việc cho người giao');
        await fetchMyTasks({ silent: true });
        onExternalSyncRef.current?.();
        return true;
      } catch (err: unknown) {
        if (!shouldIgnoreTaskApiError(err)) {
          message.error(getFriendlyErrorMessage(err, 'Không thể trả lại công việc'));
        }
        return false;
      }
    },
    [fetchMyTasks],
  );

  const syncTaskSubtasks = useCallback((taskId: number, subtasks: Subtask[]) => {
    setAllMyTasks((curr) => {
      const next = curr.map((t) => (t.id === taskId ? { ...t, subtasks } : t));
      tasksRef.current = next;
      return next;
    });
    onExternalSyncRef.current?.();
  }, []);

  const quickCreateTask = useCallback(
    async (input: {
      title: string;
      dueDate?: string | null;
      priority?: TaskPriority;
    }): Promise<boolean> => {
      const currentUser = userRef.current;
      if (!currentUser) return false;
      const trimmedTitle = input.title.trim();
      if (trimmedTitle.length < 3) {
        message.warning('Tiêu đề công việc cần ít nhất 3 ký tự');
        return false;
      }

      setCreatingQuick(true);
      try {
        const created = await createTask({
          title: trimmedTitle,
          priority: input.priority ?? 'MEDIUM',
          dueDate: input.dueDate ?? null,
          assigneeId: currentUser.id,
        });
        setAllMyTasks((curr) => {
          const next = [created, ...curr.filter((t) => t.id !== created.id)];
          tasksRef.current = next;
          return next;
        });
        message.success('Đã tạo công việc cá nhân mới');
        onExternalSyncRef.current?.();
        return true;
      } catch (err: unknown) {
        if (!shouldIgnoreTaskApiError(err)) {
          message.error(getFriendlyErrorMessage(err, 'Không thể tạo công việc nhanh'));
        }
        return false;
      } finally {
        setCreatingQuick(false);
      }
    },
    [],
  );

  return {
    allMyTasks,
    visibleTasks,
    stats,
    loading,
    error,
    creatingQuick,
    filterState,
    hasActiveFilters,
    selectedTask,
    selectedTaskId,
    detailFocusSection,
    detailFocusVersion,
    setSearchText,
    setRoleFilter,
    setSortBy,
    selectStatusTab,
    toggleDeadlineCard,
    resetFilters,
    selectTask,
    refresh: fetchMyTasks,
    quickCreateTask,
    updateTaskStatusQuick,
    updateTaskFieldQuick,
    returnTaskQuick,
    syncTaskSubtasks,
  };
}
