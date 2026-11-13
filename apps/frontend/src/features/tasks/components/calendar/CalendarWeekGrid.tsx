import { useMemo, type DragEvent } from 'react';
import { Button, Tag, Tooltip } from 'antd';
import { PlusOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import type { Task } from '../../types/task.types.ts';
import {
  CALENDAR_PRIORITY_VISUAL,
  CALENDAR_STATUS_VISUAL,
  CALENDAR_WEEKDAY_SHORT_LABELS,
  formatTaskDateSpanLabel,
  getTasksForDay,
  getWeekDays,
} from '../../utils/calendar-date.utils.ts';
import { getDeadlineDisplayState } from '../../../../shared/utils/date.utils.ts';

export interface CalendarWeekGridProps {
  tasks: Task[];
  anchorDateKey: string;
  todayKey: string;
  draggingTaskId?: number | null;
  movingTaskId?: number | null;
  dragOverDateKey?: string | null;
  canDragTask: (task: Task) => boolean;
  onEditTask: (task: Task) => void;
  onCreateTaskForDate?: (dateKey: string) => void;
  onDragStartTask?: (task: Task) => void;
  onDragEndTask?: () => void;
  onDragOverDate?: (dateKey: string) => void;
  onDragLeaveDate?: () => void;
  onDropOnDate?: (dateKey: string, taskIdFromTransfer?: number) => void;
}

export function CalendarWeekGrid({
  tasks,
  anchorDateKey,
  todayKey,
  draggingTaskId = null,
  movingTaskId = null,
  dragOverDateKey = null,
  canDragTask,
  onEditTask,
  onCreateTaskForDate,
  onDragStartTask,
  onDragEndTask,
  onDragOverDate,
  onDragLeaveDate,
  onDropOnDate,
}: CalendarWeekGridProps) {
  const columns = useMemo(() => {
    const days = getWeekDays(anchorDateKey, todayKey);
    return days.map((cell) => ({
      cell,
      dayTasks: getTasksForDay(tasks, cell.dateKey),
    }));
  }, [tasks, anchorDateKey, todayKey]);

  const canAcceptDrop = draggingTaskId !== null;

  function handleColumnDrop(e: DragEvent<HTMLDivElement>, dateKey: string) {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('text/plain');
    const parsedId = Number(raw);
    onDropOnDate?.(dateKey, Number.isFinite(parsedId) && parsedId > 0 ? parsedId : undefined);
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: 920,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {columns.map(({ cell, dayTasks }, colIdx) => {
          const isDropTarget = dragOverDateKey === cell.dateKey;
          const isWeekend = colIdx >= 5;
          const dd = cell.dateKey.slice(8, 10);
          const mm = cell.dateKey.slice(5, 7);

          return (
            <div
              key={cell.dateKey}
              onDragOver={(e) => {
                if (!canAcceptDrop && !e.dataTransfer.types.includes('text/plain')) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                onDragOverDate?.(cell.dateKey);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  onDragLeaveDate?.();
                }
              }}
              onDrop={(e) => handleColumnDrop(e, cell.dateKey)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 380,
                borderRight: colIdx < 6 ? '1px solid #f0f0f0' : undefined,
                backgroundColor: isDropTarget
                  ? '#e6f4ff'
                  : cell.isToday
                    ? '#f7fbff'
                    : isWeekend
                      ? '#fcfcfd'
                      : '#ffffff',
                outline: isDropTarget ? '2px dashed #1677ff' : undefined,
                outlineOffset: isDropTarget ? '-2px' : undefined,
                transition: 'background-color 0.15s ease',
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 8px',
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: cell.isToday ? '#e6f4ff' : '#fafafa',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: cell.isToday ? '#1677ff' : isWeekend ? '#8c8c8c' : '#595959',
                    }}
                  >
                    {CALENDAR_WEEKDAY_SHORT_LABELS[cell.weekdayIndex]}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: cell.isToday ? 700 : 500,
                      color: cell.isToday ? '#1677ff' : '#262626',
                    }}
                  >
                    {dd}/{mm}
                  </span>
                  {dayTasks.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: '#8c8c8c',
                        fontWeight: 500,
                      }}
                    >
                      ({dayTasks.length})
                    </span>
                  )}
                </div>

                {onCreateTaskForDate && (
                  <Tooltip title={`Thêm công việc ngày ${dd}/${mm}`} mouseEnterDelay={0.35}>
                    <Button
                      type="text"
                      size="small"
                      aria-label={`Thêm công việc ngày ${cell.dateKey}`}
                      icon={<PlusOutlined style={{ fontSize: 12 }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCreateTaskForDate(cell.dateKey);
                      }}
                      style={{ width: 22, height: 22, padding: 0, color: '#1677ff' }}
                    />
                  </Tooltip>
                )}
              </div>

              {/* Column Cards */}
              <div
                onClick={() => onCreateTaskForDate?.(cell.dateKey)}
                style={{
                  flex: 1,
                  padding: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  cursor: onCreateTaskForDate ? 'pointer' : 'default',
                }}
              >
                {dayTasks.length === 0 ? (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      color: '#bfbfbf',
                      textAlign: 'center',
                      padding: 12,
                    }}
                  >
                    {isDropTarget ? 'Thả để chuyển sang ngày này' : 'Chưa có việc'}
                  </div>
                ) : (
                  dayTasks.map((task) => {
                    const draggable = canDragTask(task);
                    const statusVisual =
                      CALENDAR_STATUS_VISUAL[task.status] ?? CALENDAR_STATUS_VISUAL.TODO;
                    const priorityKey = task.priority ?? 'MEDIUM';
                    const priorityVisual =
                      CALENDAR_PRIORITY_VISUAL[priorityKey] ?? CALENDAR_PRIORITY_VISUAL.MEDIUM;
                    const isDone = task.status === 'DONE';
                    const isDragging = draggingTaskId === task.id;
                    const isMoving = movingTaskId === task.id;
                    const dateLabel = formatTaskDateSpanLabel(task);
                    const deadline = getDeadlineDisplayState(task.dueDate, task.status);

                    return (
                      <Tooltip
                        key={task.id}
                        mouseEnterDelay={0.3}
                        title={
                          <div style={{ fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }}>{task.title}</div>
                            <div>
                              {task.team ? `Nhóm: ${task.team.name}` : 'Công việc cá nhân'}
                            </div>
                            {task.assignee && <div>Thực hiện: {task.assignee.name}</div>}
                            <div>
                              {statusVisual.label} · Ưu tiên: {priorityVisual.label}
                            </div>
                            <div>{dateLabel}</div>
                          </div>
                        }
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          draggable={draggable}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTask(task);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onEditTask(task);
                            }
                          }}
                          onDragStart={(e) => {
                            if (!draggable) {
                              e.preventDefault();
                              return;
                            }
                            e.stopPropagation();
                            e.dataTransfer.setData('text/plain', String(task.id));
                            e.dataTransfer.effectAllowed = 'move';
                            onDragStartTask?.(task);
                          }}
                          onDragEnd={() => onDragEndTask?.()}
                          style={{
                            borderRadius: 6,
                            border: `1px solid ${isDone ? '#d9f7be' : '#f0f0f0'}`,
                            borderLeft: `3px solid ${statusVisual.accent}`,
                            backgroundColor: isDone ? '#f9fbf8' : '#ffffff',
                            padding: '8px 8px',
                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                            cursor: isDragging ? 'grabbing' : draggable ? 'grab' : 'pointer',
                            opacity: isDragging || isMoving ? 0.45 : isDone ? 0.78 : 1,
                            userSelect: 'none',
                            transition: 'box-shadow 0.15s ease, opacity 0.15s ease',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 6,
                              marginBottom: 6,
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                backgroundColor: priorityVisual.color,
                                marginTop: 5,
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                lineHeight: 1.35,
                                color: isDone ? '#8c8c8c' : '#262626',
                                textDecoration: isDone ? 'line-through' : 'none',
                                wordBreak: 'break-word',
                              }}
                            >
                              {task.title}
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              marginBottom: 6,
                            }}
                          >
                            <Tag
                              color={
                                priorityKey === 'HIGH'
                                  ? 'red'
                                  : priorityKey === 'MEDIUM'
                                    ? 'orange'
                                    : 'blue'
                              }
                              style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 5px' }}
                            >
                              {priorityVisual.label}
                            </Tag>

                            {task.team ? (
                              <Tag
                                icon={<TeamOutlined />}
                                color="cyan"
                                style={{
                                  margin: 0,
                                  fontSize: 10,
                                  lineHeight: '16px',
                                  padding: '0 5px',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {task.team.name}
                              </Tag>
                            ) : (
                              <Tag
                                style={{
                                  margin: 0,
                                  fontSize: 10,
                                  lineHeight: '16px',
                                  padding: '0 5px',
                                  color: '#595959',
                                }}
                              >
                                Cá nhân
                              </Tag>
                            )}
                          </div>

                          {task.assignee && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 11,
                                color: '#595959',
                                marginBottom: 4,
                              }}
                            >
                              <UserOutlined style={{ fontSize: 11, color: '#722ed1' }} />
                              <span
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {task.assignee.name}
                              </span>
                            </div>
                          )}

                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              color: '#8c8c8c',
                            }}
                          >
                            <span>{dateLabel}</span>
                            {deadline.badgeText && (
                              <Tag
                                color={deadline.color}
                                style={{
                                  margin: 0,
                                  fontSize: 10,
                                  lineHeight: '15px',
                                  padding: '0 4px',
                                }}
                              >
                                {deadline.badgeText}
                              </Tag>
                            )}
                          </div>
                        </div>
                      </Tooltip>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarWeekGrid;
