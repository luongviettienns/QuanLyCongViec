import { Segmented, Button } from 'antd';
import {
  AppstoreOutlined,
  ProjectOutlined,
  TableOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import TaskToolbar from '../components/TaskToolbar';
import KanbanBoard from '../components/kanban/KanbanBoard';
import TaskTable from '../components/table/TaskTable';
import TaskTrashView from '../components/trash/TaskTrashView';
import CategoryManagerModal from '../../categories/components/CategoryManagerModal';
import type {
  Task,
  TrashTask,
  TaskStatus,
  TaskFilterState,
  TaskFilterPatch,
  TaskViewMode,
} from '../types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';

export interface TasksPageProps {
  tasks: Task[];
  trashTasks: TrashTask[];
  trashLoading: boolean;
  categories: Category[];
  teams: Team[];
  loading: boolean;
  filters: TaskFilterState;
  isFiltering: boolean;
  viewMode: TaskViewMode;
  setViewMode: (mode: TaskViewMode) => void;
  onFiltersChange: (patch: TaskFilterPatch) => void;
  onReset: () => void;
  onCreate?: (defaultTeamId?: number | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
  onStatusMove: (taskId: number, newStatus: TaskStatus, newPosition?: number) => Promise<void>;
  categoryModalOpen?: boolean;
  onCloseCategoryModal?: () => void;
  onCategoryChanged?: () => void;
  currentUserId?: number;
}

export default function TasksPage({
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
  onFiltersChange,
  onReset,
  onCreate,
  onEdit,
  onDelete,
  onRestore,
  onPermanentDelete,
  onReorder,
  onStatusMove,
  categoryModalOpen = false,
  onCloseCategoryModal,
  onCategoryChanged,
  currentUserId,
}: TasksPageProps) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Segmented<TaskViewMode>
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'both', label: 'Cả hai', icon: <AppstoreOutlined /> },
            { value: 'kanban', label: 'Kanban', icon: <ProjectOutlined /> },
            { value: 'table', label: 'Bảng', icon: <TableOutlined /> },
            { value: 'trash', label: 'Thùng rác', icon: <DeleteOutlined /> },
          ]}
        />

        {viewMode !== 'trash' && onCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() =>
              onCreate(filters.teamFilter !== 'ALL' ? filters.teamFilter : null)
            }
          >
            Thêm công việc
          </Button>
        )}
      </div>

      <TaskToolbar
        filters={filters}
        viewMode={viewMode}
        categories={categories}
        teams={teams}
        currentUserId={currentUserId}
        onFiltersChange={onFiltersChange}
        onReset={onReset}
      />

      {viewMode === 'trash' ? (
        <TaskTrashView
          tasks={trashTasks}
          teams={teams}
          loading={trashLoading}
          onRestore={onRestore}
          onPermanentDelete={onPermanentDelete}
        />
      ) : (
        <>
          {(viewMode === 'both' || viewMode === 'kanban') && (
            <div style={{ marginBottom: viewMode === 'both' ? 30 : 0 }}>
              <KanbanBoard
                tasks={tasks}
                teams={teams}
                onReorder={onReorder}
                onStatusChange={onStatusMove}
                onEdit={onEdit}
                isFiltering={isFiltering}
              />
            </div>
          )}

          {(viewMode === 'both' || viewMode === 'table') && (
            <TaskTable
              tasks={tasks}
              teams={teams}
              loading={loading}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          )}
        </>
      )}

      {categoryModalOpen && onCloseCategoryModal && onCategoryChanged && (
        <CategoryManagerModal
          open={categoryModalOpen}
          onClose={onCloseCategoryModal}
          onChanged={onCategoryChanged}
        />
      )}
    </>
  );
}
