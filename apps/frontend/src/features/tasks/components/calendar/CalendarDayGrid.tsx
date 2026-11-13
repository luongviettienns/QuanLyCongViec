import { useMemo, type DragEvent } from 'react';
import { Button, Card, Empty, Tag, Tooltip } from 'antd';
import {
  CalendarOutlined,
  CheckSquareOutlined,
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
  getTasksForDay,
} from '../../utils/calendar-date.utils.ts';
import { getDeadlineDisplayState } from '../../../../shared/utils/date.utils.ts';

export interface CalendarDayGridProps {
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

export function CalendarDayGrid({
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
}: CalendarDayGridProps) {
  const dayTasks = useMemo(
    () => getTasksForDay(tasks, anchorDateKey),
    [tasks, anchorDateKey],
  );
  const dayLabel = formatAgendaDayLabel(anchorDateKey, todayKey);
  const isToday = anchorDateKey === todayKey;
  const isDropTarget = dragOverDateKey === anchorDateKey;
  const canAcceptDrop = draggingTaskId !== null;

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    const raw = e.dataTransfer.getData('text/plain');
    const parsedId = Number(raw);
    onDropOnDate?.(
      anchorDateKey,
      Number.isFinite(parsedId) && parsedId > 0 ? parsedId : undefined,
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (!canAcceptDrop && !e.dataTransfer.types.includes('text/plain')) {
          return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverDate?.(anchorDateKey);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onDragLeaveDate?.();
        }
      }}
      onDrop={handleDrop}
      style={{
        borderRadius: 8,
        border: isDropTarget ? '2px dashed #1677ff' : '1px solid #f0f0f0',
        backgroundColor: isDropTarget ? '#e6f4ff' : '#ffffff',
        overflow: 'hidden',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      {/* Day panel header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          padding: '12px 16px',
          backgroundColor: isToday ? '#f0f7ff' : '#fafafa',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CalendarOutlined style={{ color: isToday ? '#1677ff' : '#595959' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>
            {dayLabel}
          </span>
          <Tag color={isToday ? 'blue' : 'default'} style={{ margin: 0 }}>
            {dayTasks.length} công việc
          </Tag>
        </div>

        {onCreateTaskForDate && (
          <Button
            type="primary"
            ghost
            size="small"
            icon={<PlusOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              onCreateTaskForDate(anchorDateKey);
            }}
          >
            Thêm việc ngày này
          </Button>
        )}
      </div>

      {/* Drop target & task list */}
      <div
        onClick={() => {
          if (dayTasks.length === 0) {
            onCreateTaskForDate?.(anchorDateKey);
          }
        }}
        style={{
          padding: 16,
          minHeight: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {isDropTarget && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              backgroundColor: '#bae0ff',
              color: '#003eb3',
              fontSize: 13,
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            Thả công việc vào đây để chuyển sang {dayLabel}
          </div>
        )}

        {dayTasks.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 12px',
            }}
          >
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có công việc nào trong ngày này"
            >
              {onCreateTaskForDate && (
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateTaskForDate(anchorDateKey);
                  }}
                >
                  Tạo công việc cho ngày này
                </Button>
              )}
            </Empty>
          </div>
        ) : (
          dayTasks.map((task) => {
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
            const subtasks = task.subtasks ?? [];
            const doneSubtasks = subtasks.filter((s) => s.status === 'DONE').length;

            return (
              <Tooltip
                key={task.id}
                mouseEnterDelay={0.35}
                title={
                  draggable
                    ? 'Nhấp để mở chi tiết · Kéo thả sang ngày khác để đổi lịch'
                    : isDone
                      ? 'Công việc đã hoàn thành · Nhấp để xem chi tiết'
                      : 'Nhấp để xem hoặc cập nhật công việc'
                }
              >
                <div
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
                    styles={{ body: { padding: '12px 14px' } }}
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
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: priorityVisual.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: isDone ? '#8c8c8c' : '#262626',
                            textDecoration: isDone ? 'line-through' : 'none',
                            wordBreak: 'break-word',
                          }}
                        >
                          {task.title}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Tag color={priorityConfig.color} style={{ margin: 0 }}>
                          {priorityConfig.label}
                        </Tag>
                        <Tag color={statusConfig.color} style={{ margin: 0 }}>
                          {statusConfig.label}
                        </Tag>
                      </div>
                    </div>

                    {task.description && (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: '#595959',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {task.description}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {task.team ? (
                        <Tag icon={<TeamOutlined />} color="cyan" style={{ margin: 0 }}>
                          {task.team.name}
                        </Tag>
                      ) : (
                        <Tag style={{ margin: 0 }}>Cá nhân</Tag>
                      )}

                      {task.category && (
                        <Tag color={task.category.color} style={{ margin: 0 }}>
                          {task.category.name}
                        </Tag>
                      )}

                      {task.assignee && (
                        <Tag icon={<UserOutlined />} color="purple" style={{ margin: 0 }}>
                          {task.assignee.name}
                        </Tag>
                      )}

                      {subtasks.length > 0 && (
                        <Tag icon={<CheckSquareOutlined />} style={{ margin: 0 }}>
                          {doneSubtasks}/{subtasks.length} việc con
                        </Tag>
                      )}

                      <span style={{ fontSize: 12, color: '#8c8c8c', marginLeft: 'auto' }}>
                        {formatTaskDateSpanLabel(task)}
                      </span>

                      {deadline.badgeText && (
                        <Tag color={deadline.color} style={{ margin: 0 }}>
                          {deadline.badgeText}
                        </Tag>
                      )}
                    </div>
                  </Card>
                </div>
              </Tooltip>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CalendarDayGrid;
