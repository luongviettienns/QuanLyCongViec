import { memo } from 'react';
import { Card, Tag, Tooltip, Button } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  LockOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { TASK_PRIORITY_CONFIG, type Task } from '../../types/task.types';
import type { TaskPermissions } from '../../utils/task-permission.utils';
import { formatDate, checkIsOverdue } from '../../../../shared/utils/date.utils';

interface TaskCardViewProps {
  task: Task;
  isDragging?: boolean;
  permissions?: TaskPermissions;
  onEdit?: (task: Task) => void;
}

export const TaskCardView = memo(function TaskCardView({
  task,
  isDragging,
  permissions,
  onEdit,
}: TaskCardViewProps) {
  const isReadOnly = permissions ? !permissions.canEditContent && !permissions.canChangeStatus : false;
  const isDragDisabled = permissions ? !permissions.canDrag : false;

  return (
    <Card
      size="small"
      hoverable={Boolean(onEdit)}
      onClick={() => onEdit?.(task)}
      style={{
        boxShadow: isDragging
          ? '0 12px 28px rgba(0,0,0,0.22)'
          : '0 1px 3px rgba(0,0,0,0.06)',
        borderRadius: 6,
        background: isDragging ? '#fafafa' : isDragDisabled ? '#fafbfc' : '#ffffff',
        border: isDragDisabled ? '1px dashed #d9d9d9' : '1px solid #f0f0f0',
        userSelect: 'none',
        cursor: isDragging ? 'grabbing' : permissions?.canDrag ? 'grab' : onEdit ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flex: 1, minWidth: 0 }}>
          {isDragDisabled && (
            <Tooltip title={permissions?.dragDisabledReason || 'Không thể di chuyển trên bảng'}>
              <LockOutlined
                style={{
                  color: '#faad14',
                  fontSize: 12,
                  marginTop: 3,
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          )}
          <span
            style={{
              fontWeight: 600,
              color: isDragDisabled ? '#595959' : '#262626',
              wordBreak: 'break-word',
            }}
          >
            {task.title}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
          {onEdit && (
            <Tooltip title={permissions?.canEditContent ? 'Chỉnh sửa' : 'Xem chi tiết'}>
              <Button
                type="text"
                size="small"
                icon={
                  isReadOnly ? (
                    <EyeOutlined style={{ fontSize: 12, color: '#8c8c8c' }} />
                  ) : (
                    <EditOutlined style={{ fontSize: 12, color: '#1677ff' }} />
                  )
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(task);
                }}
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
        {permissions?.roleBadge && (
          <Tooltip title={permissions.roleBadge.tooltip}>
            <Tag
              color={permissions.roleBadge.color}
              style={{ fontSize: 10, margin: 0, lineHeight: '18px', padding: '0 4px' }}
            >
              {permissions.roleBadge.label}
            </Tag>
          </Tooltip>
        )}

        {task.team && (
          <Tag icon={<TeamOutlined />} color="cyan" style={{ fontSize: 11, margin: 0 }}>
            {task.team.name}
          </Tag>
        )}

        {task.category && (
          <Tag color={task.category.color} style={{ fontSize: 11, margin: 0 }}>
            {task.category.name}
          </Tag>
        )}

        {task.priority && TASK_PRIORITY_CONFIG[task.priority] && (
          <Tag
            color={TASK_PRIORITY_CONFIG[task.priority].color}
            style={{ fontSize: 11, margin: 0 }}
          >
            {TASK_PRIORITY_CONFIG[task.priority].label}
          </Tag>
        )}
      </div>

      {task.description && (
        <div
          style={{
            fontSize: 12,
            color: '#666',
            marginTop: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.description}
        </div>
      )}

      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {task.assignee && (
          <Tag icon={<UserOutlined />} color="purple" style={{ fontSize: 11, margin: 0 }}>
            {task.assignee.name}
          </Tag>
        )}
        {task.startDate && (
          <Tag style={{ fontSize: 11, margin: 0 }}>
            Từ: {formatDate(task.startDate)}
          </Tag>
        )}
        {task.dueDate && (
          <Tag
            color={checkIsOverdue(task.dueDate, task.status) ? 'error' : 'default'}
            style={{ fontSize: 11, margin: 0 }}
          >
            Hạn: {formatDate(task.dueDate)}
            {checkIsOverdue(task.dueDate, task.status) ? ' (Quá hạn)' : ''}
          </Tag>
        )}
      </div>
    </Card>
  );
});
