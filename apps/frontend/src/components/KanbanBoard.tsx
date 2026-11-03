import { useState } from 'react';
import { Card, Badge, Alert, Tag } from 'antd';
import { DragDropProvider, useDroppable, DragOverlay } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { PointerSensor, PointerActivationConstraints, KeyboardSensor } from '@dnd-kit/dom';
import type { Task, TaskStatus } from '../types/task.types';

interface Props {
  tasks: Task[];
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
  isFiltering?: boolean;
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'TODO', title: 'Cần làm', color: '#fa8c16' },
  { id: 'IN_PROGRESS', title: 'Đang làm', color: '#1890ff' },
  { id: 'DONE', title: 'Hoàn thành', color: '#52c41a' },
];

const priorityMap: Record<string, { color: string; label: string }> = {
  HIGH: { color: 'red', label: 'Cao' },
  MEDIUM: { color: 'orange', label: 'Trung bình' },
  LOW: { color: 'blue', label: 'Thấp' },
};

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function checkIsOverdue(dueDateStr?: string | null, status?: TaskStatus) {
  if (!dueDateStr || status === 'DONE') return false;
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return false;
  return due.getTime() < Date.now();
}

function TaskCard({
  task,
  index,
  columnId,
  isFiltering,
}: {
  task: Task;
  index: number;
  columnId: TaskStatus;
  isFiltering?: boolean;
}) {
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
      <Card
        size="small"
        style={{
          boxShadow: isDragging
            ? '0 8px 20px rgba(0,0,0,0.18)'
            : '0 1px 3px rgba(0,0,0,0.06)',
          borderRadius: 6,
          background: isDragging ? '#fafafa' : '#ffffff',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ fontWeight: 600, color: '#333', flex: 1 }}>{task.title}</div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {task.category && (
              <Tag color={task.category.color} style={{ fontSize: 11, margin: 0 }}>
                {task.category.name}
              </Tag>
            )}
            {task.priority && priorityMap[task.priority] && (
              <Tag color={priorityMap[task.priority].color} style={{ fontSize: 11, margin: 0 }}>
                {priorityMap[task.priority].label}
              </Tag>
            )}
          </div>
        </div>
        {task.description && (
          <div
            style={{
              fontSize: 12,
              color: '#666',
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {task.description}
          </div>
        )}
        {(task.startDate || task.dueDate) && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {task.startDate && (
              <Tag style={{ fontSize: 11, margin: 0 }}>
                Từ: {formatDate(task.startDate)}
              </Tag>
            )}
            {task.dueDate && (
              <Tag
                color={checkIsOverdue(task.dueDate, task.status) ? 'error' : 'default'}
                style={{ fontSize: 11, margin: 0 }}
              >
                Hạn: {formatDate(task.dueDate)}
                {checkIsOverdue(task.dueDate, task.status) ? ' (Quá hạn)' : ''}
              </Tag>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  isFiltering,
}: {
  column: (typeof columns)[number];
  tasks: Task[];
  isFiltering?: boolean;
}) {
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
          style={{ backgroundColor: column.color }}
        />
      </div>

      <div style={{ flex: 1 }}>
        {columnTasks.length > 0 ? (
          columnTasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              index={index}
              columnId={column.id}
              isFiltering={isFiltering}
            />
          ))
        ) : (
          <div
            key="empty-placeholder"
            style={{
              textAlign: 'center',
              color: '#adb5bd',
              padding: '40px 0',
              fontSize: 13,
              border: '1px dashed #dee2e6',
              borderRadius: 6,
              marginTop: 10,
            }}
          >
            {isFiltering ? 'Không có công việc phù hợp' : 'Kéo thả vào đây'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({ tasks, onReorder, isFiltering }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  return (
    <div translate="no">
      {isFiltering && (
        <Alert
          type="info"
          showIcon
          message="Đang áp dụng bộ lọc dữ liệu"
          description="Chức năng kéo thả sắp xếp tạm thời được khóa để bảo toàn thứ tự công việc của các thẻ đang bị ẩn."
          style={{ marginBottom: 16 }}
        />
      )}
      <DragDropProvider
        sensors={[
          PointerSensor.configure({
            activationConstraints: () => [
              new PointerActivationConstraints.Distance({ value: 3 }),
            ],
          }),
          KeyboardSensor,
        ]}
        onDragStart={(event) => {
          if (isFiltering) return;
          const sourceIdStr = String(event.operation.source?.id);
          if (sourceIdStr.startsWith('task-')) {
            const sourceTaskId = Number(sourceIdStr.replace('task-', ''));
            const sourceTask = tasks.find((t) => t.id === sourceTaskId);
            setActiveTask(sourceTask || null);
          }
        }}
        onDragEnd={(event) => {
          setActiveTask(null);
          if (isFiltering || event.canceled) return;

          const { source, target } = event.operation;
          if (!source || !target) return;

          const sourceIdStr = String(source.id);
          if (!sourceIdStr.startsWith('task-')) return;

          const sourceTaskId = Number(sourceIdStr.replace('task-', ''));
          const sourceTask = tasks.find((t) => t.id === sourceTaskId);
          if (!sourceTask) return;

          const sourceColumn = sourceTask.status;

          const targetIdStr = String(target.id);
          let targetColumn: TaskStatus | undefined;
          let targetTaskId: number | undefined;

          if (targetIdStr.startsWith('task-')) {
            targetTaskId = Number(targetIdStr.replace('task-', ''));
            const targetTask = tasks.find((t) => t.id === targetTaskId);
            if (targetTask) {
              targetColumn = targetTask.status;
            }
          } else if (targetIdStr.startsWith('column-')) {
            targetColumn = targetIdStr.replace('column-', '') as TaskStatus;
          }

          if (!targetColumn) return;

          if (sourceColumn === targetColumn) {
            const currentColumnTasks = tasks
              .filter((t) => t.status === sourceColumn)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

            const fromIndex = currentColumnTasks.findIndex(
              (t) => t.id === sourceTaskId
            );

            const toIndex = targetTaskId !== undefined
              ? currentColumnTasks.findIndex((t) => t.id === targetTaskId)
              : fromIndex;

            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
              return;
            }

            const updatedList = [...currentColumnTasks];
            const [movedItem] = updatedList.splice(fromIndex, 1);
            updatedList.splice(toIndex, 0, movedItem);

            const orderedIds = updatedList.map((t) => t.id);
            setTimeout(() => {
              void onReorder(orderedIds, sourceColumn);
            }, 0);
          }

          if (sourceColumn !== targetColumn) {
            const targetColumnTasks = tasks
              .filter((t) => t.status === targetColumn)
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

            let insertIndex = targetTaskId !== undefined
              ? targetColumnTasks.findIndex((t) => t.id === targetTaskId)
              : targetColumnTasks.length;

            if (insertIndex === -1) {
              insertIndex = targetColumnTasks.length;
            }

            const updatedTargetList = [...targetColumnTasks];
            updatedTargetList.splice(insertIndex, 0, {
              ...sourceTask,
              status: targetColumn,
            });

            const orderedIds = updatedTargetList.map((t) => t.id);
            setTimeout(() => {
              void onReorder(orderedIds, targetColumn);
            }, 0);
          }
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 16,
          }}
        >
          {columns.map((column) => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasks}
              isFiltering={isFiltering}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <Card
              size="small"
              style={{
                boxShadow: '0 12px 28px rgba(0,0,0,0.22)',
                borderRadius: 6,
                background: '#ffffff',
                width: 280,
                cursor: 'grabbing',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontWeight: 600, color: '#333', flex: 1 }}>{activeTask.title}</div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {activeTask.category && (
                    <Tag color={activeTask.category.color} style={{ fontSize: 11, margin: 0 }}>
                      {activeTask.category.name}
                    </Tag>
                  )}
                  {activeTask.priority && priorityMap[activeTask.priority] && (
                    <Tag color={priorityMap[activeTask.priority].color} style={{ fontSize: 11, margin: 0 }}>
                      {priorityMap[activeTask.priority].label}
                    </Tag>
                  )}
                </div>
              </div>
              {activeTask.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeTask.description}
                </div>
              )}
            </Card>
          ) : null}
        </DragOverlay>
      </DragDropProvider>
    </div>
  );
}
