import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from '../layouts/AppLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useTasks } from '../../features/tasks/hooks/useTasks';
import type { TaskStatus, TaskFilterPatch } from '../../features/tasks/types/task.types';
import type { NotificationDestination } from '../../features/notifications';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  loadSavedViewMode,
} from '../../features/tasks/utils/task-filter.utils';
import { useTaskModalController } from '../hooks/useTaskModalController';
import { useAppRealtimeSync } from '../hooks/useAppRealtimeSync';

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

  const { user } = useAuth();
  const [dashboardReloadCounter, setDashboardReloadCounter] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  const {
    tasks,
    trashTasks,
    trashLoading,
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
    handleReorder,
    handleStatusMove,
    fetchCategories,
    fetchTeams,
  } = useTasks({ enabled: currentNav === 'tasks' });

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
      void refetch();
    }
  }, [currentNav, handleDashboardReload, refetch]);

  const handleNavigateFromDashboard = useCallback(
    (patchOrStatus?: TaskFilterPatch | TaskStatus) => {
      if (viewMode === 'trash') {
        setViewMode(loadSavedViewMode());
      }
      let patch: TaskFilterPatch = {};
      if (typeof patchOrStatus === 'string') {
        patch = { statusFilter: patchOrStatus };
      } else if (patchOrStatus) {
        patch = patchOrStatus;
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
          setViewMode(loadSavedViewMode());
        }
        navigate('/tasks');
        await openTaskFromNotification(dest);
      } else if (dest.type === 'team') {
        navigate('/teams');
      }
    },
    [viewMode, setViewMode, navigate, openTaskFromNotification],
  );

  return (
    <AppLayout
      onReload={handleGlobalReload}
      onCreateTask={() => openCreateModal(filters.teamFilter !== 'ALL' ? filters.teamFilter : null)}
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
              teams={teams}
              active={currentNav === 'dashboard'}
              refreshTrigger={dashboardReloadCounter}
              onLoadingChange={setDashboardLoading}
              onNavigateToTasks={handleNavigateFromDashboard}
              onOpenCreateTask={openCreateModal}
            />
          }
        />
        <Route
          path="tasks"
          element={
            <TasksPage
              tasks={tasks}
              trashTasks={trashTasks}
              trashLoading={trashLoading}
              categories={categories}
              teams={teams}
              loading={loading}
              filters={filters}
              isFiltering={isFiltering}
              viewMode={viewMode}
              setViewMode={setViewMode}
              onFiltersChange={applyFilters}
              onReset={handleReset}
              onCreate={openCreateModal}
              onEdit={openEditModal}
              onDelete={(id) => void handleDelete(id)}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              onReorder={handleReorder}
              onStatusMove={handleStatusMove}
              categoryModalOpen={categoryModalOpen}
              onCloseCategoryModal={() => setCategoryModalOpen(false)}
              onCategoryChanged={() => void refetch()}
              currentUserId={user?.id}
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
          key={`${modalState.task?.id ?? 'new'}-${modalState.defaultTab ?? 'info'}-${modalState.highlightSubtaskId ?? ''}`}
          open={modalState.open}
          task={activeModalTask}
          defaultTeamId={modalState.defaultTeamId}
          initialTab={modalState.defaultTab}
          highlightSubtaskId={modalState.highlightSubtaskId}
          categories={categories}
          teams={teams}
          onClose={closeModal}
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
