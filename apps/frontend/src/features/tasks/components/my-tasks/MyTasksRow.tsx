import React from 'react';
import { Button, Dropdown, Tag, Tooltip, type MenuProps } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  CheckOutlined,
  TeamOutlined,
  UserOutlined,
  RightOutlined,
  OrderedListOutlined,
} from '@ant-design/icons';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  type Task,
  type TaskStatus,
} from '../../types/task.types';
import type { Team } from '../../../teams/types/team.types';
import type { User } from '../../../auth/types/auth.types';
import { getTaskPermissions } from '../../utils/task-permission.utils';
import {
  classifyMyTaskRole,
  getQuickStatusAction,
  type MyTaskRoleKind,
} from '../../utils/my-tasks.utils';
import { getDeadlineDisplayState } from '../../../../shared/utils/date.utils';
import { ChecklistProgressBadge } from '../checklist';

export interface MyTasksRowProps {
  task: Task;
  teams: Team[];
  currentUser: User | null;
  selected: boolean;
  onSelect: (taskId: number, focus?: 'overview' | 'checklist') => void;
  onUpdateStatus: (taskId: number, nextStatus: TaskStatus) => Promise<boolean>;
}

const ROLE_BADGE_MAP: Record<MyTaskRoleKind, { label: string; color: string }> = {
  personal: { label: 'Cá nhân', color: 'default' },
  assignee: { label: 'Phụ trách', color: 'blue' },
  collaborator: { label: 'Phối hợp', color: 'purple' },
  subtask_only: { label: 'Việc con', color: 'cyan' },
};

function renderStatusIcon(status: TaskStatus) {
  if (status === 'DONE') {
    return <CheckCircleFilled style={{ color: '#52c41a', fontSize: 16 }} />;
  }
  if (status === 'IN_PROGRESS') {
    return (
      <span
        aria-hidden="true"
        style={{
          width: 15,
          height: 15,
          borderRadius: '50%',
          border: '2px solid #1677ff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: '#1677ff',
          }}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 15,
        height: 15,
        borderRadius: '50%',
        border: '2px solid #bfbfbf',
        display: 'inline-block',
      }}
    />
  );
}

