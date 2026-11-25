import { useState } from 'react';
import { Segmented, Button, Space, Badge, Typography } from 'antd';
import {
  ProjectOutlined,
  TableOutlined,
  DeleteOutlined,
  PlusOutlined,
  TagsOutlined,
  ArrowLeftOutlined,
  SolutionOutlined,
} from '@ant-design/icons';
import TaskToolbar from '../components/TaskToolbar';
import KanbanBoard from '../components/kanban/KanbanBoard';
import TaskTable from '../components/table/TaskTable';
import TaskTrashView from '../components/trash/TaskTrashView';
import { MyTasksView } from '../components/my-tasks';
import CategoryManagerModal from '../../categories/components/CategoryManagerModal';
import { ApiErrorFallback } from '../../../app/pages/errors';
import type {
  Task,
  TrashTask,
  TaskStatus,
  TaskFilterState,
  TaskFilterPatch,
  TaskViewMode,
  TaskModalTab,
  BulkTaskResult,
} from '../types/task.types.ts';
import type { MyTasksNavigationPreset } from '../utils/my-tasks.utils.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import type { User } from '../../auth/types/auth.types.ts';
import { resolveErrorFallbackVariant } from '../utils/task-error.utils.ts';

const { Title, Text } = Typography;

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
  onEdit: (task: Task, defaultTab?: TaskModalTab) => void;
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
  currentUser?: User | null;
  myTasksPreset?: MyTasksNavigationPreset | null;
  myTasksPresetKey?: number;
  myTasksRefreshKey?: number;
  onMyTasksPresetConsumed?: () => void;
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
  categoryModalOpen = false,
  onCloseCategoryModal,
  onCategoryChanged,
  currentUserId,
  currentUser = null,
  myTasksPreset = null,
  myTasksPresetKey = 0,
  myTasksRefreshKey = 0,
  onMyTasksPresetConsumed,
}: TasksPageProps) {
  const [internalCategoryModalOpen, setInternalCategoryModalOpen] = useState(false);
  const isCatModalOpen = categoryModalOpen || internalCategoryModalOpen;

  const handleRetry = onRetry ?? onReset;
  const handleViewModeChange = onViewModeChange ?? setViewMode;
  const isMyTasksView = viewMode === 'my_tasks';
  const defaultCreateTeamId =
    !isMyTasksView && typeof filters.teamFilter === 'number' ? filters.teamFilter : null;
  const trashFallbackVariant = resolveErrorFallbackVariant(trashError, trashTasks.length);
  const tasksFallbackVariant = resolveErrorFallbackVariant(tasksError, tasks.length);

  const segmentedMode: TaskViewMode =
    viewMode === 'kanban' ? 'kanban' : viewMode === 'table' ? 'table' : 'my_tasks';

  return (
    <>
      {isMyTasksView && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <Title level={4} style={{ margin: '0 0 2px 0', color: '#1f1f1f' }}>
              Việc của tôi
            </Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Tập trung vào công việc cá nhân, việc được giao và đầu việc con cần xử lý
            </Text>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
          minWidth: 0,
        }}
      >
        <div
          style={{
            minWidth: 0,
            maxWidth: '100%',
            overflowX: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {viewMode === 'trash' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => handleViewModeChange?.('my_tasks')}
              >
                Quay lại danh sách việc
              </Button>
              <span style={{ fontWeight: 600, fontSize: 16, color: '#ff4d4f' }}>
                <DeleteOutlined /> Thùng rác ({trashCount})
              </span>
            </div>
          ) : (
            <Segmented<TaskViewMode>
              value={segmentedMode}
              onChange={(mode) => handleViewModeChange?.(mode)}
              options={[
                { value: 'my_tasks', label: 'Việc của tôi', icon: <SolutionOutlined /> },
                { value: 'table', label: 'Bảng', icon: <TableOutlined /> },
                { value: 'kanban', label: 'Kanban', icon: <ProjectOutlined /> },
              ]}
            />
          )}
        </div>

        <Space wrap>
          {viewMode !== 'trash' ? (
            <>
              <Button
                icon={<TagsOutlined />}
                onClick={() => setInternalCategoryModalOpen(true)}
              >
                Danh mục
              </Button>

              <Badge count={trashCount} size="small" offset={[-2, 2]}>
                <Button
                  icon={<DeleteOutlined />}
                  onClick={() => handleViewModeChange?.('trash')}
                >
                  Thùng rác
                </Button>
              </Badge>

              {onCreate && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => onCreate(defaultCreateTeamId)}
                >
                  {isMyTasksView ? 'Tạo công việc' : 'Thêm công việc'}
                </Button>
              )}
            </>
          ) : (
            onEmptyTrash && trashTasks.length > 0 && (
              <Button danger onClick={onEmptyTrash}>
                Dọn sạch thùng rác
              </Button>
            )
          )}
        </Space>
      </div>

      {!isMyTasksView && (
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
      )}

      {isMyTasksView ? (
        <MyTasksView
          teams={teams}
          currentUser={currentUser}
          initialPreset={myTasksPreset}
          presetKey={myTasksPresetKey}
          refreshKey={myTasksRefreshKey}
          onPresetConsumed={onMyTasksPresetConsumed}
          onOpenFullModal={onEdit}
          onCreateTask={onCreate ? () => onCreate(null) : undefined}
          onExternalSync={onRetry}
        />
      ) : viewMode === 'trash' ? (
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

          {viewMode === 'kanban' ? (
            <KanbanBoard
              tasks={tasks}
              teams={teams}
              onReorder={onReorder}
              onStatusChange={onStatusMove}
              onEdit={onEdit}
              isFiltering={isFiltering}
            />
          ) : (
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
        </>
      )}

      {isCatModalOpen && (
        <CategoryManagerModal
          open={isCatModalOpen}
          onClose={() => {
            setInternalCategoryModalOpen(false);
            onCloseCategoryModal?.();
          }}
          onChanged={() => {
            onCategoryChanged?.();
          }}
        />
      )}
    </>
  );
}
