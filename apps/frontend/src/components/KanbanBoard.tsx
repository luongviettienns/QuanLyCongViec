import { useState } from 'react';
import { Card, Badge } from 'antd';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: TaskStatus;
  position?: number;
}

interface Props {
  tasks: Task[];
  onReorder: (taskIds: number[], status?: TaskStatus) => Promise<void>;
}

const columns: { id: TaskStatus; title: string; color: string }[] = [
  { id: 'TODO', title: 'Cần làm', color: '#fa8c16' },
  { id: 'IN_PROGRESS', title: 'Đang làm', color: '#1890ff' },
  { id: 'DONE', title: 'Hoàn thành', color: '#52c41a' },
];

// Hook useSortable thuần React 19: xác định vị trí và quản lý trạng thái kéo thả an toàn 100%
function useSortable({
  id,
  index,
  group,
  isDragging,
  isOver,
}: {
  id: number;
  index: number;
  group: TaskStatus;
  isDragging: boolean;
  isOver: boolean;
}) {
  return {
    id,
    index,
    group,
    isDragging,
    isOver,
    dragProps: {
      draggable: true,
    },
  };
}

// 1. Component Thẻ công việc (TaskCard)
function TaskCard({
  task,
  index,
  columnId,
  isDragging,
  isOver,
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
  });

  return (
    <div
      {...dragProps}
      onDragStart={() => onDragStart(task, index, columnId)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => onDragEnter(task.id)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop(task, index, columnId);
      }}
      style={{
        marginBottom: 10,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.35 : 1,
        transition: 'all 0.15s ease',
        borderTop: isOver && !isDragging ? '3px solid #1677ff' : '3px solid transparent',
        paddingTop: isOver && !isDragging ? 4 : 0,
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
      </Card>
    </div>
  );
}

// 2. Component Cột Kanban (KanbanColumn)
function KanbanColumn({
  column,
  tasks,
  activeTaskId,
  hoverTaskId,
  hoverColumnId,
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

  const isColumnHovered = hoverColumnId === column.id && activeTaskId !== null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragEnter={() => onColumnDragEnter(column.id)}
      onDrop={(e) => {
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
            Kéo thả vào đây
          </div>
        )}
      </div>
    </div>
  );
}

// 3. Component Bảng Kanban chính
export default function KanbanBoard({ tasks, onReorder }: Props) {
  // Quản lý trạng thái item đang được kéo
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<TaskStatus | null>(null);
  const [activeFromIndex, setActiveFromIndex] = useState<number | null>(null);

  // Quản lý vị trí đích đang hover qua
  const [hoverTaskId, setHoverTaskId] = useState<number | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<TaskStatus | null>(null);

  function handleDragStart(task: Task, index: number, columnId: TaskStatus) {
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

  // Xử lý khi thả lên một thẻ công việc cụ thể (ví dụ kéo từ vị trí 2 lên vị trí 0)
  function handleCardDrop(_targetTask: Task, targetIndex: number, targetColumn: TaskStatus) {
    if (!activeTask || activeFromIndex === null || !activeColumnId) {
      handleDragEnd();
      return;
    }

    // TRƯỜNG HỢP 1: Kéo trong CÙNG MỘT CỘT (ví dụ từ vị trí 2 lên vị trí 0)
    if (activeColumnId === targetColumn) {
      const currentColumnTasks = tasks
        .filter((t) => t.status === activeColumnId)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const fromIndex = activeFromIndex;
      const toIndex = targetIndex;

      if (fromIndex === toIndex) {
        handleDragEnd();
        return; // Không đổi vị trí
      }

      // Tạo danh sách mới đã đảo vị trí: dời từ fromIndex sang toIndex
      const updatedList = [...currentColumnTasks];
      const [movedItem] = updatedList.splice(fromIndex, 1);
      updatedList.splice(toIndex, 0, movedItem);

      // Lấy danh sách ID theo thứ tự mới: vị trí 0, 1, 2...
      const orderedIds = updatedList.map((t) => t.id);

      // Gửi lên backend để lưu vào PostgreSQL
      void onReorder(orderedIds, activeColumnId);
    }

    // TRƯỜNG HỢP 2: Kéo SANG CỘT KHÁC và chèn vào vị trí targetIndex
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

      // Gửi danh sách ID và status mới lên backend
      void onReorder(orderedIds, targetColumn);
    }

    handleDragEnd();
  }

  // Xử lý khi thả vào vùng trống của cột (thêm vào cuối cột)
  function handleColumnDrop(targetColumn: TaskStatus) {
    if (!activeTask || !activeColumnId) {
      handleDragEnd();
      return;
    }

    // Nếu thả vào chính cột cũ mà không chỉ định thẻ nào -> giữ nguyên
    if (activeColumnId === targetColumn) {
      handleDragEnd();
      return;
    }

    // Thả sang cột mới -> đưa vào cuối danh sách cột đó
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
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onCardDragEnter={(taskId) => setHoverTaskId(taskId)}
          onColumnDragEnter={(columnId) => setHoverColumnId(columnId)}
          onCardDrop={handleCardDrop}
          onColumnDrop={handleColumnDrop}
        />
      ))}
    </div>
  );
}
