import { useState } from 'react';
import {
  Table,
  List,
  Card,
  Tag,
  Button,
  Popconfirm,
  Modal,
  Space,
  Tooltip,
  Alert,
  type TableProps,
} from 'antd';
import {
  UndoOutlined,
  DeleteOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { TrashTask } from '../../types/task.types.ts';
import { TASK_PRIORITY_CONFIG } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import { useAuth } from '../../../auth/hooks/useAuth.ts';
import { canManageTrashTask } from '../../utils/task-permission.utils.ts';
import { formatDate } from '../../../../shared/utils/date.utils.ts';
import { useResponsive } from '../../../../shared/hooks';

export interface TaskTrashViewProps {
  tasks: TrashTask[];
  teams: Team[];
  loading: boolean;
  onRestore: (id: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
}

export default function TaskTrashView({
  tasks,
  teams = [],
  loading,
  onRestore,
  onPermanentDelete,
}: TaskTrashViewProps) {
  const { user } = useAuth();
  const screens = useResponsive();

  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrashTask | null>(null);
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);

  function canManage(task: TrashTask): boolean {
    const team = task.teamId ? teams.find((t) => t.id === task.teamId) : null;
    return canManageTrashTask(user, task, team);
  }

  async function handleConfirmRestore(id: number) {
    try {
      setRestoringId(id);
      await onRestore(id);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleConfirmPermanentDelete() {
    if (!deleteTarget) return;
    try {
      setConfirmDeleteLoading(true);
      await onPermanentDelete(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setConfirmDeleteLoading(false);
    }
  }

  const columns: TableProps<TrashTask>['columns'] = [
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
      title: 'Nhóm',
      key: 'team',
      width: 150,
      render: (_, record) =>
        record.team ? (
          <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
            {record.team.name}
          </Tag>
        ) : (
          <span style={{ color: '#aaa', fontSize: 12 }}>Cá nhân</span>
        ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      width: 120,
      render: (priority?: TrashTask['priority']) => {
        const val = priority || 'MEDIUM';
        const item = TASK_PRIORITY_CONFIG[val] || { color: 'default', label: val };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      width: 130,
      render: (_, record) =>
        record.category ? (
          <Tag color={record.category.color}>{record.category.name}</Tag>
        ) : (
          <span style={{ color: '#bbb' }}>-</span>
        ),
    },
    {
      title: 'Người xóa',
      dataIndex: 'deletedBy',
      width: 150,
      render: (_, record) =>
        record.deletedBy ? (
          <Tag icon={<UserOutlined />} color="default">
            {record.deletedBy.name}
          </Tag>
        ) : (
          <span style={{ color: '#bbb' }}>-</span>
        ),
    },
    {
      title: 'Thời gian xóa',
      dataIndex: 'deletedAt',
      width: 150,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 200,
      render: (_, record) => {
        const authorized = canManage(record);

        return (
          <Space size="small">
            {authorized ? (
              <Popconfirm
                title="Khôi phục công việc"
                description={`Bạn có chắc chắn muốn khôi phục công việc "${record.title}"?`}
                onConfirm={() => handleConfirmRestore(record.id)}
                okText="Khôi phục"
                cancelText="Hủy"
              >
                <Button
                  type="link"
                  size="small"
                  icon={<UndoOutlined />}
                  loading={restoringId === record.id}
                >
                  Khôi phục
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                <Button
                  type="link"
                  size="small"
                  disabled
                  style={{ color: '#d9d9d9' }}
                  icon={<UndoOutlined />}
                >
                  Khôi phục
                </Button>
              </Tooltip>
            )}

            {authorized ? (
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDeleteTarget(record)}
              >
                Xóa vĩnh viễn
              </Button>
            ) : (
              <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                <Button
                  type="link"
                  size="small"
                  disabled
                  danger
                  style={{ color: '#d9d9d9' }}
                  icon={<DeleteOutlined />}
                >
                  Xóa vĩnh viễn
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const permanentDeleteModal = (
    <Modal
      open={Boolean(deleteTarget)}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>Xác nhận xóa vĩnh viễn</span>
        </Space>
      }
      onOk={handleConfirmPermanentDelete}
      onCancel={() => {
        if (!confirmDeleteLoading) {
          setDeleteTarget(null);
        }
      }}
      okText="Xóa vĩnh viễn"
      cancelText="Hủy"
      okButtonProps={{ danger: true, loading: confirmDeleteLoading }}
      cancelButtonProps={{ disabled: confirmDeleteLoading }}
      closable={!confirmDeleteLoading}
      maskClosable={!confirmDeleteLoading}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Alert
          type="warning"
          showIcon
          message="Cảnh báo: Hành động không thể hoàn tác!"
          description="Subtask và các lời mời thành viên cộng tác liên quan sẽ bị xóa vĩnh viễn. Nhật ký kiểm tra (audit log) của nhóm vẫn được bảo lưu an toàn."
        />
        <p style={{ margin: 0 }}>
          Bạn có chắc chắn muốn xóa vĩnh viễn công việc{' '}
          <strong>&ldquo;{deleteTarget?.title}&rdquo;</strong> không?
        </p>
      </div>
    </Modal>
  );

  if (screens.xs) {
    return (
      <>
        <List
          loading={loading}
          dataSource={tasks}
          pagination={{ pageSize: 6, align: 'center', size: 'small' }}
          locale={{ emptyText: 'Thùng rác trống' }}
          renderItem={(task) => {
            const priority = task.priority || 'MEDIUM';
            const pConfig = TASK_PRIORITY_CONFIG[priority] || { color: 'default', label: priority };
            const authorized = canManage(task);

            return (
              <Card
                size="small"
                style={{
                  marginBottom: 12,
                  borderRadius: 8,
                  borderLeft: '4px solid #ff4d4f',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 6,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</span>
                  <Tag color="red">Đã xóa</Tag>
                </div>

                {task.description && (
                  <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
                    {task.description}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {task.team ? (
                    <Tag color="cyan">{task.team.name}</Tag>
                  ) : (
                    <Tag>Cá nhân</Tag>
                  )}
                  <Tag color={pConfig.color}>{pConfig.label}</Tag>
                  {task.category && <Tag color={task.category.color}>{task.category.name}</Tag>}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#888',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {task.deletedBy && (
                    <span>
                      Người xóa: <strong>{task.deletedBy.name}</strong>
                    </span>
                  )}
                  {task.deletedAt && (
                    <span>Thời gian xóa: {formatDate(task.deletedAt)}</span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 8,
                    borderTop: '1px solid #f0f0f0',
                    paddingTop: 8,
                    marginTop: 8,
                  }}
                >
                  {authorized ? (
                    <Popconfirm
                      title="Khôi phục công việc"
                      description={`Bạn có chắc chắn muốn khôi phục công việc "${task.title}"?`}
                      onConfirm={() => handleConfirmRestore(task.id)}
                      okText="Khôi phục"
                      cancelText="Hủy"
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<UndoOutlined />}
                        loading={restoringId === task.id}
                        style={{ color: '#1677ff' }}
                      >
                        Khôi phục
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                      <Button
                        size="small"
                        type="text"
                        disabled
                        style={{ color: '#d9d9d9' }}
                        icon={<UndoOutlined />}
                      >
                        Khôi phục
                      </Button>
                    </Tooltip>
                  )}

                  {authorized ? (
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setDeleteTarget(task)}
                    >
                      Xóa vĩnh viễn
                    </Button>
                  ) : (
                    <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                      <Button
                        size="small"
                        type="text"
                        disabled
                        danger
                        style={{ color: '#d9d9d9' }}
                        icon={<DeleteOutlined />}
                      >
                        Xóa vĩnh viễn
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </Card>
            );
          }}
        />
        {permanentDeleteModal}
      </>
    );
  }

  return (
    <>
      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: 'Thùng rác trống' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1000 }}
      />
      {permanentDeleteModal}
    </>
  );
}
