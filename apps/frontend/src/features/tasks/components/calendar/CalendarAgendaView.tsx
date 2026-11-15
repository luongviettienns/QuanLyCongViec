import { useMemo, useState, type DragEvent } from 'react';
import { Button, Card, Empty, Segmented, Tag, Tooltip } from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  type Task,
} from '../../types/task.types.ts';
import {
  CALENDAR_PRIORITY_VISUAL,
  CALENDAR_STATUS_VISUAL,
  formatAgendaDayLabel,
  formatTaskDateSpanLabel,
  getScheduledAgendaDateKeys,
  getTasksForDay,
} from '../../utils/calendar-date.utils.ts';
import { getDeadlineDisplayState } from '../../../../shared/utils/date.utils.ts';

type AgendaScope = 'month' | 'all';

export interface CalendarAgendaViewProps {
  tasks: Task[];
  unscheduledCount?: number;
  anchorDateKey: string;
  todayKey: string;
  draggingTaskId?: number | null;
  movingTaskId?: number | null;
  dragOverDateKey?: string | null;
  canDragTask: (task: Task) => boolean;
  onEditTask: (task: Task) => void;
  onCreateTaskForDate?: (dateKey: string) => void;
  onOpenUnscheduled?: () => void;
  onDragStartTask?: (task: Task) => void;
  onDragEndTask?: () => void;
  onDragOverDate?: (dateKey: string) => void;
  onDragLeaveDate?: () => void;
  onDropOnDate?: (dateKey: string, taskIdFromTransfer?: number) => void;
}

