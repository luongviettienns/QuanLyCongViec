import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  List,
  Button,
  Tag,
  Select,
  Alert,
  Popconfirm,
  Space,
  Avatar,
  Typography,
  message,
  Spin,
  Empty,
} from 'antd';
import {
  UserOutlined,
  UsergroupAddOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import type { Task, TaskCollaborator } from '../types/task.types';
import type { Team } from '../../teams/types/team.types';
import type { User } from '../../auth/types/auth.types';
import {
  getCollaborators,
  inviteCollaborator,
  respondCollaborator,
  removeCollaborator,
} from '../api/tasks.api';

const { Text } = Typography;

interface TaskCollaboratorsSectionProps {
  task: Task;
  team?: Team | null;
  currentUser?: User | null;
  canManage: boolean;
  onChanged?: () => void;
}

export function TaskCollaboratorsSection({
  task,
  team,
  currentUser,
  canManage,
  onChanged,
}: TaskCollaboratorsSectionProps) {
  const [collaborators, setCollaborators] = useState<TaskCollaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>(undefined);

  const fetchCollaborators = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCollaborators(task.id);
      setCollaborators(data);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách người phối hợp');
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    fetchCollaborators();
  }, [fetchCollaborators]);

  const pendingInvitationForMe = useMemo(() => {
    if (!currentUser) return null;
    return collaborators.find(
      (c) => c.userId === currentUser.id && c.status === 'PENDING',
    );
  }, [collaborators, currentUser]);

  const invitableMembers = useMemo(() => {
    if (!team?.members) return [];
    const existingUserIds = new Set(
      collaborators
        .filter((c) => c.status === 'ACCEPTED' || c.status === 'PENDING')
        .map((c) => c.userId),
    );
    if (task.assigneeId) {
      existingUserIds.add(task.assigneeId);
    }
    if (currentUser) {
      existingUserIds.add(currentUser.id);
    }

    return team.members
      .filter((m) => !existingUserIds.has(m.userId))
      .map((m) => ({
        value: m.userId,
        label: `${m.user?.name} (${m.user?.email})`,
      }));
  }, [team, collaborators, task.assigneeId, currentUser]);

  const handleInvite = async () => {
    if (!selectedUserId) return;
    try {
      setInviting(true);
      await inviteCollaborator(task.id, selectedUserId);
      message.success('Đã gửi lời mời phối hợp');
      setSelectedUserId(undefined);
      await fetchCollaborators();
      onChanged?.();
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi lời mời');
    } finally {
      setInviting(false);
    }
  };

  const handleRespond = async (action: 'ACCEPT' | 'DECLINE') => {
    try {
      await respondCollaborator(task.id, action);
      message.success(
        action === 'ACCEPT'
          ? 'Đã chấp nhận lời mời phối hợp'
          : 'Đã từ chối lời mời phối hợp',
      );
      await fetchCollaborators();
      onChanged?.();
    } catch (err: any) {
      message.error(err.message || 'Thao tác thất bại');
    }
  };

  const handleRemove = async (targetUserId: number) => {
    try {
      await removeCollaborator(task.id, targetUserId);
      message.success(
        targetUserId === currentUser?.id
          ? 'Đã rời khỏi danh sách phối hợp'
          : 'Đã thu hồi quyền người phối hợp',
      );
      await fetchCollaborators();
      onChanged?.();
    } catch (err: any) {
      message.error(err.message || 'Không thể thu hồi quyền');
    }
  };

  const renderStatusTag = (status: TaskCollaborator['status']) => {
    switch (status) {
      case 'ACCEPTED':
        return <Tag color="success">Đã tham gia</Tag>;
      case 'PENDING':
        return <Tag color="warning">Đang chờ</Tag>;
      case 'DECLINED':
        return <Tag color="default">Đã từ chối</Tag>;
      case 'REVOKED':
        return <Tag color="error">Đã thu hồi</Tag>;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {pendingInvitationForMe && (
        <Alert
          type="info"
          showIcon
          message="Bạn nhận được lời mời phối hợp"
          description={
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: 0, marginBottom: 8 }}>
                <strong>{pendingInvitationForMe.invitedBy?.name || 'Một thành viên'}</strong> đã mời bạn cùng tham gia thực hiện công việc này.
              </p>
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => handleRespond('ACCEPT')}
                >
                  Chấp nhận
                </Button>
                <Button
                  size="small"
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => handleRespond('DECLINE')}
                >
                  Từ chối
                </Button>
              </Space>
            </div>
          }
        />
      )}

      {canManage && (
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Mời thành viên nhóm phối hợp
          </Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ width: '100%' }}
              placeholder="Chọn thành viên để mời..."
              options={invitableMembers}
              value={selectedUserId}
              onChange={setSelectedUserId}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <Button
              type="primary"
              icon={<UsergroupAddOutlined />}
              disabled={!selectedUserId}
              loading={inviting}
              onClick={handleInvite}
            >
              Mời
            </Button>
          </Space.Compact>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : collaborators.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có người phối hợp nào cho công việc này"
        />
      ) : (
        <List
          size="small"
          bordered
          dataSource={collaborators}
          renderItem={(item) => {
            const isMe = item.userId === currentUser?.id;
            return (
              <List.Item
                actions={[
                  isMe && item.status === 'ACCEPTED' && !canManage && (
                    <Popconfirm
                      title="Xác nhận rời khỏi việc phối hợp này?"
                      onConfirm={() => handleRemove(item.userId)}
                      okText="Rời"
                      cancelText="Hủy"
                    >
                      <Button size="small" type="link" danger icon={<LogoutOutlined />}>
                        Rời
                      </Button>
                    </Popconfirm>
                  ),
                  canManage && item.status !== 'REVOKED' && (
                    <Popconfirm
                      title={
                        item.status === 'PENDING'
                          ? 'Thu hồi lời mời này?'
                          : 'Gỡ người phối hợp này khỏi công việc?'
                      }
                      onConfirm={() => handleRemove(item.userId)}
                      okText="Đồng ý"
                      cancelText="Hủy"
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} />}
                  title={
                    <Space>
                      <span>{item.user?.name || `User #${item.userId}`}</span>
                      {isMe && <Tag color="blue">Bạn</Tag>}
                      {renderStatusTag(item.status)}
                    </Space>
                  }
                  description={
                    <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                      {item.user?.email} • Mời bởi {item.invitedBy?.name || 'Quản lý'}
                    </span>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
