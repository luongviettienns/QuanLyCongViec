import { useState } from 'react';
import {
  Table,
  Button,
  Tag,
  Input,
  Select,
  Popconfirm,
  Space,
} from 'antd';
import type { TableProps } from 'antd';
import KanbanBoard from './components/KanbanBoard';
import TaskFormModal from './components/TaskFormModal';
import { useTasks } from './hooks/useTasks';
import type { Task, Category, StatusFilter } from './types/task.types';

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function App() {
  const {
    tasks,
    categories,
    loading,
    searchText,
    statusFilter,
    isFiltering,
    setSearchText,
    handleSearch,
    handleStatusChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
  } = useTasks();

  const [modalState, setModalState] = useState<{ open: boolean; task: Task | null }>({
    open: false,
    task: null,
  });

  function handleOpenCreate() {
    setModalState({ open: true, task: null });
  }

  function handleOpenEdit(task: Task) {
    setModalState({ open: true, task });
  }

  function handleCloseModal() {
    setModalState({ open: false, task: null });
  }

  const columns: TableProps<Task>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (status: Task['status']) => {
        const color = status === 'DONE' ? 'green' : status === 'IN_PROGRESS' ? 'blue' : 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      width: 130,
      render: (priority?: Task['priority']) => {
        const val = priority || 'MEDIUM';
        const config: Record<string, { color: string; label: string }> = {
          HIGH: { color: 'red', label: 'Cao' },
          MEDIUM: { color: 'orange', label: 'Trung bình' },
          LOW: { color: 'blue', label: 'Thấp' },
        };
        const item = config[val] || { color: 'default', label: val };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      width: 130,
      render: (cat?: Category | null) => (
        cat ? <Tag color={cat.color}>{cat.name}</Tag> : <span style={{ color: '#bbb' }}>-</span>
      ),
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      width: 120,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'dueDate',
      width: 160,
      render: (date?: string | null, record?: Task) => {
        if (!date) return <span style={{ color: '#bbb' }}>-</span>;
        const overdue = record && record.status !== 'DONE' && new Date(date).getTime() < Date.now();
        return (
          <span style={{ color: overdue ? '#ff4d4f' : 'inherit', fontWeight: overdue ? 600 : 400 }}>
            {formatDate(date)} {overdue ? '(Quá hạn)' : ''}
          </span>
        );
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" onClick={() => handleOpenEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xoá"
            description={`Bạn có chắc chắn muốn xoá công việc "${record.title}"?`}
            onConfirm={() => void handleDelete(record.id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger>
              Xoá
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>TaskFlow</h1>
        <Space>
          <Button onClick={() => void refetch()} loading={loading}>
            Tải lại
          </Button>
          <Button type="primary" onClick={handleOpenCreate}>
            Thêm công việc
          </Button>
        </Space>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 20,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <Input.Search
          placeholder="Tìm kiếm theo tiêu đề hoặc mô tả..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={(val) => handleSearch(val)}
          allowClear
          style={{ width: 320 }}
        />
        <Select<StatusFilter>
          value={statusFilter}
          onChange={handleStatusChange}
          style={{ width: 180 }}
          options={[
            { value: 'ALL', label: 'Tất cả trạng thái' },
            { value: 'TODO', label: 'Cần làm (TODO)' },
            { value: 'IN_PROGRESS', label: 'Đang làm (IN_PROGRESS)' },
            { value: 'DONE', label: 'Hoàn thành (DONE)' },
          ]}
        />
        <Button onClick={handleReset}>
          Đặt lại
        </Button>
      </div>

      <div style={{ marginBottom: 30 }}>
        <KanbanBoard tasks={tasks} onReorder={handleReorder} isFiltering={isFiltering} />
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <TaskFormModal
        open={modalState.open}
        task={modalState.task}
        categories={categories}
        onClose={handleCloseModal}
        onSuccess={refetch}
      />
    </div>
  );
}

export default App;
