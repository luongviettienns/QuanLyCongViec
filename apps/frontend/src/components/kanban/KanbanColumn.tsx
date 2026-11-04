import { Badge, Grid } from 'antd';
import { useDroppable } from '@dnd-kit/react';
import type { Task, TaskStatus } from '../../types/task.types';
import { TaskCard } from './TaskCard';

export interface ColumnConfig {
  id: TaskStatus;
  title: string;
  color: string;
}

interface KanbanColumnProps {
  column: ColumnConfig;
  tasks: Task[];
  isFiltering?: boolean;
}

export function KanbanColumn({
  column,
  tasks,
  isFiltering,
}: KanbanColumnProps) {
  const screens = Grid.useBreakpoint();
  const { ref, isDropTarget } = useDroppable({
    id: `column-${column.id}`,
    disabled: isFiltering,
  });

  const columnTasks = tasks
    .filter((task) => task.status === column.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div
      ref={ref}
      style={{
        background: isDropTarget ? '#e6f4ff' : '#f8f9fa',
        padding: 16,
        borderRadius: 8,
        minHeight: 320,
        border: isDropTarget ? '2px dashed #1677ff' : '2px solid #e9ecef',
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
        <span style={{ fontWeight: 600, fontSize: 15 }}>{column.title}</span>
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
          />
        ))}
      </div>
    </div>
  );
}
