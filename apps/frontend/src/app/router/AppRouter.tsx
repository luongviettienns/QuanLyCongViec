import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Spin } from 'antd';
import AppLayout, { type AppNavKey } from '../layouts/AppLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useTasks } from '../../features/tasks/hooks/useTasks';
import type {
  TaskStatus,
  TaskFilterPatch,
  TaskViewMode,
} from '../../features/tasks/types/task.types';
import type { NotificationDestination } from '../../features/notifications';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  loadSavedViewMode,
  resolveTasksRouteViewMode,
} from '../../features/tasks/utils/task-filter.utils';
import {
  resolveDashboardNavigationTarget,
  type MyTasksNavigationPreset,
} from '../../features/tasks/utils/my-tasks.utils';
import { useTaskModalController } from '../hooks/useTaskModalController';
import { useAppRealtimeSync } from '../hooks/useAppRealtimeSync';

import TasksPage from '../../features/tasks/pages/TasksPage';
import CalendarWorkspace from '../../features/calendar/pages/CalendarWorkspace';
import CategoryPage from '../../features/categories/pages/CategoryPage';
import TeamPage from '../../features/teams/pages/TeamPage';
import DashboardPage from '../../features/dashboard/pages/DashboardPage';
import TaskFormModal from '../../features/tasks/components/TaskFormModal';
import AuthScreen from '../../features/auth/components/AuthScreen';
import {
  ApiErrorFallback,
  ErrorBoundary,
  NotFoundPage,
  ForbiddenPage,
  UnauthorizedPage,
} from '../pages/errors';

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
  const { user, loading, authError, retryAuth, logout } = useAuth();

  if (loading) {
    return <FullScreenSpinner />;
  }

  if (!user && authError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f5f7fa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%' }}>
          <ApiErrorFallback
            variant="page"
            error={authError}
            onRetry={() => void retryAuth()}
            showNavigation={false}
            extraActions={<Button onClick={() => logout({ silent: true })}>Đăng nhập lại</Button>}
          />
        </div>
      </div>
    );
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
  const currentNav: AppNavKey =
    rawPath === 'tasks' ||
    rawPath === 'calendar' ||
    rawPath === 'teams' ||
    rawPath === 'categories'
      ? rawPath
      : 'dashboard';

  const { user } = useAuth();
  const [dashboardReloadCounter, setDashboardReloadCounter] = useState(0);
  const [teamReloadCounter, setTeamReloadCounter] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [myTasksPresetState, setMyTasksPresetState] = useState<{
    preset: MyTasksNavigationPreset;
    key: number;
  } | null>(null);
  const [myTasksRefreshKey, setMyTasksRefreshKey] = useState(0);

  const {
    tasks,
    trashTasks,
    trashLoading,
    tasksError,
    trashError,
    pendingInvitesCount,
    trashCount,
    categories,
    teams,
    loading,
    filters,
    isFiltering,
    viewMode,
    setViewMode,
    applyFilters,
    handleReset,
    refetch,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleBulkDelete,
    handleBulkStatusMove,
    handleBulkRestore,
    handleBulkPermanentDelete,
    handleEmptyTrash,
    handleReorder,
    handleStatusMove,
    handleUpdateTaskDate,
    fetchCategories,
    fetchTeams,
  } = useTasks({ enabled: currentNav === 'tasks' || currentNav === 'calendar' });

  const ensureMetadataLoaded = useCallback(() => {
    if (categories.length === 0) {
      void fetchCategories();
    }
    if (teams.length === 0) {
      void fetchTeams();
    }
  }, [categories.length, teams.length, fetchCategories, fetchTeams]);

  useEffect(() => {
    if (currentNav === 'dashboard') {
      ensureMetadataLoaded();
    }
  }, [currentNav, ensureMetadataLoaded]);

  useEffect(() => {
    if (currentNav === 'calendar' && viewMode === 'trash') {
      setViewMode(resolveTasksRouteViewMode(loadSavedViewMode()));
    }
  }, [currentNav, viewMode, setViewMode]);

  const handleConsumeMyTasksPreset = useCallback(() => {
    setMyTasksPresetState(null);
  }, []);

  const handleViewModeChange = useCallback(
    (nextMode: TaskViewMode) => {
      if (nextMode !== 'my_tasks') {
        setMyTasksPresetState(null);
      }
      if (nextMode === 'calendar') {
        if (viewMode === 'trash') {
          setViewMode(resolveTasksRouteViewMode(loadSavedViewMode()));
        }
        navigate('/calendar');
        return;
      }
      setViewMode(nextMode);
      if (currentNav === 'calendar') {
        navigate('/tasks');
      }
    },
    [currentNav, viewMode, setViewMode, navigate],
  );

  const {
    modalState,
    activeModalTask,
    openCreateModal,
    openEditModal,
    openTaskFromNotification,
    closeModal,
    refreshActiveModalTask,
  } = useTaskModalController({
    tasks,
    onRefetch: refetch,
    ensureMetadataLoaded,
  });

  const activeModalTaskId = modalState.open && modalState.task ? modalState.task.id : null;

  const handleDashboardReload = useCallback(() => {
    setDashboardReloadCounter((c) => c + 1);
  }, []);

  useAppRealtimeSync({
    userId: user?.id,
    currentNav,
    activeModalTaskId,
    activeModalTab: modalState.defaultTab,
    onRefetchTasks: refetch,
    onRefetchCategories: fetchCategories,
    onRefetchTeams: fetchTeams,
    onRefreshModalTask: refreshActiveModalTask,
    onCloseModalIfDeleted: closeModal,
    onDashboardReload: handleDashboardReload,
  });

  const handleGlobalReload = useCallback(() => {
    if (currentNav === 'dashboard') {
      handleDashboardReload();
    } else {
      if (currentNav === 'tasks') {
        setMyTasksRefreshKey((k) => k + 1);
      }
      void refetch();
    }
  }, [currentNav, handleDashboardReload, refetch]);

  const handleModalSuccess = useCallback(async () => {
    setMyTasksRefreshKey((k) => k + 1);
    await refetch();
  }, [refetch]);

  const handleModalDelete = useCallback(
    async (id: number) => {
      const ok = await handleDelete(id);
      if (ok) {
        setMyTasksRefreshKey((k) => k + 1);
      }
      return ok;
    },
    [handleDelete],
  );

  const handleNavigateFromDashboard = useCallback(
    (patchOrStatus?: TaskFilterPatch | TaskStatus) => {
      let patch: TaskFilterPatch = {};
      if (typeof patchOrStatus === 'string') {
        patch = { statusFilter: patchOrStatus };
      } else if (patchOrStatus) {
        patch = patchOrStatus;
      }

      const target = resolveDashboardNavigationTarget(patch);
      if (target.viewMode === 'my_tasks' && target.preset) {
        setViewMode('my_tasks');
        setMyTasksPresetState((prev) => ({
          preset: target.preset!,
          key: (prev?.key ?? 0) + 1,
        }));
        navigate('/tasks');
        return;
      }

      if (viewMode === 'trash' || viewMode === 'my_tasks') {
        setViewMode('table');
      }
      applyFilters(applyFilterPatch(createDefaultTaskFilters(), patch));
      navigate('/tasks');
    },
    [viewMode, setViewMode, applyFilters, navigate],
  );

  const handleNotificationNavigate = useCallback(
    async (dest: NotificationDestination) => {
      if (dest.type === 'task') {
        if (viewMode === 'trash') {
          setViewMode(resolveTasksRouteViewMode(loadSavedViewMode()));
        }
        navigate('/tasks');
        await openTaskFromNotification(dest);
      } else if (dest.type === 'team') {
        navigate(dest.id ? `/teams/${dest.id}` : '/teams');
      }
    },
    [viewMode, setViewMode, navigate, openTaskFromNotification],
  );

  const tasksRouteViewMode = resolveTasksRouteViewMode(viewMode);

  const renderTasksWorkspace = (activeViewMode: TaskViewMode) => (
    <TasksPage
      tasks={tasks}
      trashTasks={trashTasks}
      trashLoading={trashLoading}
      tasksError={tasksError}
      trashError={trashError}
      pendingInvitesCount={pendingInvitesCount}
      trashCount={trashCount}
      categories={categories}
      teams={teams}
      loading={loading}
      filters={filters}
      isFiltering={isFiltering}
      viewMode={activeViewMode}
      setViewMode={handleViewModeChange}
      onViewModeChange={handleViewModeChange}
      onFiltersChange={applyFilters}
      onReset={handleReset}
      onRetry={() => void refetch()}
      onCreate={openCreateModal}
      onEdit={openEditModal}
      onDelete={(id) => void handleDelete(id)}
      onRestore={handleRestore}
      onPermanentDelete={handlePermanentDelete}
      onBulkDelete={handleBulkDelete}
      onBulkStatusMove={handleBulkStatusMove}
      onBulkRestore={handleBulkRestore}
      onBulkPermanentDelete={handleBulkPermanentDelete}
      onEmptyTrash={() =>
        handleEmptyTrash(
          typeof filters.teamFilter === 'number' ? filters.teamFilter : undefined,
        )
      }
      onReorder={handleReorder}
      onStatusMove={handleStatusMove}
      onMoveTaskDate={handleUpdateTaskDate}
      categoryModalOpen={categoryModalOpen}
      onCloseCategoryModal={() => setCategoryModalOpen(false)}
      onCategoryChanged={() => void refetch()}
      currentUserId={user?.id}
      currentUser={user}
      myTasksPreset={myTasksPresetState?.preset ?? null}
      myTasksPresetKey={myTasksPresetState?.key ?? 0}
      myTasksRefreshKey={myTasksRefreshKey}
      onMyTasksPresetConsumed={handleConsumeMyTasksPreset}
    />
  );

  return (
    <AppLayout
      onReload={handleGlobalReload}
      onOpenCategories={() => setCategoryModalOpen(true)}
      loading={currentNav === 'dashboard' ? dashboardLoading : loading}
      currentNav={currentNav}
      onNavChange={(key) => navigate('/' + key)}
      onNavigateNotification={handleNotificationNavigate}
      onAiTaskMutated={() => {
        setMyTasksRefreshKey((k) => k + 1);
        void refetch();
        setDashboardReloadCounter((c) => c + 1);
        setTeamReloadCounter((c) => c + 1);
      }}
      onAiTeamMutated={() => {
        setTeamReloadCounter((c) => c + 1);
        setDashboardReloadCounter((c) => c + 1);
        void refetch();
      }}
      onOpenTaskFromAi={(taskId) => {
        if (viewMode === 'trash') {
          setViewMode(resolveTasksRouteViewMode(loadSavedViewMode()));
        }
        void openTaskFromNotification({ type: 'task', id: taskId });
      }}
    >
      <ErrorBoundary key={location.pathname} variant="page" onReset={handleGlobalReload}>
        <Routes>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="dashboard"
            element={
              <DashboardPage
                teams={teams}
                active={currentNav === 'dashboard'}
                refreshTrigger={dashboardReloadCounter}
                onLoadingChange={setDashboardLoading}
                onNavigateToTasks={handleNavigateFromDashboard}
                onOpenCreateTask={openCreateModal}
              />
            }
          />
          <Route path="tasks" element={renderTasksWorkspace(tasksRouteViewMode)} />
          <Route
            path="calendar"
            element={
              <CalendarWorkspace
                tasks={tasks}
                teams={teams}
                categories={categories}
                loading={loading}
                tasksError={tasksError}
                filters={filters}
                pendingInvitesCount={pendingInvitesCount}
                onFiltersChange={applyFilters}
                onReset={handleReset}
                onRetry={() => void refetch()}
                onCreate={openCreateModal}
                onEdit={openEditModal}
                onMoveTaskDate={handleUpdateTaskDate}
                currentUserId={user?.id}
              />
            }
          />
          <Route
            path="teams"
            element={
              <TeamPage
                refreshTrigger={teamReloadCounter}
                onTeamChanged={() => void refetch()}
              />
            }
          />
          <Route
            path="teams/:teamId"
            element={
              <TeamPage
                refreshTrigger={teamReloadCounter}
                onTeamChanged={() => void refetch()}
              />
            }
          />
          <Route
            path="categories"
            element={<CategoryPage onChanged={() => void refetch()} />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </ErrorBoundary>

      {modalState.open && (
        <TaskFormModal
          key={`${modalState.task?.id ?? 'new'}-${modalState.defaultTab ?? 'info'}-${modalState.highlightSubtaskId ?? ''}-${modalState.defaultDate ?? ''}`}
          open={modalState.open}
          task={activeModalTask}
          defaultTeamId={modalState.defaultTeamId}
          defaultDate={modalState.defaultDate}
          initialTab={modalState.defaultTab}
          highlightSubtaskId={modalState.highlightSubtaskId}
          categories={categories}
          teams={teams}
          onClose={closeModal}
          onSuccess={handleModalSuccess}
          onDelete={handleModalDelete}
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
      <Route path="/forbidden" element={<ForbiddenPage fullScreen />} />
      <Route path="/404" element={<NotFoundPage fullScreen />} />
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
