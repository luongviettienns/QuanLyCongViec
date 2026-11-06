import { Table, Tag, Button, Popconfirm, Space, Grid, List, Card } from 'antd';
import { EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { TASK_PRIORITY_CONFIG, type Task } from '../../types/task.types';
import type { Category } from '../../../categories/types/category.types';
import { formatDate, checkIsOverdue } from '../../../../shared/utils/date.utils';

interface TaskTableProps {
  tasks: Task[];
  loading: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
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
      width: 65,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Nhóm / Thực hiện',
      key: 'teamAssignee',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          {record.team ? (
            <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
              {record.team.name}
            </Tag>
          ) : (
            <span style={{ color: '#aaa', fontSize: 12 }}>Cá nhân</span>
          )}
          {record.assignee ? (
            <Tag icon={<UserOutlined />} color="purple" style={{ margin: 0, fontSize: 11 }}>
              {record.assignee.name}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: Task['status']) => {
        const color = status === 'DONE' ? 'green' : status === 'IN_PROGRESS' ? 'blue' : 'orange';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      width: 120,
      render: (priority?: Task['priority']) => {
        const val = priority || 'MEDIUM';
        const item = TASK_PRIORITY_CONFIG[val] || { color: 'default', label: val };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      width: 120,
      render: (cat?: Category | null) => (
        cat ? <Tag color={cat.color}>{cat.name}</Tag> : <span style={{ color: '#bbb' }}>-</span>
      ),
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      width: 110,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'dueDate',
      width: 150,
      render: (date?: string | null, record?: Task) => {
        if (!date) return <span style={{ color: '#bbb' }}>-</span>;
        const overdue = record ? checkIsOverdue(date, record.status) : false;
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
      width: 150,
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

  if (screens.xs) {
    return (
      <List
        loading={loading}
        dataSource={tasks}
        pagination={{ pageSize: 6, align: 'center', size: 'small' }}
        locale={{ emptyText: 'Không có công việc nào' }}
        renderItem={(task) => {
          const statusColor = task.status === 'DONE' ? 'green' : task.status === 'IN_PROGRESS' ? 'blue' : 'orange';
          const priority = task.priority || 'MEDIUM';
          const pConfig = TASK_PRIORITY_CONFIG[priority] || { color: 'default', label: priority };
          const isOverdue = checkIsOverdue(task.dueDate, task.status);

          return (
            <Card
              size="small"
              style={{
                marginBottom: 12,
                borderRadius: 8,
                border: '1px solid #f0f0f0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#1f1f1f', flex: 1 }}>
                  {task.title}
                </div>
                <Tag color={statusColor} style={{ margin: 0 }}>
                  {task.status}
                </Tag>
              </div>

              {task.description && (
                <div style={{ fontSize: 13, color: '#595959', margin: '8px 0' }}>
                  {task.description}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0', alignItems: 'center' }}>
                <Tag color={pConfig.color} style={{ margin: 0 }}>
                  {pConfig.label}
                </Tag>
                {task.team && (
                  <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
                    {task.team.name}
                  </Tag>
                )}
                {task.assignee && (
                  <Tag icon={<UserOutlined />} color="purple" style={{ margin: 0, fontSize: 11 }}>
                    {task.assignee.name}
                  </Tag>
                )}
                {task.category && (
                  <Tag color={task.category.color} style={{ margin: 0 }}>
                    {task.category.name}
                  </Tag>
                )}
                {task.startDate && (
                  <Tag style={{ margin: 0, fontSize: 11 }}>
                    Bắt đầu: {formatDate(task.startDate)}
                  </Tag>
                )}
                {task.dueDate && (
                  <Tag color={isOverdue ? 'error' : 'default'} style={{ margin: 0, fontSize: 11 }}>
                    Hạn: {formatDate(task.dueDate)} {isOverdue ? '(Quá hạn)' : ''}
                  </Tag>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  borderTop: '1px solid #f5f5f5',
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => onEdit(task)}
                  style={{ color: '#1677ff' }}
                >
                  Sửa
                </Button>
                <Popconfirm
                  title="Xác nhận xoá"
                  description={`Bạn có chắc chắn muốn xoá công việc "${task.title}"?`}
                  onConfirm={() => onDelete(task.id)}
                  okText="Xoá"
                  cancelText="Huỷ"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                    Xoá
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          );
        }}
      />
    );
  }

  return (
    <Table
      columns={columns}
      dataSource={tasks}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 10, showSizeChanger: true }}
      scroll={{ x: 1000 }}
    />
  );
}
