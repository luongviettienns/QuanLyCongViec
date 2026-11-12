import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { message } from 'antd';
import type { Task } from '../../features/tasks/types/task.types';
import type { NotificationDestination } from '../../features/notifications';
import { getTaskById } from '../../features/tasks/api/tasks.api';
import { useRealtimeReconnect } from '../../features/realtime';

export type TaskModalTab = 'info' | 'collaborators' | 'subtasks';

export interface TaskModalState {
  open: boolean;
  task: Task | null;
  defaultTab?: TaskModalTab;
  initialTab?: TaskModalTab;
  defaultTeamId?: number | null;
  highlightSubtaskId?: number | null;
}

export interface UseTaskModalControllerOptions {
  tasks: Task[];
  onRefetch?: () => Promise<void> | void;
  ensureMetadataLoaded?: () => void;
}

export function useTaskModalController(options: UseTaskModalControllerOptions) {
  const { tasks, onRefetch, ensureMetadataLoaded } = options;

  const [modalState, setModalState] = useState<TaskModalState>({
    open: false,
    task: null,
    defaultTab: 'info',
    initialTab: 'info',
    defaultTeamId: null,
    highlightSubtaskId: null,
  });

  const [modalTaskOverride, setModalTaskOverride] = useState<Task | null>(null);
  const modalTaskIdRef = useRef<number | null>(null);

  useEffect(() => {
    modalTaskIdRef.current = modalState.open && modalState.task ? modalState.task.id : null;
  }, [modalState.open, modalState.task]);

  const activeModalTask = useMemo(() => {
    if (!modalState.open || !modalState.task) return null;
    const baseTask = tasks.find((t) => t.id === modalState.task?.id) ?? modalState.task;
    if (modalTaskOverride && modalTaskOverride.id === modalState.task.id) {
      if (!baseTask.updatedAt || !modalTaskOverride.updatedAt) {
        return modalTaskOverride;
      }
      return new Date(modalTaskOverride.updatedAt).getTime() >=
        new Date(baseTask.updatedAt).getTime()
        ? modalTaskOverride
        : baseTask;
    }
    return baseTask;
  }, [modalState.open, modalState.task, tasks, modalTaskOverride]);

  const closeModal = useCallback(() => {
    modalTaskIdRef.current = null;
    setModalTaskOverride(null);
    setModalState({
      open: false,
      task: null,
      defaultTab: 'info',
      initialTab: 'info',
      defaultTeamId: null,
      highlightSubtaskId: null,
    });
  }, []);

  const openCreateModal = useCallback(
    (defaultTeamId?: number | null) => {
      ensureMetadataLoaded?.();
      modalTaskIdRef.current = null;
      setModalTaskOverride(null);
      setModalState({
        open: true,
        task: null,
        defaultTab: 'info',
        initialTab: 'info',
        defaultTeamId: defaultTeamId ?? null,
        highlightSubtaskId: null,
      });
    },
    [ensureMetadataLoaded],
  );

  const openEditModal = useCallback(
    (task: Task, defaultTab: TaskModalTab = 'info') => {
      ensureMetadataLoaded?.();
      modalTaskIdRef.current = task.id;
      setModalTaskOverride(null);
      setModalState({
        open: true,
        task,
        defaultTab,
        initialTab: defaultTab,
        defaultTeamId: task.teamId ?? null,
        highlightSubtaskId: null,
      });
    },
    [ensureMetadataLoaded],
  );

  const refreshActiveModalTask = useCallback(
    async (targetTaskId?: number, forceDeleted = false) => {
      const openTaskId = targetTaskId ?? modalTaskIdRef.current;
      if (!openTaskId || modalTaskIdRef.current !== openTaskId) {
        return;
      }
      if (forceDeleted) {
        modalTaskIdRef.current = null;
        setModalTaskOverride(null);
        setModalState({
          open: false,
          task: null,
          defaultTab: 'info',
          initialTab: 'info',
          defaultTeamId: null,
          highlightSubtaskId: null,
        });
        message.warning('Công việc đang mở đã bị xóa.');
        void onRefetch?.();
        return;
      }
      try {
        const freshTask = await getTaskById(openTaskId);
        if (modalTaskIdRef.current !== openTaskId) {
          return;
        }
        setModalTaskOverride(freshTask);
      } catch (err: unknown) {
        if (modalTaskIdRef.current !== openTaskId) {
          return;
        }
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || err.name === 'UnauthorizedError')
        ) {
          return;
        }
        const status = (err as { status?: number })?.status;
        const msg = err instanceof Error ? err.message : '';
        if (
          status === 403 ||
          status === 404 ||
          /không tìm thấy|không tồn tại|không có quyền|not found|forbidden/i.test(msg)
        ) {
          modalTaskIdRef.current = null;
          setModalTaskOverride(null);
          setModalState({
            open: false,
            task: null,
            defaultTab: 'info',
            initialTab: 'info',
            defaultTeamId: null,
            highlightSubtaskId: null,
          });
          message.warning(
            msg || 'Công việc không còn tồn tại hoặc bạn không còn quyền truy cập.',
          );
          void onRefetch?.();
        }
      }
    },
    [onRefetch],
  );

  const openTaskFromNotification = useCallback(
    async (dest: NotificationDestination) => {
      if (dest.type !== 'task') return;
      try {
        const targetTask = await getTaskById(dest.id);
        modalTaskIdRef.current = targetTask.id;
        setModalTaskOverride(targetTask);
        const targetTab: TaskModalTab = dest.targetTab ?? (dest.subtaskId ? 'subtasks' : 'info');
        setModalState({
          open: true,
          task: targetTask,
          defaultTab: targetTab,
          initialTab: targetTab,
          defaultTeamId: targetTask.teamId ?? null,
          highlightSubtaskId: dest.subtaskId ?? null,
        });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || err.name === 'UnauthorizedError')
        ) {
          return;
        }
        message.error(
          err instanceof Error
            ? err.message
            : 'Công việc không còn tồn tại hoặc bạn không có quyền truy cập.',
        );
      }
    },
    [],
  );

  useRealtimeReconnect(() => {
    if (modalTaskIdRef.current) {
      void refreshActiveModalTask(modalTaskIdRef.current);
    }
  });

  return {
    modalState,
    activeModalTask,
    openCreateModal,
    openEditModal,
    openTaskFromNotification,
    closeModal,
    refreshActiveModalTask,
  };
}
