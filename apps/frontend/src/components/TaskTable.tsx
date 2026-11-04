import { Table, Tag, Button, Popconfirm, Space, Grid } from 'antd';
import type { TableProps } from 'antd';
import type { Task, Category } from '../types/task.types';

interface TaskTableProps {
  tasks: Task[];
  loading: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
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

export default function TaskTable({
  tasks,
  loading,
  onEdit,
  onDelete,
}: TaskTableProps) {
  const screens = Grid.useBreakpoint();

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
          <Button type="link" onClick={() => onEdit(record)}>
            Sửa
          </Button>
          <Popconfirm
            title="Xác nhận xoá"
            description={`Bạn có chắc chắn muốn xoá công việc "${record.title}"?`}
            onConfirm={() => onDelete(record.id)}
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
    <Table
      rowKey="id"
      columns={columns}
      dataSource={tasks}
      loading={loading}
      scroll={{ x: 800 }}
      pagination={{ pageSize: 10, responsive: true, size: screens.xs ? 'small' : undefined }}
    />
  );
}
