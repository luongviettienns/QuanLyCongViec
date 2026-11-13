import { Segmented, Button } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  ProjectOutlined,
  TableOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import TaskToolbar from '../components/TaskToolbar';
import KanbanBoard from '../components/kanban/KanbanBoard';
import TaskTable from '../components/table/TaskTable';
import { TaskCalendarView } from '../components/calendar';
import TaskTrashView from '../components/trash/TaskTrashView';
import CategoryManagerModal from '../../categories/components/CategoryManagerModal';
import { ApiErrorFallback } from '../../../app/pages/errors';
import type {
  Task,
  TrashTask,
  TaskStatus,
  TaskFilterState,
  TaskFilterPatch,
  TaskViewMode,
  BulkTaskResult,
} from '../types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import { formatCountLabel } from '../utils/task-filter.utils.ts';
import { resolveErrorFallbackVariant } from '../utils/task-error.utils.ts';

export interface TasksPageProps {
  tasks: Task[];
  trashTasks: TrashTask[];
  trashLoading: boolean;
  tasksError?: unknown;
  trashError?: unknown;
  pendingInvitesCount?: number;
  trashCount?: number;
  categories: Category[];
  teams: Team[];
  loading: boolean;
  filters: TaskFilterState;
  isFiltering: boolean;
  viewMode: TaskViewMode;
  setViewMode?: (mode: TaskViewMode) => void;
  onViewModeChange?: (mode: TaskViewMode) => void;
  onFiltersChange: (patch: TaskFilterPatch) => void;
  onReset: () => void;
  onRetry?: () => void;
  onCreate?: (defaultTeamId?: number | null, defaultDate?: string | null) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onBulkStatusMove?: (ids: number[], status: TaskStatus) => Promise<BulkTaskResult | null | void>;
  onBulkRestore?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onBulkPermanentDelete?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onEmptyTrash?: () => Promise<BulkTaskResult | null | void>;
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
  onStatusMove: (taskId: number, newStatus: TaskStatus, newPosition?: number) => Promise<void>;
  onMoveTaskDate?: (task: Task, targetDateKey: string) => Promise<boolean | void>;
  categoryModalOpen?: boolean;
  onCloseCategoryModal?: () => void;
  onCategoryChanged?: () => void;
  currentUserId?: number;
}

export default function TasksPage({
  tasks,
  trashTasks,
  trashLoading,
  tasksError,
  trashError,
  pendingInvitesCount = 0,
  trashCount = 0,
  categories,
  teams,
  loading,
  filters,
  isFiltering,
  viewMode,
  setViewMode,
  onViewModeChange,
  onFiltersChange,
  onReset,
  onRetry,
  onCreate,
  onEdit,
  onDelete,
  onRestore,
  onPermanentDelete,
  onBulkDelete,
  onBulkStatusMove,
  onBulkRestore,
  onBulkPermanentDelete,
  onEmptyTrash,
  onReorder,
  onStatusMove,
  onMoveTaskDate,
  categoryModalOpen = false,
  onCloseCategoryModal,
  onCategoryChanged,
  currentUserId,
}: TasksPageProps) {
  const handleRetry = onRetry ?? onReset;
  const handleViewModeChange = onViewModeChange ?? setViewMode;
  const defaultCreateTeamId =
    typeof filters.teamFilter === 'number' ? filters.teamFilter : null;
  const trashFallbackVariant = resolveErrorFallbackVariant(trashError, trashTasks.length);
  const tasksFallbackVariant = resolveErrorFallbackVariant(tasksError, tasks.length);

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
          onChange={(mode) => handleViewModeChange?.(mode)}
          options={[
            { value: 'both', label: 'Cả hai', icon: <AppstoreOutlined /> },
            { value: 'kanban', label: 'Kanban', icon: <ProjectOutlined /> },
            { value: 'table', label: 'Bảng', icon: <TableOutlined /> },
            { value: 'calendar', label: 'Lịch', icon: <CalendarOutlined /> },
            {
              value: 'trash',
              label: formatCountLabel('Thùng rác', trashCount),
              icon: <DeleteOutlined />,
            },
          ]}
        />

        {viewMode !== 'trash' && onCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => onCreate(defaultCreateTeamId)}
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
        pendingInvitesCount={pendingInvitesCount}
        onFiltersChange={onFiltersChange}
        onReset={onReset}
      />

      {viewMode === 'trash' ? (
        trashFallbackVariant === 'page' ? (
          <ApiErrorFallback
            variant="page"
            error={trashError}
            onRetry={handleRetry}
            retrying={trashLoading}
            showNavigation
          />
        ) : (
          <>
            {trashFallbackVariant === 'inline' && (
              <div style={{ marginBottom: 16 }}>
                <ApiErrorFallback
                  variant="inline"
                  error={trashError}
                  onRetry={handleRetry}
                  retrying={trashLoading}
                  showNavigation={false}
                />
              </div>
            )}
            <TaskTrashView
              tasks={trashTasks}
              teams={teams}
              loading={trashLoading}
              onRestore={onRestore}
              onPermanentDelete={onPermanentDelete}
              onBulkRestore={onBulkRestore}
              onBulkPermanentDelete={onBulkPermanentDelete}
              onEmptyTrash={onEmptyTrash}
            />
          </>
        )
      ) : tasksFallbackVariant === 'page' ? (
        <ApiErrorFallback
          variant="page"
          error={tasksError}
          onRetry={handleRetry}
          retrying={loading}
          showNavigation
        />
      ) : (
        <>
          {tasksFallbackVariant === 'inline' && (
            <div style={{ marginBottom: 16 }}>
              <ApiErrorFallback
                variant="inline"
                error={tasksError}
                onRetry={handleRetry}
                retrying={loading}
                showNavigation={false}
              />
            </div>
          )}

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
              onBulkDelete={onBulkDelete}
              onBulkStatusMove={onBulkStatusMove}
            />
          )}

          {viewMode === 'calendar' && (
            <TaskCalendarView
              tasks={tasks}
              teams={teams}
              loading={loading}
              onEditTask={onEdit}
              onCreateTaskForDate={
                onCreate
                  ? (dateKey) => onCreate(defaultCreateTeamId, dateKey)
                  : undefined
              }
              onMoveTaskDate={onMoveTaskDate}
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
