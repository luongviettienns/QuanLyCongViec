import { useCallback, useMemo, useState } from 'react';
import {
  Button,
  Drawer,
  Empty,
  Popover,
  Segmented,
  Spin,
  Tag,
  type SegmentedProps,
} from 'antd';
import {
  BgColorsOutlined,
  CalendarOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import type { Task, TaskPriority, TaskStatus } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import { useAuth } from '../../../auth/hooks/useAuth';
import { useResponsive } from '../../../../shared/hooks';
import {
  CALENDAR_PRIORITY_VISUAL,
  CALENDAR_STATUS_VISUAL,
  canDragCalendarTask,
  computeShiftedTaskDates,
  formatCalendarHeaderTitle,
  getVietnamTodayKey,
  partitionCalendarTasks,
  shiftAnchorDateKey,
  toDateKey,
  type CalendarSubView,
} from '../../utils/calendar-date.utils.ts';
import { CalendarTaskPill } from './CalendarTaskPill';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { CalendarWeekGrid } from './CalendarWeekGrid';
import { CalendarDayGrid } from './CalendarDayGrid';
import { CalendarAgendaView } from './CalendarAgendaView';

export interface TaskCalendarViewProps {
  tasks: Task[];
  teams?: Team[];
  loading?: boolean;
  onEditTask: (task: Task) => void;
  onCreateTaskForDate?: (dateKey: string) => void;
  onMoveTaskDate?: (task: Task, targetDateKey: string) => Promise<boolean | void>;
}

const SUB_VIEW_OPTIONS: NonNullable<SegmentedProps<CalendarSubView>['options']> = [
  { value: 'month', label: 'Tháng' },
  { value: 'week', label: 'Tuần' },
  { value: 'day', label: 'Ngày' },
  { value: 'agenda', label: 'Lịch biểu' },
];

const STATUS_LEGEND_ORDER: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
const PRIORITY_LEGEND_ORDER: readonly TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];