export const MyTasksRow: React.FC<MyTasksRowProps> = ({
  task,
  teams,
  currentUser,
  selected,
  onSelect,
  onUpdateStatus,
}) => {
  const team = task.teamId ? teams.find((t) => t.id === task.teamId) ?? null : null;
  const perms = getTaskPermissions(currentUser, task, team);
  const classification = classifyMyTaskRole(task, currentUser?.id);
  const quickAction = getQuickStatusAction(task, perms);
  const deadline = getDeadlineDisplayState(task.dueDate, task.status);
  const priorityConfig = task.priority ? TASK_PRIORITY_CONFIG[task.priority] : null;
  const roleBadge = ROLE_BADGE_MAP[classification.roleKind];

  const statusMenuItems: MenuProps['items'] = perms.allowedNextStatuses.map((status) => ({
    key: status,
    label: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {renderStatusIcon(status)}
        <span>{TASK_STATUS_CONFIG[status].label}</span>
      </span>
    ),
    onClick: ({ domEvent }) => {
      domEvent.stopPropagation();
      void onUpdateStatus(task.id, status);
    },
  }));

  const statusDisabledReason = !perms.canChangeStatus
    ? classification.isCollaborator
      ? 'Bạn đang tham gia phối hợp — chỉ người phụ trách hoặc quản trị viên mới đổi được trạng thái công việc cha'
      : task.status === 'DONE'
        ? 'Chỉ người tạo hoặc quản trị viên mới mở lại được công việc đã hoàn thành'
        : 'Bạn không có quyền đổi trạng thái công việc này'
    : `Trạng thái: ${TASK_STATUS_CONFIG[task.status].label} (bấm để chuyển)`;

  const statusTrigger = (
    <Tooltip title={statusDisabledReason}>
      <Button
        type="text"
        size="small"
        disabled={!perms.canChangeStatus || perms.allowedNextStatuses.length === 0}
        aria-label={`Đổi trạng thái công việc ${task.title}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 26,
          height: 26,
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {renderStatusIcon(task.status)}
      </Button>
    </Tooltip>
  );

  const visiblePendingSubtasks = classification.myPendingSubtasks.slice(0, 2);
  const extraPendingCount = Math.max(0, classification.myPendingSubtasks.length - 2);

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`my-task-row-${task.id}`}
      className={`my-tasks-row${selected ? ' my-tasks-row--selected' : ''}`}
      onClick={() => onSelect(task.id, 'overview')}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(task.id, 'overview');
        }
      }}
    >
      <div className="my-tasks-row-main">
        {perms.canChangeStatus && perms.allowedNextStatuses.length > 0 ? (
          <Dropdown menu={{ items: statusMenuItems }} trigger={['click']}>
            {statusTrigger}
          </Dropdown>
        ) : (
          statusTrigger
        )}

        <div className="my-tasks-row-content">
          <div className="my-tasks-row-title-line">
            <span
              className={`my-tasks-row-title${
                task.status === 'DONE' ? ' my-tasks-row-title--done' : ''
              }`}
            >
              {task.title}
            </span>

            <Tag
              color={roleBadge.color}
              style={{ margin: 0, fontSize: 11, lineHeight: '18px', borderRadius: 6 }}
            >
              {roleBadge.label}
            </Tag>

            {task.team?.name ? (
              <Tag
                icon={<TeamOutlined />}
                style={{
                  margin: 0,
                  fontSize: 11,
                  lineHeight: '18px',
                  borderRadius: 6,
                  background: '#f5f7fa',
                  borderColor: '#e6e8eb',
                  color: '#434343',
                }}
              >
                {task.team.name}
              </Tag>
            ) : (
              <span style={{ fontSize: 11, color: '#8c8c8c', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <UserOutlined /> Không gian cá nhân
              </span>
            )}

            <ChecklistProgressBadge subtasks={task.subtasks} />
          </div>

          {classification.mySubtasks.length > 0 && (
            <div>
              <span
                role="button"
                tabIndex={0}
                className="my-tasks-row-subtasks"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(task.id, 'checklist');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(task.id, 'checklist');
                  }
                }}
              >
                <OrderedListOutlined />
                {visiblePendingSubtasks.length > 0 ? (
                  <>
                    <span>
                      Việc con của bạn ({classification.myPendingSubtasks.length}/
                      {classification.mySubtasks.length} chưa xong):
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      {visiblePendingSubtasks.map((st) => st.title).join(' · ')}
                    </span>
                    {extraPendingCount > 0 && <span>+{extraPendingCount} khác</span>}
                  </>
                ) : (
                  <span>
                    Đã hoàn thành {classification.mySubtasks.length}/{classification.mySubtasks.length}{' '}
                    việc con được giao
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="my-tasks-row-meta">
        {/* Deadline */}
        {deadline.state !== 'none' ? (
          <Tooltip title={deadline.badgeText ? `${deadline.badgeText} (${deadline.formatted})` : deadline.formatted}>
            <span
              className={`my-tasks-deadline${
                deadline.state === 'overdue'
                  ? ' my-tasks-deadline--overdue'
                  : deadline.state === 'today'
                    ? ' my-tasks-deadline--today'
                    : deadline.state === 'soon'
                      ? ' my-tasks-deadline--soon'
                      : ''
              }`}
            >
              {deadline.state === 'overdue' ? (
                <ExclamationCircleOutlined />
              ) : (
                <ClockCircleOutlined />
              )}
              <span>
                {deadline.state === 'today' ? 'Hôm nay' : deadline.formatted}
              </span>
            </span>
          </Tooltip>
        ) : (
          <span style={{ fontSize: 12, color: '#bfbfbf' }}>—</span>
        )}

        {/* Priority Badge */}
        {priorityConfig && (
          <Tag
            color={priorityConfig.color}
            style={{
              margin: 0,
              fontSize: 11,
              lineHeight: '18px',
              padding: '0 6px',
              borderRadius: 6,
            }}
          >
            {priorityConfig.label}
          </Tag>
        )}

        {/* Quick 1-click advance */}
        {quickAction && (
          <Button
            size="small"
            type={quickAction.targetStatus === 'DONE' ? 'primary' : 'default'}
            ghost={quickAction.targetStatus === 'DONE'}
            icon={
              quickAction.targetStatus === 'DONE' ? (
                <CheckOutlined />
              ) : (
                <PlayCircleOutlined />
              )
            }
            onClick={(e) => {
              e.stopPropagation();
              void onUpdateStatus(task.id, quickAction.targetStatus);
            }}
          >
            {quickAction.label}
          </Button>
        )}

        <RightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
      </div>
    </div>
  );
};
