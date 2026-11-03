import { useState } from 'react';
import { Card, Badge, Alert, Tag } from 'antd';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  position?: number;
  startDate?: string | null;
  dueDate?: string | null;
}

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

function useSortable({
  id,
  index,
  group,
  isDragging,
  isOver,
  disabled,
}: {
  id: number;
  index: number;
  group: TaskStatus;
  isDragging: boolean;
  isOver: boolean;
  disabled?: boolean;
}) {
  return {
    id,
    index,
    group,
    isDragging,
    isOver,
    dragProps: {
      draggable: !disabled,
    },
  };
}

function TaskCard({
  task,
  index,
  columnId,
  isDragging,
  isOver,
  isFiltering,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
}: {
  task: Task;
  index: number;
  columnId: TaskStatus;
  isDragging: boolean;
  isOver: boolean;
  isFiltering?: boolean;
  onDragStart: (task: Task, index: number, columnId: TaskStatus) => void;
  onDragEnd: () => void;
  onDragEnter: (taskId: number) => void;
  onDrop: (targetTask: Task, targetIndex: number, targetColumn: TaskStatus) => void;
}) {
  const { dragProps } = useSortable({
    id: task.id,
    index,
    group: columnId,
    isDragging,
    isOver,
    disabled: isFiltering,
  });

  return (
    <div
      {...dragProps}
      onDragStart={() => {
        if (isFiltering) return;
        onDragStart(task, index, columnId);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (isFiltering) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => {
        if (isFiltering) return;
        onDragEnter(task.id);
      }}
      onDrop={(e) => {
        if (isFiltering) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop(task, index, columnId);
      }}
      style={{
        marginBottom: 10,
        cursor: isFiltering ? 'default' : (isDragging ? 'grabbing' : 'grab'),
        opacity: isDragging ? 0.35 : 1,
        transition: 'all 0.15s ease',
        borderTop: isOver && !isDragging && !isFiltering ? '3px solid #1677ff' : '3px solid transparent',
        paddingTop: isOver && !isDragging && !isFiltering ? 4 : 0,
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
        <div style={{ fontWeight: 600, color: '#333' }}>{task.title}</div>
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
  activeTaskId,
  hoverTaskId,
  hoverColumnId,
  isFiltering,
  onDragStart,
  onDragEnd,
  onCardDragEnter,
  onColumnDragEnter,
  onCardDrop,
  onColumnDrop,
}: {
  column: (typeof columns)[number];
  tasks: Task[];
  activeTaskId: number | null;
  hoverTaskId: number | null;
  hoverColumnId: TaskStatus | null;
  isFiltering?: boolean;
  onDragStart: (task: Task, index: number, columnId: TaskStatus) => void;
  onDragEnd: () => void;
  onCardDragEnter: (taskId: number) => void;
  onColumnDragEnter: (columnId: TaskStatus) => void;
  onCardDrop: (targetTask: Task, targetIndex: number, targetColumn: TaskStatus) => void;
  onColumnDrop: (columnId: TaskStatus) => void;
}) {
  const columnTasks = tasks
    .filter((task) => task.status === column.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const isColumnHovered = !isFiltering && hoverColumnId === column.id && activeTaskId !== null;

  return (
    <div
      onDragOver={(e) => {
        if (isFiltering) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => {
        if (isFiltering) return;
        onColumnDragEnter(column.id);
      }}
      onDrop={(e) => {
        if (isFiltering) return;
        e.preventDefault();
        onColumnDrop(column.id);
      }}
      style={{
        background: isColumnHovered ? '#e6f4ff' : '#f8f9fa',
        padding: 16,
        borderRadius: 8,
        minHeight: 320,
        border: isColumnHovered ? '2px dashed #1677ff' : '2px solid #e9ecef',
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
        {columnTasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            columnId={column.id}
            isDragging={activeTaskId === task.id}
            isOver={hoverTaskId === task.id}
            isFiltering={isFiltering}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragEnter={onCardDragEnter}
            onDrop={onCardDrop}
          />
        ))}

        {columnTasks.length === 0 && (
          <div
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
  const [activeColumnId, setActiveColumnId] = useState<TaskStatus | null>(null);
  const [activeFromIndex, setActiveFromIndex] = useState<number | null>(null);

  const [hoverTaskId, setHoverTaskId] = useState<number | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<TaskStatus | null>(null);

  function handleDragStart(task: Task, index: number, columnId: TaskStatus) {
    if (isFiltering) return;
    setActiveTask(task);
    setActiveColumnId(columnId);
    setActiveFromIndex(index);
  }

  function handleDragEnd() {
    setActiveTask(null);
    setActiveColumnId(null);
    setActiveFromIndex(null);
    setHoverTaskId(null);
    setHoverColumnId(null);
  }

  function handleCardDrop(_targetTask: Task, targetIndex: number, targetColumn: TaskStatus) {
    if (isFiltering) {
      handleDragEnd();
      return;
    }
    if (!activeTask || activeFromIndex === null || !activeColumnId) {
      handleDragEnd();
      return;
    }

    if (activeColumnId === targetColumn) {
      const currentColumnTasks = tasks
        .filter((t) => t.status === activeColumnId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const fromIndex = activeFromIndex;
      const toIndex = targetIndex;

      if (fromIndex === toIndex) {
        handleDragEnd();
        return;
      }

      const updatedList = [...currentColumnTasks];
      const [movedItem] = updatedList.splice(fromIndex, 1);
      updatedList.splice(toIndex, 0, movedItem);

      const orderedIds = updatedList.map((t) => t.id);

      void onReorder(orderedIds, activeColumnId);
    }

    if (activeColumnId !== targetColumn) {
      const targetColumnTasks = tasks
        .filter((t) => t.status === targetColumn)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const updatedTargetList = [...targetColumnTasks];
      updatedTargetList.splice(targetIndex, 0, {
        ...activeTask,
        status: targetColumn,
      });

      const orderedIds = updatedTargetList.map((t) => t.id);

      void onReorder(orderedIds, targetColumn);
    }

    handleDragEnd();
  }

  function handleColumnDrop(targetColumn: TaskStatus) {
    if (isFiltering) {
      handleDragEnd();
      return;
    }
    if (!activeTask || !activeColumnId) {
      handleDragEnd();
      return;
    }

    if (activeColumnId === targetColumn) {
      handleDragEnd();
      return;
    }

    const targetColumnTasks = tasks
      .filter((t) => t.status === targetColumn)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const updatedTargetList = [
      ...targetColumnTasks,
      { ...activeTask, status: targetColumn },
    ];

    const orderedIds = updatedTargetList.map((t) => t.id);

    void onReorder(orderedIds, targetColumn);
    handleDragEnd();
  }

  return (
    <div>
      {isFiltering && (
        <Alert
          type="info"
          showIcon
          message="Đang áp dụng bộ lọc dữ liệu"
          description="Chức năng kéo thả sắp xếp tạm thời được khóa để bảo toàn thứ tự công việc của các thẻ đang bị ẩn."
          style={{ marginBottom: 16 }}
        />
      )}
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
            activeTaskId={activeTask ? activeTask.id : null}
            hoverTaskId={hoverTaskId}
            hoverColumnId={hoverColumnId}
            isFiltering={isFiltering}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onCardDragEnter={(taskId) => setHoverTaskId(taskId)}
            onColumnDragEnter={(columnId) => setHoverColumnId(columnId)}
            onCardDrop={handleCardDrop}
            onColumnDrop={handleColumnDrop}
          />
        ))}
      </div>
    </div>
  );
}