export function CalendarAgendaView({
  tasks,
  unscheduledCount = 0,
  anchorDateKey,
  todayKey,
  draggingTaskId = null,
  movingTaskId = null,
  dragOverDateKey = null,
  canDragTask,
  onEditTask,
  onCreateTaskForDate,
  onOpenUnscheduled,
  onDragStartTask,
  onDragEndTask,
  onDragOverDate,
  onDragLeaveDate,
  onDropOnDate,
}: CalendarAgendaViewProps) {
  const [scope, setScope] = useState<AgendaScope>('month');

  const monthDateKeys = useMemo(
    () => getScheduledAgendaDateKeys(tasks, { monthAnchorKey: anchorDateKey }),
    [tasks, anchorDateKey],
  );

  const allDateKeys = useMemo(
    () => getScheduledAgendaDateKeys(tasks),
    [tasks],
  );

  const visibleDateKeys = useMemo(() => {
    const base = scope === 'month' ? monthDateKeys : allDateKeys;
    if (draggingTaskId !== null && !base.includes(todayKey)) {
      return [...base, todayKey].sort();
    }
    return base;
  }, [scope, monthDateKeys, allDateKeys, draggingTaskId, todayKey]);

  const dayGroups = useMemo(
    () =>
      visibleDateKeys.map((dateKey) => ({
        dateKey,
        dayTasks: getTasksForDay(tasks, dateKey),
      })),
    [visibleDateKeys, tasks],
  );

  const canAcceptDrop = draggingTaskId !== null;

  function handleGroupDrop(e: DragEvent<HTMLDivElement>, dateKey: string) {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('text/plain');
    const parsedId = Number(raw);
    onDropOnDate?.(dateKey, Number.isFinite(parsedId) && parsedId > 0 ? parsedId : undefined);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Scope Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          padding: '8px 12px',
          backgroundColor: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
      >
        <Segmented<AgendaScope>
          size="small"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'month', label: `Trong tháng (${monthDateKeys.length} ngày)` },
            { value: 'all', label: `Tất cả có lịch (${allDateKeys.length} ngày)` },
          ]}
        />
      </div>

      {/* Day Timeline */}
      {dayGroups.length === 0 ? (
        <div
          style={{
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            backgroundColor: '#ffffff',
            padding: '28px 16px',
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              scope === 'month' && allDateKeys.length > 0
                ? 'Không có công việc nào được xếp lịch trong tháng này'
                : 'Chưa có công việc nào có ngày bắt đầu hoặc hạn chót'
            }
          >
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              {scope === 'month' && allDateKeys.length > 0 && (
                <Button size="small" onClick={() => setScope('all')}>
                  Xem tất cả ({allDateKeys.length} ngày)
                </Button>
              )}
              {unscheduledCount > 0 && onOpenUnscheduled && (
                <Button size="small" onClick={onOpenUnscheduled}>
                  Xem việc chưa xếp ngày ({unscheduledCount})
                </Button>
              )}
              {onCreateTaskForDate && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => onCreateTaskForDate(todayKey)}
                >
                  Tạo công việc hôm nay
                </Button>
              )}
            </div>
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {dayGroups.map(({ dateKey, dayTasks }) => {
            const isToday = dateKey === todayKey;
            const isDropTarget = dragOverDateKey === dateKey;

            return (
              <div
                key={dateKey}
                onDragOver={(e) => {
                  if (!canAcceptDrop && !e.dataTransfer.types.includes('text/plain')) {
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  onDragOverDate?.(dateKey);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    onDragLeaveDate?.();
                  }
                }}
                onDrop={(e) => handleGroupDrop(e, dateKey)}
                style={{
                  borderRadius: 8,
                  padding: '10px 12px',
                  border: isDropTarget ? '2px dashed #1677ff' : '1px solid #f0f0f0',
                  backgroundColor: isDropTarget
                    ? '#e6f4ff'
                    : isToday
                      ? '#f7fbff'
                      : '#ffffff',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Day Header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: dayTasks.length > 0 ? 10 : 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: isToday ? '#1677ff' : '#bfbfbf',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: isToday ? '#1677ff' : '#262626',
                      }}
                    >
                      {formatAgendaDayLabel(dateKey, todayKey)}
                    </span>
                    <Tag color={isToday ? 'blue' : 'default'} style={{ margin: 0 }}>
                      {dayTasks.length}
                    </Tag>
                  </div>

                  {onCreateTaskForDate && (
                    <Tooltip title="Thêm công việc vào ngày này" mouseEnterDelay={0.35}>
                      <Button
                        type="text"
                        size="small"
                        aria-label={`Thêm công việc ngày ${dateKey}`}
                        icon={<PlusOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateTaskForDate(dateKey);
                        }}
                        style={{ color: '#1677ff' }}
                      />
                    </Tooltip>
                  )}
                </div>

                {/* Task Cards */}
                {dayTasks.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#1677ff', paddingTop: 4 }}>
                    Thả công việc vào đây để dời sang hôm nay
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dayTasks.map((task) => {
                      const draggable = canDragTask(task);
                      const statusVisual =
                        CALENDAR_STATUS_VISUAL[task.status] ?? CALENDAR_STATUS_VISUAL.TODO;
                      const statusConfig = TASK_STATUS_CONFIG[task.status];
                      const priorityKey = task.priority ?? 'MEDIUM';
                      const priorityVisual =
                        CALENDAR_PRIORITY_VISUAL[priorityKey] ?? CALENDAR_PRIORITY_VISUAL.MEDIUM;
                      const priorityConfig = TASK_PRIORITY_CONFIG[priorityKey];
                      const isDone = task.status === 'DONE';
                      const isDragging = draggingTaskId === task.id;
                      const isMoving = movingTaskId === task.id;
                      const deadline = getDeadlineDisplayState(task.dueDate, task.status);

                      return (
                        <div
                          key={task.id}
                          draggable={draggable}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditTask(task);
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
                            cursor: isDragging ? 'grabbing' : draggable ? 'grab' : 'pointer',
                            opacity: isDragging || isMoving ? 0.45 : isDone ? 0.8 : 1,
                            transition: 'opacity 0.15s ease',
                          }}
                        >
                          <Card
                            size="small"
                            hoverable
                            styles={{ body: { padding: '10px 12px' } }}
                            style={{
                              borderLeft: `4px solid ${statusVisual.accent}`,
                              backgroundColor: isDone ? '#f9fbf8' : '#ffffff',
                              borderRadius: 6,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 8,
                                marginBottom: 6,
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  aria-hidden="true"
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    backgroundColor: priorityVisual.color,
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontWeight: 600,
                                    fontSize: 14,
                                    color: isDone ? '#8c8c8c' : '#262626',
                                    textDecoration: isDone ? 'line-through' : 'none',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {task.title}
                                </span>
                              </div>

                              <Tag color={statusConfig.color} style={{ margin: 0, flexShrink: 0 }}>
                                {statusConfig.label}
                              </Tag>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <Tag color={priorityConfig.color} style={{ margin: 0, fontSize: 11 }}>
                                {priorityConfig.label}
                              </Tag>

                              {task.team ? (
                                <Tag
                                  icon={<TeamOutlined />}
                                  color="cyan"
                                  style={{ margin: 0, fontSize: 11 }}
                                >
                                  {task.team.name}
                                </Tag>
                              ) : (
                                <Tag style={{ margin: 0, fontSize: 11 }}>Cá nhân</Tag>
                              )}

                              {task.assignee && (
                                <Tag
                                  icon={<UserOutlined />}
                                  color="purple"
                                  style={{ margin: 0, fontSize: 11 }}
                                >
                                  {task.assignee.name}
                                </Tag>
                              )}

                              {deadline.badgeText && (
                                <Tag color={deadline.color} style={{ margin: 0, fontSize: 11 }}>
                                  {deadline.badgeText}
                                </Tag>
                              )}

                              <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 'auto' }}>
                                {formatTaskDateSpanLabel(task)}
                              </span>
                            </div>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CalendarAgendaView;
