import { memo, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Tooltip } from 'antd';
import type { Task } from '../../types/task.types.ts';
import {
  CALENDAR_PRIORITY_VISUAL,
  CALENDAR_STATUS_VISUAL,
  formatTaskDateSpanLabel,
} from '../../utils/calendar-date.utils.ts';

export interface CalendarTaskPillProps {
  task: Task;
  canDrag?: boolean;
  isDragging?: boolean;
  isMoving?: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  compact?: boolean;
  onClick?: (task: Task) => void;
  onDragStartTask?: (task: Task) => void;
  onDragEndTask?: () => void;
}

export const CalendarTaskPill = memo(function CalendarTaskPill({
  task,
  canDrag = false,
  isDragging = false,
  isMoving = false,
  continuesBefore = false,
  continuesAfter = false,
  compact = true,
  onClick,
  onDragStartTask,
  onDragEndTask,
}: CalendarTaskPillProps) {
  const statusVisual = CALENDAR_STATUS_VISUAL[task.status] ?? CALENDAR_STATUS_VISUAL.TODO;
  const priorityVisual =
    CALENDAR_PRIORITY_VISUAL[task.priority ?? 'MEDIUM'] ?? CALENDAR_PRIORITY_VISUAL.MEDIUM;
  const isDone = task.status === 'DONE';
  const dateLabel = formatTaskDateSpanLabel(task);

  const tooltipContent = (
    <div style={{ fontSize: 12, lineHeight: 1.45, maxWidth: 260 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, wordBreak: 'break-word' }}>
        {task.title}
      </div>
      <div style={{ opacity: 0.9 }}>
        {task.team ? `Nhóm: ${task.team.name}` : 'Công việc cá nhân'}
      </div>
      {task.assignee && (
        <div style={{ opacity: 0.9 }}>Thực hiện: {task.assignee.name}</div>
      )}
      <div style={{ opacity: 0.9 }}>
        {statusVisual.label} · Ưu tiên: {priorityVisual.label}
      </div>
      <div style={{ opacity: 0.85, marginTop: 2 }}>{dateLabel}</div>
      {!canDrag && isDone && (
        <div style={{ opacity: 0.75, marginTop: 2, fontStyle: 'italic' }}>
          Đã hoàn thành (khóa kéo đổi ngày)
        </div>
      )}
    </div>
  );

  const borderRadius = `${continuesBefore ? 0 : 4}px ${continuesAfter ? 0 : 4}px ${continuesAfter ? 0 : 4}px ${continuesBefore ? 0 : 4}px`;

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    height: compact ? 22 : 'auto',
    minHeight: compact ? 22 : 30,
    padding: compact ? '0 6px' : '5px 8px',
    borderRadius,
    borderLeft: continuesBefore ? `1px dashed ${statusVisual.accent}` : `3px solid ${statusVisual.accent}`,
    borderTop: `1px solid ${isDone ? '#d9f7be' : statusVisual.borderColor}`,
    borderRight: `1px solid ${isDone ? '#d9f7be' : statusVisual.borderColor}`,
    borderBottom: `1px solid ${isDone ? '#d9f7be' : statusVisual.borderColor}`,
    backgroundColor: isDone ? '#f6f8f5' : statusVisual.softBg,
    color: statusVisual.textColor,
    fontSize: 12,
    lineHeight: compact ? '20px' : '18px',
    cursor: isDragging ? 'grabbing' : canDrag ? 'grab' : 'pointer',
    opacity: isDragging || isMoving ? 0.5 : isDone ? 0.76 : 1,
    userSelect: 'none',
    overflow: 'hidden',
    transition: 'opacity 0.15s ease, box-shadow 0.15s ease',
    pointerEvents: 'auto',
  };

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
    onClick?.(task);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(task);
    }
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    onDragStartTask?.(task);
  }

  function handleDragEnd() {
    onDragEndTask?.();
  }

  return (
    <Tooltip title={tooltipContent} mouseEnterDelay={0.25}>
      <div
        role="button"
        tabIndex={0}
        aria-label={task.title}
        draggable={canDrag}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={containerStyle}
      >
        {continuesBefore && (
          <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }} aria-hidden="true">
            ‹
          </span>
        )}
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: priorityVisual.color,
            flexShrink: 0,
            opacity: isDone ? 0.55 : 1,
          }}
        />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 500,
            textDecoration: isDone ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
        {!compact && (
          <span
            style={{
              fontSize: 11,
              color: '#8c8c8c',
              flexShrink: 0,
              maxWidth: 110,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.team ? task.team.name : 'Cá nhân'}
          </span>
        )}
        {continuesAfter && (
          <span style={{ fontSize: 10, opacity: 0.7, flexShrink: 0 }} aria-hidden="true">
            ›
          </span>
        )}
      </div>
    </Tooltip>
  );
});

export default CalendarTaskPill;
