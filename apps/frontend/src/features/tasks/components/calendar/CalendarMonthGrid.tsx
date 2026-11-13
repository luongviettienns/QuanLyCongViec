import { useMemo, useState, type DragEvent } from 'react';
import { Button, Popover, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { Task } from '../../types/task.types.ts';
import {
  CALENDAR_WEEKDAY_SHORT_LABELS,
  formatAgendaDayLabel,
  getMonthGridDays,
  getTasksForDay,
  packWeekTaskSegments,
  type CalendarDayCell,
} from '../../utils/calendar-date.utils.ts';
import { CalendarTaskPill } from './CalendarTaskPill';

const MAX_VISIBLE_LANES = 3;

export interface CalendarMonthGridProps {
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

function resolveWeekColumnDateKey(
  e: DragEvent<HTMLDivElement>,
  weekDays: CalendarDayCell[],
): string | null {
  if (weekDays.length === 0) return null;
  const rect = e.currentTarget.getBoundingClientRect();
  if (rect.width <= 0) return weekDays[0].dateKey;
  const relX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
  const col = Math.min(weekDays.length - 1, Math.floor((relX / rect.width) * weekDays.length));
  return weekDays[col]?.dateKey ?? null;
}

export function CalendarMonthGrid({
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
}: CalendarMonthGridProps) {
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null);
  const [openPopoverDateKey, setOpenPopoverDateKey] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const cells = getMonthGridDays(anchorDateKey, todayKey);
    const grouped: CalendarDayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      grouped.push(cells.slice(i, i + 7));
    }
    return grouped;
  }, [anchorDateKey, todayKey]);

  const weekLayouts = useMemo(() => {
    return weeks.map((weekDays) => {
      const allSegments = packWeekTaskSegments(tasks, weekDays);
      const visibleSegments = allSegments.filter((seg) => seg.laneIndex < MAX_VISIBLE_LANES);
      const dayEntries = weekDays.map((cell, col) => {
        const dayTasks = getTasksForDay(tasks, cell.dateKey);
        const visibleInCol = visibleSegments.filter(
          (seg) => col >= seg.startCol && col < seg.startCol + seg.spanCols,
        ).length;
        const hiddenCount = Math.max(0, dayTasks.length - visibleInCol);
        return { cell, dayTasks, hiddenCount };
      });
      return { weekDays, visibleSegments, dayEntries };
    });
  }, [weeks, tasks]);

  const canAcceptDrop = draggingTaskId !== null;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        style={{
          minWidth: 720,
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          backgroundColor: '#ffffff',
          overflow: 'hidden',
        }}
      >
        {/* Weekday header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            backgroundColor: '#fafafa',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          {CALENDAR_WEEKDAY_SHORT_LABELS.map((label, idx) => {
            const isWeekend = idx >= 5;
            return (
              <div
                key={label}
                style={{
                  padding: '8px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: isWeekend ? '#8c8c8c' : '#595959',
                  textAlign: 'center',
                  borderRight: idx < 6 ? '1px solid #f0f0f0' : undefined,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* Week rows */}
        {weekLayouts.map(({ weekDays, visibleSegments, dayEntries }, weekIdx) => {
          const isLastWeek = weekIdx === weekLayouts.length - 1;

          return (
            <div
              key={weekDays[0]?.dateKey ?? weekIdx}
              style={{
                position: 'relative',
                minHeight: 126,
                borderBottom: isLastWeek ? undefined : '1px solid #f0f0f0',
              }}
              onDragOver={(e) => {
                if (!canAcceptDrop && !e.dataTransfer.types.includes('text/plain')) {
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const targetKey = resolveWeekColumnDateKey(e, weekDays);
                if (targetKey) {
                  onDragOverDate?.(targetKey);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  onDragLeaveDate?.();
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetKey = resolveWeekColumnDateKey(e, weekDays);
                if (!targetKey) return;
                const raw = e.dataTransfer.getData('text/plain');
                const parsedId = Number(raw);
                onDropOnDate?.(targetKey, Number.isFinite(parsedId) && parsedId > 0 ? parsedId : undefined);
              }}
            >
              {/* Layer 1: Day background cells */}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                }}
              >
                {dayEntries.map(({ cell }, colIdx) => {
                  const isDropTarget = dragOverDateKey === cell.dateKey;
                  const isHovered = hoveredDateKey === cell.dateKey;
                  const isWeekend = colIdx >= 5;

                  return (
                    <div
                      key={cell.dateKey}
                      onMouseEnter={() => setHoveredDateKey(cell.dateKey)}
                      onMouseLeave={() =>
                        setHoveredDateKey((prev) => (prev === cell.dateKey ? null : prev))
                      }
                      onClick={() => onCreateTaskForDate?.(cell.dateKey)}
                      style={{
                        borderRight: colIdx < 6 ? '1px solid #f0f0f0' : undefined,
                        backgroundColor: isDropTarget
                          ? '#e6f4ff'
                          : cell.isToday
                            ? '#f7fbff'
                            : !cell.isCurrentMonth
                              ? '#fcfcfd'
                              : isWeekend
                                ? '#fafafa'
                                : '#ffffff',
                        outline: isDropTarget ? '2px dashed #1677ff' : undefined,
                        outlineOffset: isDropTarget ? '-2px' : undefined,
                        cursor: onCreateTaskForDate ? 'pointer' : 'default',
                        padding: '4px 6px',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          height: 24,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 22,
                            height: 22,
                            padding: '0 5px',
                            borderRadius: 11,
                            fontSize: 12,
                            fontWeight: cell.isToday ? 600 : 500,
                            backgroundColor: cell.isToday ? '#1677ff' : 'transparent',
                            color: cell.isToday
                              ? '#ffffff'
                              : cell.isCurrentMonth
                                ? '#262626'
                                : '#bfbfbf',
                          }}
                        >
                          {cell.dayNumber}
                        </span>

                        {onCreateTaskForDate && (
                          <Tooltip title="Thêm công việc vào ngày này" mouseEnterDelay={0.4}>
                            <Button
                              type="text"
                              size="small"
                              aria-label={`Thêm công việc ngày ${cell.dateKey}`}
                              icon={<PlusOutlined style={{ fontSize: 11 }} />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onCreateTaskForDate(cell.dateKey);
                              }}
                              style={{
                                width: 20,
                                height: 20,
                                padding: 0,
                                opacity: isHovered ? 0.9 : 0.28,
                                color: '#1677ff',
                                transition: 'opacity 0.15s ease',
                              }}
                            />
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Layer 2: Multi-day span lanes & overflow triggers */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  paddingTop: 31,
                  paddingBottom: 4,
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gridTemplateRows: `repeat(${MAX_VISIBLE_LANES}, 24px)`,
                    gap: '3px 4px',
                    padding: '0 4px',
                  }}
                >
                  {visibleSegments.map((seg) => (
                    <div
                      key={`${weekIdx}-${seg.task.id}`}
                      style={{
                        gridColumn: `${seg.startCol + 1} / span ${seg.spanCols}`,
                        gridRow: seg.laneIndex + 1,
                        minWidth: 0,
                      }}
                    >
                      <CalendarTaskPill
                        task={seg.task}
                        canDrag={canDragTask(seg.task)}
                        isDragging={draggingTaskId === seg.task.id}
                        isMoving={movingTaskId === seg.task.id}
                        continuesBefore={seg.continuesBefore}
                        continuesAfter={seg.continuesAfter}
                        onClick={onEditTask}
                        onDragStartTask={onDragStartTask}
                        onDragEndTask={onDragEndTask}
                      />
                    </div>
                  ))}
                </div>

                {/* Overflow "+N việc" row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                    gap: '0 4px',
                    padding: '3px 4px 0',
                    minHeight: 20,
                  }}
                >
                  {dayEntries.map(({ cell, dayTasks, hiddenCount }) => (
                    <div key={cell.dateKey} style={{ minWidth: 0 }}>
                      {hiddenCount > 0 && (
                        <Popover
                          trigger="click"
                          placement="bottom"
                          open={openPopoverDateKey === cell.dateKey}
                          onOpenChange={(open) =>
                            setOpenPopoverDateKey(open ? cell.dateKey : null)
                          }
                          content={
                            <div
                              style={{ width: 290, maxWidth: '85vw' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 8,
                                  paddingBottom: 6,
                                  borderBottom: '1px solid #f0f0f0',
                                }}
                              >
                                <span style={{ fontWeight: 600, fontSize: 13 }}>
                                  {formatAgendaDayLabel(cell.dateKey, todayKey)}
                                </span>
                                {onCreateTaskForDate && (
                                  <Button
                                    type="link"
                                    size="small"
                                    icon={<PlusOutlined />}
                                    style={{ padding: 0, height: 'auto' }}
                                    onClick={() => {
                                      setOpenPopoverDateKey(null);
                                      onCreateTaskForDate(cell.dateKey);
                                    }}
                                  >
                                    Thêm
                                  </Button>
                                )}
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                  maxHeight: 260,
                                  overflowY: 'auto',
                                }}
                              >
                                {dayTasks.map((task) => (
                                  <CalendarTaskPill
                                    key={task.id}
                                    task={task}
                                    compact={false}
                                    canDrag={canDragTask(task)}
                                    isDragging={draggingTaskId === task.id}
                                    isMoving={movingTaskId === task.id}
                                    onClick={(clickedTask) => {
                                      setOpenPopoverDateKey(null);
                                      onEditTask(clickedTask);
                                    }}
                                    onDragStartTask={(dragged) => {
                                      setOpenPopoverDateKey(null);
                                      onDragStartTask?.(dragged);
                                    }}
                                    onDragEndTask={onDragEndTask}
                                  />
                                ))}
                              </div>
                            </div>
                          }
                        >
                          <Button
                            type="link"
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              pointerEvents: 'auto',
                              height: 18,
                              padding: '0 4px',
                              fontSize: 11,
                              fontWeight: 500,
                              color: '#1677ff',
                            }}
                          >
                            +{hiddenCount} việc
                          </Button>
                        </Popover>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMonthGrid;
