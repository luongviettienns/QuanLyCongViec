import {
  Table,
  Button,
  Space,
  Tag,
  Avatar,
  Typography,
  Popconfirm,
  Select,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  UsergroupAddOutlined,
  CrownOutlined,
  SwapOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Team, TeamRole } from '../../types/team.types.ts';

const { Text } = Typography;

export interface TeamMembersTabProps {
  team: Team | null;
  currentUserId?: number;
  isOwner?: boolean;
  canManageMembers?: boolean;
  onOpenAddMember?: () => void;
  onUpdateMemberRole?: (memberId: number, role: TeamRole) => void;
  onTransferOwnership?: (newOwnerId: number) => void;
  onRemoveMember?: (memberId: number) => void;
}

interface MemberRowItem {
  id: number;
  userId: number;
  name: string;
  email: string;
  role: 'OWNER' | TeamRole;
  joinedAt: string;
  isOwner: boolean;
  isSelf: boolean;
}

export function TeamMembersTab({
  team,
  currentUserId,
  isOwner = false,
  canManageMembers = false,
  onOpenAddMember,
  onUpdateMemberRole,
  onTransferOwnership,
  onRemoveMember,
}: TeamMembersTabProps) {
  if (!team) return null;

  const data: MemberRowItem[] = [];

  // Owner row
  if (team.owner) {
    data.push({
      id: 0,
      userId: team.ownerId,
      name: team.owner.name,
      email: team.owner.email,
      role: 'OWNER',
      joinedAt: team.createdAt,
      isOwner: true,
      isSelf: team.ownerId === currentUserId,
    });
  }

  // Regular members rows
  for (const m of team.members || []) {
    if (m.userId === team.ownerId) continue;
    data.push({
      id: m.id,
      userId: m.userId,
      name: m.user?.name || `Thành viên #${m.userId}`,
      email: m.user?.email || '',
      role: m.role,
      joinedAt: m.joinedAt,
      isOwner: false,
      isSelf: m.userId === currentUserId,
    });
  }

  const columns: ColumnsType<MemberRowItem> = [
    {
      title: 'Thành viên',
      key: 'name',
      render: (_, record) => (
        <Space size={10}>
          <Avatar
            style={{
              backgroundColor: record.isOwner ? '#faad14' : '#1677ff',
            }}
          >
            {record.name.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Space size={4}>
              <Text strong style={{ fontSize: 13 }}>
                {record.name}
              </Text>
              {record.isSelf && <Tag color="blue">Bạn</Tag>}
              {record.isOwner && (
                <Tag color="gold" icon={<CrownOutlined />}>
                  Chủ nhóm
                </Tag>
              )}
            </Space>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
              {record.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Ngày tham gia',
      dataIndex: 'joinedAt',
      key: 'joinedAt',
      width: 130,
      render: (val: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {val ? dayjs(val).format('DD/MM/YYYY') : '—'}
        </Text>
      ),
    },
    {
      title: 'Vai trò',
      key: 'role',
      width: 160,
      render: (_, record) => {
        if (record.isOwner) {
          return <Tag color="gold">Chủ nhóm</Tag>;
        }

        if (canManageMembers && !record.isSelf) {
          return (
            <Select<TeamRole>
              value={record.role as TeamRole}
              size="small"
              style={{ width: 130 }}
              onChange={(role) => onUpdateMemberRole?.(record.id, role)}
              options={[
                { value: 'MEMBER', label: 'Thành viên' },
                { value: 'ADMIN', label: 'Quản trị viên' },
              ]}
            />
          );
        }

        return record.role === 'ADMIN' ? (
          <Tag color="blue">Quản trị viên</Tag>
        ) : (
          <Tag>Thành viên</Tag>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      align: 'right',
      render: (_, record) => {
        if (record.isOwner || record.isSelf) {
          return null;
        }

        return (
          <Space size={4}>
            {isOwner && (
              <Popconfirm
                title="Chuyển quyền chủ nhóm?"
                description={`Bạn sẽ nhượng lại quyền chủ nhóm cho ${record.name}.`}
                okText="Chuyển quyền"
                cancelText="Hủy"
                onConfirm={() => onTransferOwnership?.(record.userId)}
              >
                <Button
                  size="small"
                  type="text"
                  icon={<SwapOutlined />}
                  title="Chuyển quyền chủ nhóm"
                />
              </Popconfirm>
            )}

            {canManageMembers && (
              <Popconfirm
                title="Xóa thành viên khỏi nhóm?"
                description={`Xóa ${record.name} khỏi nhóm làm việc này.`}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
                onConfirm={() => onRemoveMember?.(record.id)}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  title="Xóa thành viên"
                />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ background: '#ffffff', borderRadius: 8, padding: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text strong style={{ fontSize: 15 }}>
          Danh sách thành viên ({data.length})
        </Text>
        {canManageMembers && (
          <Button
            type="primary"
            icon={<UsergroupAddOutlined />}
            onClick={onOpenAddMember}
            size="small"
          >
            Thêm thành viên
          </Button>
        )}
      </div>

      <Table<MemberRowItem>
        rowKey="userId"
        columns={columns}
        dataSource={data}
        pagination={false}
        size="middle"
      />
    </div>
  );
}
