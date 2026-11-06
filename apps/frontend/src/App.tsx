import { useState, lazy, Suspense } from 'react';
import { Spin } from 'antd';
import AppLayout from './app/layouts/AppLayout';
import { AuthProvider } from './features/auth/context/AuthContext';
import { useAuth } from './features/auth/hooks/useAuth';
import { useTasks } from './features/tasks/hooks/useTasks';
import type { Task, TaskStatus } from './features/tasks/types/task.types';

const TasksPage = lazy(() => import('./features/tasks/pages/TasksPage'));
const TaskFormModal = lazy(() => import('./features/tasks/components/TaskFormModal'));
const CategoryPage = lazy(() => import('./features/categories/pages/CategoryPage'));
const TeamPage = lazy(() => import('./features/teams/pages/TeamPage'));
const DashboardPage = lazy(() => import('./features/dashboard/pages/DashboardPage'));
const AuthScreen = lazy(() => import('./features/auth/components/AuthScreen'));

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
  } = useTasks({ enabled: currentNav === 'tasks' });

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

  return (
    <AppLayout
      onReload={() => void refetch()}
      onCreateTask={handleOpenCreate}
      onOpenCategories={() => setCategoryModalOpen(true)}
      loading={loading}
      currentNav={currentNav}
      onNavChange={setCurrentNav}
    >
      <Suspense
        fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
            <Spin size="large" />
          </div>
        }
      >
        {currentNav === 'dashboard' ? (
          <DashboardPage
            onNavigateToTasks={handleNavigateFromDashboard}
            onOpenCreateTask={handleOpenCreate}
          />
        ) : currentNav === 'tasks' ? (
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
        ) : currentNav === 'teams' ? (
          <TeamPage onTeamChanged={() => void refetch()} />
        ) : (
          <CategoryPage onChanged={() => void refetch()} />
        )}

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
      </Suspense>
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
    return (
      <Suspense fallback={<FullScreenSpinner />}>
        <AuthScreen />
      </Suspense>
    );
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
