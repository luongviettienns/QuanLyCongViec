import { lazy } from 'react';
import TaskToolbar from '../components/TaskToolbar';
import type { Task, TaskStatus, StatusFilter, PriorityFilter } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';

const KanbanBoard = lazy(() => import('../components/kanban/KanbanBoard'));
const TaskTable = lazy(() => import('../components/table/TaskTable'));
const CategoryManagerModal = lazy(() => import('../../categories/components/CategoryManagerModal'));

interface TasksPageProps {
  tasks: Task[];
  categories: Category[];
  teams: Team[];
  loading: boolean;
  searchText: string;
  statusFilter: StatusFilter;
  categoryFilter: number | 'ALL';
  priorityFilter: PriorityFilter;
  teamFilter: number | 'ALL';
  scopeFilter: 'all' | 'created_by_me' | 'assigned_to_me';
  isFiltering: boolean;
  categoryModalOpen: boolean;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onCategoryChange: (catId: number | 'ALL') => void;
  onPriorityChange: (priority: PriorityFilter) => void;
  onTeamChange: (tId: number | 'ALL') => void;
  onScopeChange: (scope: 'all' | 'created_by_me' | 'assigned_to_me') => void;
  onReset: () => void;
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
  onStatusMove: (taskId: number, newStatus: TaskStatus, newPosition?: number) => Promise<void>;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onCloseCategoryModal: () => void;
  onCategoryChanged: () => void;
}

export default function TasksPage({
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
  categoryModalOpen,
  onSearchChange,
  onSearch,
  onStatusChange,
  onCategoryChange,
  onPriorityChange,
  onTeamChange,
  onScopeChange,
  onReset,
  onReorder,
  onStatusMove,
  onEdit,
  onDelete,
  onCloseCategoryModal,
  onCategoryChanged,
}: TasksPageProps) {
  return (
    <>
      <TaskToolbar
        searchText={searchText}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        priorityFilter={priorityFilter}
        teamFilter={teamFilter}
        scopeFilter={scopeFilter}
        categories={categories}
        teams={teams}
        onSearchChange={onSearchChange}
        onSearch={onSearch}
        onStatusChange={onStatusChange}
        onCategoryChange={onCategoryChange}
        onPriorityChange={onPriorityChange}
        onTeamChange={onTeamChange}
        onScopeChange={onScopeChange}
        onReset={onReset}
      />

      <div style={{ marginBottom: 30 }}>
        <KanbanBoard
          tasks={tasks}
          onReorder={onReorder}
          onStatusChange={onStatusMove}
          isFiltering={isFiltering}
        />
      </div>

      <TaskTable
        tasks={tasks}
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
      />

      {categoryModalOpen && (
        <CategoryManagerModal
          open={categoryModalOpen}
          onClose={onCloseCategoryModal}
          onChanged={onCategoryChanged}
        />
      )}
    </>
  );
}
