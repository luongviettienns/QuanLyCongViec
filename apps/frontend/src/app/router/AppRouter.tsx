import { useState, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Spin } from 'antd';
import AppLayout from '../layouts/AppLayout';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { useTasks } from '../../features/tasks/hooks/useTasks';
import { getTaskById } from '../../features/tasks/api/tasks.api';
import type { Task, TaskStatus } from '../../features/tasks/types/task.types';
import { useRealtimeEvent, type RealtimeEventData } from '../../features/realtime';

import TasksPage from '../../features/tasks/pages/TasksPage';
import CategoryPage from '../../features/categories/pages/CategoryPage';
import TeamPage from '../../features/teams/pages/TeamPage';
import DashboardPage from '../../features/dashboard/pages/DashboardPage';
import TaskFormModal from '../../features/tasks/components/TaskFormModal';
import AuthScreen from '../../features/auth/components/AuthScreen';

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

  const handleRealtimeTaskEvent = useCallback(
    (event: RealtimeEventData) => {
      // Bỏ qua sự kiện do chính mình thực hiện vì UI đã cập nhật lạc quan
      if (event.actorId && event.actorId === user?.id) {
        return;
      }
      if (currentNav === 'tasks') {
        void refetch();
      }
    },
    [user?.id, currentNav, refetch],
  );

  useRealtimeEvent('TASK_STATUS_CHANGED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_CREATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_UPDATED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_DELETED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_REORDERED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_ASSIGNED', handleRealtimeTaskEvent);
  useRealtimeEvent('TASK_RETURNED', handleRealtimeTaskEvent);

  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
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

  async function handleNotificationNavigate(dest: { type: 'task' | 'team'; id: number }) {
    if (dest.type === 'task') {
      navigate('/tasks');
      let targetTask = tasks.find((t) => t.id === dest.id);
      if (!targetTask) {
        try {
          targetTask = await getTaskById(dest.id);
        } catch {
          // Gracefully fallback: stays on tasks list if task was deleted or inaccessible
        }
      }
      if (targetTask) {
        handleOpenEdit(targetTask);
      }
    } else if (dest.type === 'team') {
      navigate('/teams');
    }
  }

  return (
    <AppLayout
      onReload={() => void refetch()}
      onCreateTask={handleOpenCreate}
      onOpenCategories={() => setCategoryModalOpen(true)}
      loading={loading}
      currentNav={currentNav}
      onNavChange={(key) => navigate('/' + key)}
      onNavigateNotification={handleNotificationNavigate}
    >
      <Routes>
        <Route
          path="dashboard"
          element={
            <DashboardPage
              active={currentNav === 'dashboard'}
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
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>

      {modalState.open && (
        <TaskFormModal
          open={modalState.open}
          task={modalState.task}
          categories={categories}
          teams={teams}
          onClose={handleCloseModal}
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
