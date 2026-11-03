import { Card, Tag } from 'antd';
import type { Task, TaskPriority } from '../../types/task.types';

const priorityMap: Record<TaskPriority, { color: string; label: string }> = {
  HIGH: { color: 'red', label: 'Cao' },
  MEDIUM: { color: 'orange', label: 'Trung bình' },
  LOW: { color: 'blue', label: 'Thấp' },
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function checkIsOverdue(dueDateStr?: string | null, status?: Task['status']) {
  if (!dueDateStr || status === 'DONE') return false;
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

interface TaskCardViewProps {
  task: Task;
  isDragging?: boolean;
}

export function TaskCardView({ task, isDragging }: TaskCardViewProps) {
  return (
    <Card
      size="small"
      style={{
        boxShadow: isDragging
          ? '0 12px 28px rgba(0,0,0,0.22)'
          : '0 1px 3px rgba(0,0,0,0.06)',
        borderRadius: 6,
        background: isDragging ? '#fafafa' : '#ffffff',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ fontWeight: 600, color: '#333', flex: 1 }}>{task.title}</div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {task.category && (
            <Tag color={task.category.color} style={{ fontSize: 11, margin: 0 }}>
              {task.category.name}
            </Tag>
          )}
          {task.priority && priorityMap[task.priority] && (
            <Tag color={priorityMap[task.priority].color} style={{ fontSize: 11, margin: 0 }}>
              {priorityMap[task.priority].label}
            </Tag>
          )}
        </div>
      </div>
      {task.description && (
        <div
          style={{
            fontSize: 12,
            color: '#666',
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.description}
        </div>
      )}
      {(task.startDate || task.dueDate) && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
      )}
    </Card>
  );
}
