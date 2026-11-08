import { useState } from 'react';
import { Spin } from 'antd';
import AppLayout from './app/layouts/AppLayout';
import { AuthProvider } from './features/auth/context/AuthContext';
import { useAuth } from './features/auth/hooks/useAuth';
import { useTasks } from './features/tasks/hooks/useTasks';
import { getTaskById } from './features/tasks/api/tasks.api';
import type { Task, TaskStatus } from './features/tasks/types/task.types';

import TasksPage from './features/tasks/pages/TasksPage';
import CategoryPage from './features/categories/pages/CategoryPage';
import TeamPage from './features/teams/pages/TeamPage';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import TaskFormModal from './features/tasks/components/TaskFormModal';
import AuthScreen from './features/auth/components/AuthScreen';

function TaskApp() {
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'tasks' | 'teams' | 'categories'>('dashboard');
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
  } = useTasks();

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
    setCurrentNav('tasks');
  }

  async function handleNotificationNavigate(dest: { type: 'task' | 'team'; id: number }) {
    if (dest.type === 'task') {
      setCurrentNav('tasks');
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
      setCurrentNav('teams');
    }
  }

  return (
    <AppLayout
      onReload={() => void refetch()}
      onCreateTask={handleOpenCreate}
      onOpenCategories={() => setCategoryModalOpen(true)}
      loading={loading}
      currentNav={currentNav}
      onNavChange={setCurrentNav}
      onNavigateNotification={handleNotificationNavigate}
    >
      <div style={{ display: currentNav === 'dashboard' ? 'block' : 'none' }}>
        <DashboardPage
          active={currentNav === 'dashboard'}
          onNavigateToTasks={handleNavigateFromDashboard}
          onOpenCreateTask={handleOpenCreate}
        />
      </div>

      <div style={{ display: currentNav === 'tasks' ? 'block' : 'none' }}>
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
      </div>

      <div style={{ display: currentNav === 'teams' ? 'block' : 'none' }}>
        <TeamPage onTeamChanged={() => void refetch()} />
      </div>

      <div style={{ display: currentNav === 'categories' ? 'block' : 'none' }}>
        <CategoryPage onChanged={() => void refetch()} />
      </div>

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

function MainApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenSpinner />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <TaskApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
