import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { TaskCalendarView } from '../../tasks/components/calendar';
import TaskToolbar from '../../tasks/components/TaskToolbar';
import { ApiErrorFallback } from '../../../app/pages/errors';
import type {
  Task,
  TaskFilterState,
  TaskFilterPatch,
} from '../../tasks/types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import { resolveErrorFallbackVariant } from '../../tasks/utils/task-error.utils.ts';
import { getVietnamTodayKey } from '../../tasks/utils/calendar-date.utils.ts';

export interface CalendarWorkspaceProps {
  tasks: Task[];
  teams: Team[];
  categories: Category[];
  loading: boolean;
  tasksError?: unknown;
  filters: TaskFilterState;
  pendingInvitesCount?: number;
  onFiltersChange: (patch: TaskFilterPatch) => void;
  onReset: () => void;
  onRetry?: () => void;
  onCreate?: (defaultTeamId?: number | null, defaultDate?: string | null) => void;
  onEdit: (task: Task) => void;
  onMoveTaskDate?: (task: Task, targetDateKey: string) => Promise<boolean | void>;
  currentUserId?: number;
}

export default function CalendarWorkspace({
  tasks,
  teams,
  categories,
  loading,
  tasksError,
  filters,
  pendingInvitesCount = 0,
  onFiltersChange,
  onReset,
  onRetry,
  onCreate,
  onEdit,
  onMoveTaskDate,
  currentUserId,
}: CalendarWorkspaceProps) {
  const handleRetry = onRetry ?? onReset;
  const defaultCreateTeamId =
    typeof filters.teamFilter === 'number' ? filters.teamFilter : null;
  const tasksFallbackVariant = resolveErrorFallbackVariant(tasksError, tasks.length);
  const todayKey = getVietnamTodayKey();

  return (
    <div>
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
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1f1f1f' }}>
            Lịch công việc
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#8c8c8c', fontSize: 13 }}>
            Theo dõi kế hoạch, thời hạn và khối lượng công việc theo thời gian
          </p>
        </div>

        {onCreate && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => onCreate(defaultCreateTeamId, todayKey)}
          >
            Thêm công việc
          </Button>
        )}
      </div>

      <TaskToolbar
        filters={filters}
        viewMode="calendar"
        categories={categories}
        teams={teams}
        currentUserId={currentUserId}
        pendingInvitesCount={pendingInvitesCount}
        onFiltersChange={onFiltersChange}
        onReset={onReset}
      />

      {tasksFallbackVariant === 'page' ? (
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

          <TaskCalendarView
            tasks={tasks}
            teams={teams}
            loading={loading}
            onEditTask={onEdit}
            onCreateTaskForDate={(dateKey) => onCreate?.(defaultCreateTeamId, dateKey)}
            onMoveTaskDate={onMoveTaskDate}
          />
        </>
      )}
    </div>
  );
}
