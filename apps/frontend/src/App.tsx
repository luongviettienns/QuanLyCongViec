import { useState } from 'react';
import { Spin } from 'antd';
import AppLayout from './components/AppLayout';
import KanbanBoard from './components/KanbanBoard';
import TaskToolbar from './components/TaskToolbar';
import TaskTable from './components/TaskTable';
import TaskFormModal from './components/TaskFormModal';
import AuthScreen from './components/AuthScreen';
import { AuthProvider } from './context/AuthContext';
import { useTasks } from './hooks/useTasks';
import { useAuth } from './hooks/useAuth';
import type { Task } from './types/task.types';

function TaskApp() {
  const {
    tasks,
    categories,
    loading,
    searchText,
    statusFilter,
    isFiltering,
    setSearchText,
    handleSearch,
    handleStatusChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
  } = useTasks();

  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  function handleOpenCreate() {
    setModalState({ open: true, task: null });
  }

  function handleOpenEdit(task: Task) {
    setModalState({ open: true, task });
  }

  function handleCloseModal() {
    setModalState({ open: false, task: null });
  }

  return (
    <AppLayout
      onReload={() => void refetch()}
      onCreateTask={handleOpenCreate}
      loading={loading}
    >
      <TaskToolbar
        searchText={searchText}
        statusFilter={statusFilter}
        onSearchChange={setSearchText}
        onSearch={handleSearch}
        onStatusChange={handleStatusChange}
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

      <TaskFormModal
        open={modalState.open}
        task={modalState.task}
        categories={categories}
        onClose={handleCloseModal}
        onSuccess={refetch}
      />
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