export function TaskCalendarView({
  tasks,
  teams = [],
  loading = false,
  onEditTask,
  onCreateTaskForDate,
  onMoveTaskDate,
}: TaskCalendarViewProps) {
  const { user } = useAuth();
  const screens = useResponsive();
  const todayKey = getVietnamTodayKey();

  const [subView, setSubView] = useState<CalendarSubView>(() =>
    screens.xs ? 'agenda' : 'month',
  );
  const [anchorDateKey, setAnchorDateKey] = useState<string>(() => getVietnamTodayKey());
  const [draggingTask, setDraggingTask] = useState<Task | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<number | null>(null);
  const [unscheduledOpen, setUnscheduledOpen] = useState(false);

  const { scheduled: scheduledTasks, unscheduled: unscheduledTasks } = useMemo(
    () => partitionCalendarTasks(tasks),
    [tasks],
  );

  const headerTitle = useMemo(
    () => formatCalendarHeaderTitle(subView, anchorDateKey),
    [subView, anchorDateKey],
  );

  const canDragTask = useCallback(
    (task: Task): boolean =>
      Boolean(onMoveTaskDate) && canDragCalendarTask(user, task, teams),
    [onMoveTaskDate, user, teams],
  );

  const handleDragStartTask = useCallback((task: Task) => {
    setDraggingTask(task);
  }, []);

  const handleDragEndTask = useCallback(() => {
    setDraggingTask(null);
    setDragOverDateKey(null);
  }, []);

  const handleDragOverDate = useCallback((dateKey: string) => {
    setDragOverDateKey((prev) => (prev === dateKey ? prev : dateKey));
  }, []);

  const handleDragLeaveDate = useCallback(() => {
    setDragOverDateKey(null);
  }, []);

  const handleDropOnDate = useCallback(
    async (targetDateKey: string, taskIdFromTransfer?: number) => {
      const targetTask =
        draggingTask ??
        (taskIdFromTransfer !== undefined
          ? tasks.find((item) => item.id === taskIdFromTransfer) ?? null
          : null);

      setDraggingTask(null);
      setDragOverDateKey(null);

      if (!targetTask || !onMoveTaskDate || !canDragTask(targetTask)) {
        return;
      }

      const nextDates = computeShiftedTaskDates(targetTask, targetDateKey);
      const currentStart = toDateKey(targetTask.startDate);
      const currentDue = toDateKey(targetTask.dueDate);
      if (nextDates.startDate === currentStart && nextDates.dueDate === currentDue) {
        return;
      }

      try {
        setMovingTaskId(targetTask.id);
        await onMoveTaskDate(targetTask, targetDateKey);
      } finally {
        setMovingTaskId(null);
      }
    },
    [draggingTask, tasks, onMoveTaskDate, canDragTask],
  );

  const legendContent = (
    <div style={{ width: 250, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#262626' }}>
        Trạng thái (viền trái)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
        {STATUS_LEGEND_ORDER.map((status) => {
          const v = CALENDAR_STATUS_VISUAL[status];
          return (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  backgroundColor: v.softBg,
                  borderLeft: `3px solid ${v.accent}`,
                  borderTop: `1px solid ${v.borderColor}`,
                  borderRight: `1px solid ${v.borderColor}`,
                  borderBottom: `1px solid ${v.borderColor}`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: '#595959',
                  textDecoration: status === 'DONE' ? 'line-through' : 'none',
                }}
              >
                {v.label}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontWeight: 600, marginBottom: 6, color: '#262626' }}>
        Độ ưu tiên (chấm màu)
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {PRIORITY_LEGEND_ORDER.map((priority) => {
          const p = CALENDAR_PRIORITY_VISUAL[priority];
          return (
            <div key={priority} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: p.color,
                  display: 'inline-block',
                }}
              />
              <span style={{ color: '#595959' }}>{p.label}</span>
            </div>
          );
        })}
      </div>

      <div
        style={{
          paddingTop: 8,
          borderTop: '1px solid #f0f0f0',
          color: '#8c8c8c',
          lineHeight: 1.45,
        }}
      >
        Kéo thả công việc vào ngày khác để dời lịch. Nhấp vào ô ngày hoặc nút + để thêm việc mới.
      </div>
    </div>
  );

  const unscheduledListContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
        {onMoveTaskDate && !screens.xs
          ? 'Nhấp vào công việc để chọn ngày, hoặc kéo trực tiếp sang ô lịch.'
          : 'Nhấp vào công việc để đặt ngày bắt đầu hoặc hạn chót.'}
      </div>

      {unscheduledTasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Tất cả công việc đã được xếp ngày"
        />
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: screens.xs ? '50vh' : 300,
            overflowY: 'auto',
          }}
        >
          {unscheduledTasks.map((task) => (
            <CalendarTaskPill
              key={task.id}
              task={task}
              compact={false}
              canDrag={canDragTask(task)}
              isDragging={draggingTask?.id === task.id}
              isMoving={movingTaskId === task.id}
              onClick={(clickedTask) => {
                setUnscheduledOpen(false);
                onEditTask(clickedTask);
              }}
              onDragStartTask={handleDragStartTask}
              onDragEndTask={handleDragEndTask}
            />
          ))}
        </div>
      )}

      {onCreateTaskForDate && (
        <div style={{ paddingTop: 6, borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            style={{ padding: 0 }}
            onClick={() => {
              setUnscheduledOpen(false);
              onCreateTaskForDate(anchorDateKey);
            }}
          >
            Tạo công việc cho ngày đang xem
          </Button>
        </div>
      )}
    </div>
  );

  const unscheduledTrigger = (
    <Button
      size="small"
      type="dashed"
      icon={<CalendarOutlined />}
      onClick={() => setUnscheduledOpen((prev) => !prev)}
    >
      Chưa xếp ngày ({unscheduledTasks.length})
    </Button>
  );

  return (
    <div
      translate="no"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Calendar Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          padding: '10px 12px',
          backgroundColor: '#ffffff',
          border: '1px solid #f0f0f0',
          borderRadius: 8,
        }}
      >
        {/* Navigation Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Button
            size="small"
            onClick={() => setAnchorDateKey(getVietnamTodayKey())}
          >
            Hôm nay
          </Button>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Button
              size="small"
              aria-label="Khoảng trước"
              icon={<LeftOutlined />}
              onClick={() =>
                setAnchorDateKey((prev) => shiftAnchorDateKey(subView, prev, -1))
              }
            />
            <span
              style={{
                fontWeight: 600,
                fontSize: screens.xs ? 14 : 15,
                color: '#262626',
                padding: '0 6px',
                minWidth: screens.xs ? undefined : 136,
                textAlign: 'center',
              }}
            >
              {headerTitle}
            </span>
            <Button
              size="small"
              aria-label="Khoảng sau"
              icon={<RightOutlined />}
              onClick={() =>
                setAnchorDateKey((prev) => shiftAnchorDateKey(subView, prev, 1))
              }
            />
          </div>

          <Tag color="blue" style={{ margin: 0 }}>
            {scheduledTasks.length} đã xếp lịch
          </Tag>
        </div>

        {/* Sub-view Switcher, Unscheduled Pill & Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Segmented<CalendarSubView>
            size="small"
            value={subView}
            onChange={setSubView}
            options={SUB_VIEW_OPTIONS}
          />

          {unscheduledTasks.length > 0 &&
            (screens.xs ? (
              <>
                {unscheduledTrigger}
                <Drawer
                  title={`Công việc chưa xếp ngày (${unscheduledTasks.length})`}
                  placement="bottom"
                  open={unscheduledOpen}
                  onClose={() => setUnscheduledOpen(false)}
                  size="default"
                >
                  {unscheduledListContent}
                </Drawer>
              </>
            ) : (
              <Popover
                title={`Chưa xếp ngày (${unscheduledTasks.length})`}
                trigger="click"
                placement="bottomRight"
                open={unscheduledOpen}
                onOpenChange={setUnscheduledOpen}
                content={
                  <div style={{ width: 320, maxWidth: '85vw' }}>
                    {unscheduledListContent}
                  </div>
                }
              >
                {unscheduledTrigger}
              </Popover>
            ))}

          <Popover
            title="Chú giải màu & thao tác"
            trigger="click"
            placement="bottomRight"
            content={legendContent}
          >
            <Button size="small" icon={<BgColorsOutlined />}>
              {screens.xs ? null : 'Chú giải màu'}
            </Button>
          </Popover>
        </div>
      </div>

      {/* Calendar Body */}
      <Spin spinning={loading}>
        {subView === 'month' && (
          <CalendarMonthGrid
            tasks={scheduledTasks}
            anchorDateKey={anchorDateKey}
            todayKey={todayKey}
            draggingTaskId={draggingTask?.id ?? null}
            movingTaskId={movingTaskId}
            dragOverDateKey={dragOverDateKey}
            canDragTask={canDragTask}
            onEditTask={onEditTask}
            onCreateTaskForDate={onCreateTaskForDate}
            onDragStartTask={handleDragStartTask}
            onDragEndTask={handleDragEndTask}
            onDragOverDate={handleDragOverDate}
            onDragLeaveDate={handleDragLeaveDate}
            onDropOnDate={(dateKey, taskId) => void handleDropOnDate(dateKey, taskId)}
          />
        )}

        {subView === 'week' && (
          <CalendarWeekGrid
            tasks={scheduledTasks}
            anchorDateKey={anchorDateKey}
            todayKey={todayKey}
            draggingTaskId={draggingTask?.id ?? null}
            movingTaskId={movingTaskId}
            dragOverDateKey={dragOverDateKey}
            canDragTask={canDragTask}
            onEditTask={onEditTask}
            onCreateTaskForDate={onCreateTaskForDate}
            onDragStartTask={handleDragStartTask}
            onDragEndTask={handleDragEndTask}
            onDragOverDate={handleDragOverDate}
            onDragLeaveDate={handleDragLeaveDate}
            onDropOnDate={(dateKey, taskId) => void handleDropOnDate(dateKey, taskId)}
          />
        )}

        {subView === 'day' && (
          <CalendarDayGrid
            tasks={scheduledTasks}
            anchorDateKey={anchorDateKey}
            todayKey={todayKey}
            draggingTaskId={draggingTask?.id ?? null}
            movingTaskId={movingTaskId}
            dragOverDateKey={dragOverDateKey}
            canDragTask={canDragTask}
            onEditTask={onEditTask}
            onCreateTaskForDate={onCreateTaskForDate}
            onDragStartTask={handleDragStartTask}
            onDragEndTask={handleDragEndTask}
            onDragOverDate={handleDragOverDate}
            onDragLeaveDate={handleDragLeaveDate}
            onDropOnDate={(dateKey, taskId) => void handleDropOnDate(dateKey, taskId)}
          />
        )}

        {subView === 'agenda' && (
          <CalendarAgendaView
            tasks={scheduledTasks}
            unscheduledCount={unscheduledTasks.length}
            anchorDateKey={anchorDateKey}
            todayKey={todayKey}
            draggingTaskId={draggingTask?.id ?? null}
            movingTaskId={movingTaskId}
            dragOverDateKey={dragOverDateKey}
            canDragTask={canDragTask}
            onEditTask={onEditTask}
            onCreateTaskForDate={onCreateTaskForDate}
            onOpenUnscheduled={() => setUnscheduledOpen(true)}
            onDragStartTask={handleDragStartTask}
            onDragEndTask={handleDragEndTask}
            onDragOverDate={handleDragOverDate}
            onDragLeaveDate={handleDragLeaveDate}
            onDropOnDate={(dateKey, taskId) => void handleDropOnDate(dateKey, taskId)}
          />
        )}
      </Spin>
    </div>
  );
}

export default TaskCalendarView;
