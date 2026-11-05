import { useState, lazy, Suspense } from 'react';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import TaskToolbar from './components/TaskToolbar';

const KanbanBoard = lazy(() => import('./components/KanbanBoard'));
const TaskTable = lazy(() => import('./components/TaskTable'));
const TaskFormModal = lazy(() => import('./components/TaskFormModal'));
const CategoryManagerModal = lazy(() => import('./components/CategoryManagerModal'));
const CategoryPage = lazy(() => import('./components/CategoryPage'));
const DashboardPage = lazy(() => import('./components/DashboardPage'));
const AuthScreen = lazy(() => import('./components/AuthScreen'));
import { AuthProvider } from './context/AuthContext';
import { useTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import type { Task, TaskStatus } from './types/task.types';

function TaskApp() {
  const [currentNav, setCurrentNav] = useState<'dashboard' | 'tasks' | 'categories'>('dashboard');
  const {
    tasks,
    categories,
    loading,
    searchText,
    statusFilter,
    categoryFilter,
    priorityFilter,
    isFiltering,
    setSearchText,
    handleSearch,
    handleStatusChange,
    handleCategoryChange,
    handlePriorityChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
    fetchCategories,
  } = useTasks({ enabled: currentNav === 'tasks' });

  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  function handleOpenCreate() {
    if (categories.length === 0) {
      void fetchCategories();
    }
    setModalState({ open: true, task: null });
  }

  function handleOpenEdit(task: Task) {
    if (categories.length === 0) {
      void fetchCategories();
    }
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
          <>
            <TaskToolbar
              searchText={searchText}
              statusFilter={statusFilter}
              categoryFilter={categoryFilter}
              priorityFilter={priorityFilter}
              categories={categories}
              onSearchChange={setSearchText}
              onSearch={handleSearch}
              onStatusChange={handleStatusChange}
              onCategoryChange={handleCategoryChange}
              onPriorityChange={handlePriorityChange}
              onReset={handleReset}
            />

            <div style={{ marginBottom: 30 }}>
              <KanbanBoard tasks={tasks} onReorder={handleReorder} isFiltering={isFiltering} />
            </div>

            <TaskTable
              tasks={tasks}
              loading={loading}
              onEdit={handleOpenEdit}
              onDelete={(id) => void handleDelete(id)}
            />

            {categoryModalOpen && (
              <CategoryManagerModal
                open={categoryModalOpen}
                onClose={() => setCategoryModalOpen(false)}
                onChanged={() => void refetch()}
              />
            )}
          </>
        ) : (
          <CategoryPage onChanged={() => void refetch()} />
        )}

        {modalState.open && (
          <TaskFormModal
            open={modalState.open}
            task={modalState.task}
            categories={categories}
            onClose={handleCloseModal}
            onSuccess={refetch}
          />
        )}
      </Suspense>
    </AppLayout>
  );
}

function MainApp() {
  const { user, loading } = useAuth();

  if (loading) {
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

  if (!user) {
    return (
      <Suspense
        fallback={
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
        }
      >
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
