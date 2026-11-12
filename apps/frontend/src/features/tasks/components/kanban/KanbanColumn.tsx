import { Badge, Tooltip } from 'antd';
import { useDroppable } from '@dnd-kit/react';
import type { Task, TaskStatus } from '../../types/task.types';
import type { TaskPermissions } from '../../utils/task-permission.utils';
import { TaskCard } from './TaskCard';
import { useResponsive } from '../../../../shared/hooks';

export interface ColumnConfig {
  id: TaskStatus;
  title: string;
  color: string;
}

interface KanbanColumnProps {
  column: ColumnConfig;
  tasks: Task[];
  isFiltering?: boolean;
  domRef?: (node: HTMLDivElement | null) => void;
  activeTask?: Task | null;
  activeTaskPermissions?: TaskPermissions | null;
  taskPermissionsMap?: Record<number, TaskPermissions>;
  onEdit?: (task: Task) => void;
}

export function KanbanColumn({
  column,
  tasks,
  isFiltering,
  domRef,
  activeTask,
  activeTaskPermissions,
  taskPermissionsMap = {},
  onEdit,
}: KanbanColumnProps) {
  const screens = useResponsive();
  const { ref, isDropTarget } = useDroppable({
    id: `column-${column.id}`,
    disabled: false,
  });

  const columnTasks = tasks
    .filter((task) => task.status === column.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Determine if this column is a valid drop target for currently dragged task
  const isDraggingOverOtherColumn = Boolean(
    activeTask && activeTask.status !== column.id,
  );
  const isDestinationAllowed = Boolean(
    activeTaskPermissions?.allowedNextStatuses.includes(column.id),
  );
  const isInvalidHover = isDropTarget && isDraggingOverOtherColumn && !isDestinationAllowed;
  const isValidHover = isDropTarget && (!isDraggingOverOtherColumn || isDestinationAllowed);

  let columnBackground = '#f8f9fa';
  let columnBorder = '2px solid #e9ecef';

  if (isInvalidHover) {
    columnBackground = '#fff1f0';
    columnBorder = '2px dashed #ff4d4f';
  } else if (isValidHover) {
    columnBackground = '#e6f4ff';
    columnBorder = '2px dashed #1677ff';
  }

  return (
    <div
      ref={(node) => {
        ref(node);
        domRef?.(node);
      }}
      style={{
        background: columnBackground,
        padding: 16,
        borderRadius: 8,
        minHeight: 320,
        border: columnBorder,
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        minWidth: screens.md ? undefined : 280,
        width: screens.md ? undefined : '82vw',
        flexShrink: screens.md ? undefined : 0,
        scrollSnapAlign: screens.md ? undefined : 'start',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{column.title}</span>
          {isInvalidHover && (
            <Tooltip title="Bạn không có quyền chuyển công việc trực tiếp vào trạng thái này">
              <span
                style={{
                  fontSize: 11,
                  color: '#cf1322',
                  backgroundColor: '#ffccc7',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontWeight: 500,
                }}
              >
                Không được phép
              </span>
            </Tooltip>
          )}
        </div>
        <Badge
          count={columnTasks.length}
          style={{
            backgroundColor: column.color,
            boxShadow: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        {columnTasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            columnId={column.id}
            isFiltering={isFiltering}
            permissions={taskPermissionsMap[task.id]}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}
