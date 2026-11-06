import { useState, useRef } from 'react';
import { Alert, Grid, Button } from 'antd';
import { DragDropProvider, DragOverlay } from '@dnd-kit/react';
import { PointerSensor, PointerActivationConstraints, KeyboardSensor } from '@dnd-kit/dom';
import type { Task, TaskStatus } from '../../types/task.types';
import { KanbanColumn, type ColumnConfig } from './KanbanColumn';
import { TaskCardView } from './TaskCardView';

interface Props {
  tasks: Task[];
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
  onStatusChange?: (taskId: number, newStatus: TaskStatus, newPosition?: number) => Promise<void>;
  isFiltering?: boolean;
}

const columns: ColumnConfig[] = [
  { id: 'TODO', title: 'Cần làm', color: '#fa8c16' },
  { id: 'IN_PROGRESS', title: 'Đang làm', color: '#1890ff' },
  { id: 'DONE', title: 'Hoàn thành', color: '#52c41a' },
];

export default function KanbanBoard({ tasks, onReorder, onStatusChange, isFiltering }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const screens = Grid.useBreakpoint();
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function scrollToColumn(columnId: string) {
    const el = columnRefs.current[columnId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }

  return (
    <div translate="no">
      {isFiltering && (
        <Alert
          message="Đang lọc dữ liệu: Vị trí trong cùng cột tạm thời được giữ nguyên. Bạn vẫn có thể kéo thả giữa các cột để chuyển trạng thái công việc."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {!screens.md && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 12,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {columns.map((column) => {
            const count = tasks.filter((t) => t.status === column.id).length;
            return (
              <Button
                key={column.id}
                size="small"
                shape="round"
                onClick={() => scrollToColumn(column.id)}
                style={{
                  borderColor: column.color,
                  color: column.color,
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {column.title} ({count})
              </Button>
            );
          })}
        </div>
      )}

      <DragDropProvider
        sensors={[
          PointerSensor.configure({
            activationConstraints: () => [
              new PointerActivationConstraints.Distance({ value: 5 }),
            ],
          }),
          KeyboardSensor,
        ]}
        onDragStart={(event) => {
          const sourceIdStr = String(event.operation.source?.id);
          if (sourceIdStr.startsWith('task-')) {
            const sourceTaskId = Number(sourceIdStr.replace('task-', ''));
            const sourceTask = tasks.find((t) => t.id === sourceTaskId);
            setActiveTask(sourceTask || null);
          }
        }}
        onDragEnd={(event) => {
          setActiveTask(null);
          if (event.canceled) return;

          const { source, target } = event.operation;
          if (!source || !target) return;

          const sourceIdStr = String(source.id);
          const targetIdStr = String(target.id);

          if (!sourceIdStr.startsWith('task-')) return;
          const sourceTaskId = Number(sourceIdStr.replace('task-', ''));
          const draggedTask = tasks.find((t) => t.id === sourceTaskId);
          if (!draggedTask) return;

          const sourceColumn = draggedTask.status;

          let targetColumn: TaskStatus | null = null;
          let targetIndex = -1;

          if (targetIdStr.startsWith('column-')) {
            targetColumn = targetIdStr.replace('column-', '') as TaskStatus;
            const destTasks = tasks
              .filter((t) => t.status === targetColumn)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            targetIndex = destTasks.length;
          } else if (targetIdStr.startsWith('task-')) {
            const targetTaskId = Number(targetIdStr.replace('task-', ''));
            const targetTask = tasks.find((t) => t.id === targetTaskId);
            if (!targetTask) return;
            targetColumn = targetTask.status;

            const destTasks = tasks
              .filter((t) => t.status === targetColumn)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            targetIndex = destTasks.findIndex((t) => t.id === targetTaskId);
            if (targetIndex === -1) targetIndex = destTasks.length;
          }

          if (!targetColumn) return;

          if (sourceColumn === targetColumn) {
            if (isFiltering) {
              return;
            }
            const colTasks = tasks
              .filter((t) => t.status === sourceColumn)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

            const oldIndex = colTasks.findIndex((t) => t.id === sourceTaskId);
            if (oldIndex === -1 || oldIndex === targetIndex) return;

            const newColTasks = [...colTasks];
            const [movedItem] = newColTasks.splice(oldIndex, 1);
            newColTasks.splice(targetIndex, 0, movedItem);

            const newIds = newColTasks.map((t) => t.id);
            setTimeout(() => {
              void onReorder(newIds, sourceColumn);
            }, 0);
          } else {
            if (onStatusChange) {
              setTimeout(() => {
                void onStatusChange(sourceTaskId, targetColumn, targetIndex);
              }, 0);
            } else {
              const destTasks = tasks
                .filter((t) => t.status === targetColumn && t.id !== sourceTaskId)
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

              const newDestTasks = [...destTasks];
              const movedItem = { ...draggedTask, status: targetColumn };
              newDestTasks.splice(targetIndex, 0, movedItem);

              const newIds = newDestTasks.map((t) => t.id);
              setTimeout(() => {
                void onReorder(newIds, targetColumn);
              }, 0);
            }
          }
        }}
      >
        <div
          style={{
            display: screens.md ? 'grid' : 'flex',
            gridTemplateColumns: screens.md ? 'repeat(3, 1fr)' : undefined,
            overflowX: screens.md ? 'visible' : 'auto',
            gap: 16,
            paddingBottom: screens.md ? 0 : 12,
            scrollSnapType: screens.md ? undefined : 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasks}
              isFiltering={isFiltering}
              domRef={(el) => {
                columnRefs.current[column.id] = el;
              }}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div style={{ width: 280, cursor: 'grabbing' }}>
              <TaskCardView task={activeTask} isDragging />
            </div>
          ) : null}
        </DragOverlay>
      </DragDropProvider>
    </div>
  );
}
