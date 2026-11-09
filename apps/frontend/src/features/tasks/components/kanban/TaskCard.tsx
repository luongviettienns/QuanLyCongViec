import { useSortable } from '@dnd-kit/react/sortable';
import type { Task, TaskStatus } from '../../types/task.types';
import type { TaskPermissions } from '../../utils/task-permission.utils';
import { TaskCardView } from './TaskCardView';

interface TaskCardProps {
  task: Task;
  index: number;
  columnId: TaskStatus;
  isFiltering?: boolean;
  permissions?: TaskPermissions;
  onEdit?: (task: Task) => void;
}

export function TaskCard({
  task,
  index,
  columnId,
  permissions,
  onEdit,
}: TaskCardProps) {
  const canDrag = permissions ? permissions.canDrag : true;

  const { ref, isDragging, isDropTarget } = useSortable({
    id: `task-${task.id}`,
    index,
    group: columnId,
    disabled: !canDrag,
    plugins: [],
    transition: null,
  });

  return (
    <div
      ref={ref}
      style={{
        marginBottom: 10,
        opacity: isDragging ? 0.35 : 1,
        touchAction: canDrag ? 'pan-y' : 'auto',
        borderTop: isDropTarget && !isDragging ? '3px solid #1677ff' : '3px solid transparent',
        transition: 'opacity 0.15s ease',
      }}
    >
      <TaskCardView
        task={task}
        isDragging={isDragging}
        permissions={permissions}
        onEdit={onEdit}
      />
    </div>
  );
}
