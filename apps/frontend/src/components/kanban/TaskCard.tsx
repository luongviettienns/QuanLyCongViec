import { useSortable } from '@dnd-kit/react/sortable';
import type { Task, TaskStatus } from '../../types/task.types';
import { TaskCardView } from './TaskCardView';

interface TaskCardProps {
  task: Task;
  index: number;
  columnId: TaskStatus;
  isFiltering?: boolean;
}

export function TaskCard({
  task,
  index,
  columnId,
  isFiltering,
}: TaskCardProps) {
  const { ref, isDragging, isDropTarget } = useSortable({
    id: `task-${task.id}`,
    index,
    group: columnId,
    disabled: isFiltering,
    plugins: [],
    transition: null,
  });

  return (
    <div
      ref={ref}
      style={{
        marginBottom: 10,
        cursor: isFiltering ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        touchAction: isFiltering ? 'auto' : 'none',
        borderTop: isDropTarget && !isDragging ? '3px solid #1677ff' : '3px solid transparent',
        transition: 'opacity 0.15s ease',
      }}
    >
      <TaskCardView task={task} isDragging={isDragging} />
    </div>
  );
}
