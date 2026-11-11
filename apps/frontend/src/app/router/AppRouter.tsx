import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spin, message } from 'antd';
import AppLayout from '../layouts/AppLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useTasks } from '../../features/tasks/hooks/useTasks';
import { getTaskById } from '../../features/tasks/api/tasks.api';
import type { Task, TaskStatus } from '../../features/tasks/types/task.types';
import type { NotificationDestination } from '../../features/notifications';
import {
  useRealtimeEvent,
  useRealtimeReconnect,
  type RealtimeEventData,
} from '../../features/realtime';

import TasksPage from '../../features/tasks/pages/TasksPage';
import CategoryPage from '../../features/categories/pages/CategoryPage';
import TeamPage from '../../features/teams/pages/TeamPage';
import DashboardPage from '../../features/dashboard/pages/DashboardPage';
import TaskFormModal from '../../features/tasks/components/TaskFormModal';
import AuthScreen from '../../features/auth/components/AuthScreen';
import { NotFoundPage, ForbiddenPage, UnauthorizedPage } from '../pages/errors';

function FullScreenSpinner() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f7fa',
      }}
    >
      <Spin size="large" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function TaskAppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  const rawPath = location.pathname.replace(/^\//, '').split('/')[0];
  const currentNav: 'dashboard' | 'tasks' | 'teams' | 'categories' =
    rawPath === 'tasks' || rawPath === 'teams' || rawPath === 'categories'
      ? rawPath
      : 'dashboard';

  const {
    tasks,
    categories,
    teams,
    loading,
    searchText,
    statusFilter,
    categoryFilter,
    priorityFilter,
    teamFilter,
    scopeFilter,
    isFiltering,
    setSearchText,
    handleSearch,
    handleStatusChange,
    handleCategoryChange,
    handlePriorityChange,
    handleTeamChange,
    handleScopeChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
    handleStatusMove,
    fetchCategories,
    fetchTeams,
  } = useTasks({ enabled: currentNav === 'tasks' });

  const { user } = useAuth();
  const [dashboardReloadCounter, setDashboardReloadCounter] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current !== null) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      if (currentNav === 'tasks') {
        void refetch();
      } else if (currentNav === 'dashboard') {
        setDashboardReloadCounter((c) => c + 1);
      }
    }, 400);
  }, [currentNav, refetch]);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current !== null) {
        clearTimeout(refetchTimerRef.current);
        refetchTimerRef.current = null;
      }
    };
  }, []);

  const handleGlobalReload = useCallback(() => {
    if (currentNav === 'dashboard') {
      setDashboardReloadCounter((c) => c + 1);
    } else {
      void refetch();
    }
  }, [currentNav, refetch]);

  const handleRealtimeTaskEvent = useCallback(
    (event: RealtimeEventData) => {
      // Bỏ qua sự kiện do chính mình thực hiện vì UI đã cập nhật lạc quan
      if (event.actorId && event.actorId === user?.id) {
        return;
      }
      scheduleRefetch();
    },
    [user?.id, scheduleRefetch],
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
    scheduleRefetch();
  }, [scheduleRefetch]);

  useRealtimeEvent('NOTIFICATION_NEW', handleRealtimeNotification);

  const [modalState, setModalState] = useState<{
    open: boolean;
    task: Task | null;
    initialTab?: 'info' | 'collaborators' | 'subtasks';
    highlightSubtaskId?: number | null;
  }>({
    open: false,
    task: null,
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

  const refreshActiveModalTask = useCallback(
    async (targetTaskId?: number, forceDeleted = false) => {
      const openTaskId = targetTaskId ?? modalTaskIdRef.current;
      if (!openTaskId || modalTaskIdRef.current !== openTaskId) {
        return;
      }
      if (forceDeleted) {
        setModalTaskOverride(null);
        setModalState({ open: false, task: null });
        message.warning('Công việc đang mở đã bị xóa.');
        void refetch();
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
          setModalTaskOverride(null);
          setModalState({ open: false, task: null });
          message.warning(
            msg || 'Công việc không còn tồn tại hoặc bạn không còn quyền truy cập.',
          );
          void refetch();
        }
      }
    },
    [refetch],
  );

  const handleRealtimeModalEvent = useCallback(
    (event: RealtimeEventData) => {
      if (event.actorId && event.actorId === user?.id && event.type !== 'TASK_DELETED') {
        return;
      }
      const openTaskId = modalTaskIdRef.current;
      if (!openTaskId) {
        return;
      }
      const payload = event.payload as { taskId?: number } | undefined;
      if (payload?.taskId !== undefined && payload.taskId !== openTaskId) {
        return;
      }
      void refreshActiveModalTask(openTaskId, event.type === 'TASK_DELETED');
    },
    [user?.id, refreshActiveModalTask],
  );

  useRealtimeEvent('TASK_UPDATED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_DELETED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeModalEvent);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeTaskEvent);
  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeModalEvent);
  useRealtimeEvent('SUBTASK_REORDERED', handleRealtimeModalEvent);

  useRealtimeReconnect(() => {
    if (modalTaskIdRef.current) {
      void refreshActiveModalTask(modalTaskIdRef.current);
    }
  });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  function ensureModalMetadataLoaded() {
    if (categories.length === 0) {
      void fetchCategories();
    }
    if (teams.length === 0) {
      void fetchTeams();
    }
  }

  function handleOpenCreate() {
    ensureModalMetadataLoaded();
    setModalState({ open: true, task: null });
  }

  function handleOpenEdit(task: Task) {
    ensureModalMetadataLoaded();
    setModalState({ open: true, task });
  }

  function handleCloseModal() {
    setModalState({ open: false, task: null });
  }

  function handleNavigateFromDashboard(status?: TaskStatus) {
    if (status) {
      handleStatusChange(status);
    }
    navigate('/tasks');
  }

  async function handleNotificationNavigate(dest: NotificationDestination) {
    if (dest.type === 'task') {
      navigate('/tasks');
      try {
        const targetTask = await getTaskById(dest.id);
        modalTaskIdRef.current = targetTask.id;
        setModalTaskOverride(targetTask);
        setModalState({
          open: true,
          task: targetTask,
          initialTab: dest.subtaskId ? 'subtasks' : 'info',
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
    } else if (dest.type === 'team') {
      navigate('/teams');
    }
  }

  return (
    <AppLayout
      onReload={handleGlobalReload}
      onCreateTask={handleOpenCreate}
      onOpenCategories={() => setCategoryModalOpen(true)}
      loading={currentNav === 'dashboard' ? dashboardLoading : loading}
      currentNav={currentNav}
      onNavChange={(key) => navigate('/' + key)}
      onNavigateNotification={handleNotificationNavigate}
    >
      <Routes>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <DashboardPage
              active={currentNav === 'dashboard'}
              refreshTrigger={dashboardReloadCounter}
              onLoadingChange={setDashboardLoading}
              onNavigateToTasks={handleNavigateFromDashboard}
              onOpenCreateTask={handleOpenCreate}
            />
          }
        />
        <Route
          path="tasks"
          element={
            <TasksPage
              tasks={tasks}
              categories={categories}
              teams={teams}
              loading={loading}
              searchText={searchText}
              statusFilter={statusFilter}
              categoryFilter={categoryFilter}
              priorityFilter={priorityFilter}
              teamFilter={teamFilter}
              scopeFilter={scopeFilter}
              isFiltering={isFiltering}
              categoryModalOpen={categoryModalOpen}
              onSearchChange={setSearchText}
              onSearch={handleSearch}
              onStatusChange={handleStatusChange}
              onCategoryChange={handleCategoryChange}
              onPriorityChange={handlePriorityChange}
              onTeamChange={handleTeamChange}
              onScopeChange={handleScopeChange}
              onReset={handleReset}
              onReorder={handleReorder}
              onStatusMove={handleStatusMove}
              onEdit={handleOpenEdit}
              onDelete={(id) => void handleDelete(id)}
              onCloseCategoryModal={() => setCategoryModalOpen(false)}
              onCategoryChanged={() => void refetch()}
            />
          }
        />
        <Route
          path="teams"
          element={<TeamPage onTeamChanged={() => void refetch()} />}
        />
        <Route
          path="categories"
          element={<CategoryPage onChanged={() => void refetch()} />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {modalState.open && (
        <TaskFormModal
          key={`${modalState.task?.id ?? 'new'}-${modalState.initialTab ?? 'info'}-${modalState.highlightSubtaskId ?? ''}`}
          open={modalState.open}
          task={activeModalTask}
          initialTab={modalState.initialTab}
          highlightSubtaskId={modalState.highlightSubtaskId}
          categories={categories}
          teams={teams}
          onClose={() => {
            modalTaskIdRef.current = null;
            setModalTaskOverride(null);
            handleCloseModal();
          }}
          onSuccess={refetch}
        />
      )}
    </AppLayout>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <AuthScreen />
          </PublicRoute>
        }
      />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="/404" element={<NotFoundPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <TaskAppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
