import { Table, Tag, Button, Popconfirm, Space, Grid, List, Card, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, UserOutlined, EyeOutlined } from '@ant-design/icons';
import type { TableProps } from 'antd';
import { TASK_PRIORITY_CONFIG, type Task } from '../../types/task.types';
import type { Category } from '../../../categories/types/category.types';
import type { Team } from '../../../teams/types/team.types';
import { useAuth } from '../../../auth/hooks/useAuth';
import { getTaskPermissions } from '../../utils/task-permission.utils';
import { formatDate, checkIsOverdue } from '../../../../shared/utils/date.utils';

interface TaskTableProps {
  tasks: Task[];
  teams?: Team[];
  loading: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
}

export default function TaskTable({
  tasks,
  teams = [],
  loading,
  onEdit,
  onDelete,
}: TaskTableProps) {
  const { user } = useAuth();
  const screens = Grid.useBreakpoint();

  function getPerms(task: Task) {
    const team = task.teamId ? teams.find((t) => t.id === task.teamId) : null;
    return getTaskPermissions(user, task, team);
  }

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
      width: 160,
      render: (_, record) => {
        const perms = getPerms(record);
        const editLabel = perms.canEditContent ? 'Sửa' : perms.canChangeStatus ? 'Cập nhật' : 'Xem';

        return (
          <Space size="small">
            <Button type="link" size="small" onClick={() => onEdit(record)}>
              {editLabel}
            </Button>
            {perms.canDelete ? (
              <Popconfirm
                title="Xác nhận xoá"
                description={`Bạn có chắc chắn muốn xoá công việc "${record.title}"?`}
                onConfirm={() => onDelete(record.id)}
                okText="Xoá"
                cancelText="Huỷ"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger>
                  Xoá
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Chỉ người tạo hoặc quản trị viên mới có thể xóa">
                <Button type="link" size="small" disabled style={{ color: '#d9d9d9' }}>
                  Xoá
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
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
          const perms = getPerms(task);
          const editLabel = perms.canEditContent ? 'Sửa' : perms.canChangeStatus ? 'Cập nhật' : 'Xem';

          return (
            <Card
              size="small"
              style={{
                marginBottom: 12,
                borderRadius: 8,
                borderLeft: `4px solid ${
                  task.status === 'DONE' ? '#52c41a' : task.status === 'IN_PROGRESS' ? '#1890ff' : '#fa8c16'
                }`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</span>
                <Tag color={statusColor}>{task.status}</Tag>
              </div>

              {task.description && (
                <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
                  {task.description}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {task.team && <Tag color="cyan">{task.team.name}</Tag>}
                {task.assignee && (
                  <Tag icon={<UserOutlined />} color="purple">
                    {task.assignee.name}
                  </Tag>
                )}
                <Tag color={pConfig.color}>{pConfig.label}</Tag>
                {task.category && <Tag color={task.category.color}>{task.category.name}</Tag>}
              </div>

              <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 12, marginBottom: 8 }}>
                {task.startDate && <span>Bắt đầu: {formatDate(task.startDate)}</span>}
                {task.dueDate && (
                  <span style={{ color: isOverdue ? '#ff4d4f' : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                    Hạn: {formatDate(task.dueDate)} {isOverdue ? '(Quá hạn)' : ''}
                  </span>
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
                  icon={perms.canEditContent ? <EditOutlined /> : <EyeOutlined />}
                  onClick={() => onEdit(task)}
                  style={{ color: '#1677ff' }}
                >
                  {editLabel}
                </Button>
                {perms.canDelete ? (
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
                ) : null}
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
