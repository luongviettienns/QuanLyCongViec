import {
  Card,
  Button,
  Table,
  Tag,
  Select,
  Popconfirm,
  Avatar,
  Space,
  Typography,
  Spin,
  Tabs,
} from 'antd';
import {
  UserAddOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { Team, TeamMember, TeamRole } from '../types/team.types';
import { TeamCategorySection } from './TeamCategorySection';
import { TeamActivitySection } from './TeamActivitySection';

const { Title, Text } = Typography;

interface TeamDetailCardProps {
  selectedTeam: Team | null;
  detailLoading: boolean;
  currentUserId?: number;
  isOwner: boolean;
  isAdmin: boolean;
  canManageMembers: boolean;
  onOpenEdit: () => void;
  onDeleteTeam: () => Promise<void>;
  onLeaveTeam: (memberId: number) => Promise<void>;
  onOpenAddMember: () => void;
  onUpdateMemberRole: (memberId: number, role: TeamRole) => Promise<void>;
  onTransferOwnership: (newOwnerId: number) => Promise<void>;
  onRemoveMember: (memberId: number) => Promise<void>;
}

export function TeamDetailCard({
  selectedTeam,
  detailLoading,
  currentUserId,
  isOwner,
  isAdmin,
  canManageMembers,
  onOpenEdit,
  onDeleteTeam,
  onLeaveTeam,
  onOpenAddMember,
  onUpdateMemberRole,
  onTransferOwnership,
  onRemoveMember,
}: TeamDetailCardProps) {
  if (detailLoading) {
    return (
      <Card style={{ borderRadius: 8, display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Spin />
      </Card>
    );
  }

  if (!selectedTeam) {
    return null;
  }

  const memberColumns = [
    {
      title: 'Thành viên',
      key: 'user',
      render: (_: unknown, record: TeamMember) => (
        <Space orientation="horizontal" size="middle">
          <Avatar
            style={{
              backgroundColor:
                record.userId === selectedTeam.ownerId
                  ? '#faad14'
                  : record.role === 'ADMIN'
                    ? '#1890ff'
                    : '#52c41a',
            }}
          >
            {record.user?.name ? record.user.name.charAt(0).toUpperCase() : 'U'}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{record.user?.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.user?.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Vai trò',
      key: 'role',
      render: (_: unknown, record: TeamMember) => {
        if (record.userId === selectedTeam.ownerId) {
          return (
            <Tag icon={<CrownOutlined />} color="gold">
              Chủ nhóm
            </Tag>
          );
        }
        if (record.role === 'ADMIN') {
          return (
            <Tag icon={<SafetyCertificateOutlined />} color="blue">
              Quản trị viên (ADMIN)
            </Tag>
          );
        }
        return (
          <Tag icon={<UserOutlined />} color="green">
            Thành viên (MEMBER)
          </Tag>
        );
      },
    },
    {
      title: 'Ngày tham gia',
      dataIndex: 'joinedAt',
      key: 'joinedAt',
      render: (val: string) => {
        if (!val) return '-';
        const d = new Date(val);
        return d.toLocaleDateString('vi-VN');
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: TeamMember) => {
        if (record.userId === selectedTeam.ownerId) {
          return <Text type="secondary">Chủ sở hữu</Text>;
        }

        return (
          <Space size="small">
            {isOwner && (
              <>
                <Select
                  size="small"
                  value={record.role}
                  style={{ width: 140 }}
                  onChange={(role) => void onUpdateMemberRole(record.id, role)}
                  options={[
                    { label: 'Quản trị viên', value: 'ADMIN' },
                    { label: 'Thành viên', value: 'MEMBER' },
                  ]}
                />
                <Popconfirm
                  title="Chuyển quyền chủ nhóm?"
                  description={`Bạn có chắc muốn chuyển quyền sở hữu nhóm cho "${record.user?.name}"? Bạn sẽ trở thành Quản trị viên.`}
                  onConfirm={() => void onTransferOwnership(record.userId)}
                  okText="Chuyển quyền"
                  cancelText="Hủy"
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<CrownOutlined style={{ color: '#faad14' }} />}
                    title="Chuyển quyền sở hữu nhóm"
                  />
                </Popconfirm>
              </>
            )}

            {(isOwner || (isAdmin && record.role === 'MEMBER')) && (
              <Popconfirm
                title="Xóa thành viên khỏi nhóm?"
                description={`Bạn có chắc muốn xóa "${record.user?.name}" khỏi nhóm?`}
                onConfirm={() => void onRemoveMember(record.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                {selectedTeam.name}
              </Title>
              <Tag color={isOwner ? 'gold' : isAdmin ? 'blue' : 'green'}>
                {isOwner ? 'Chủ nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
              </Tag>
            </Space>
            {selectedTeam.description && (
              <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>
                {selectedTeam.description}
              </div>
            )}
          </div>
          <Space>
            {isOwner && (
              <>
                <Button size="small" icon={<EditOutlined />} onClick={onOpenEdit}>
                  Chỉnh sửa
                </Button>
                <Popconfirm
                  title="Giải tán nhóm?"
                  description="Nhóm chỉ có thể giải tán khi không còn công việc hoặc danh mục phụ thuộc!"
                  onConfirm={onDeleteTeam}
                  okText="Giải tán"
                  cancelText="Hủy"
                  okButtonProps={{ danger: true }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Giải tán nhóm
                  </Button>
                </Popconfirm>
              </>
            )}
            {!isOwner && (
              <Popconfirm
                title="Rời khỏi nhóm?"
                description="Bạn sẽ không còn quyền truy cập các công việc của nhóm này!"
                onConfirm={() => {
                  const selfMember = selectedTeam.members.find((m) => m.userId === currentUserId);
                  if (selfMember) {
                    void onLeaveTeam(selfMember.id);
                  }
                }}
                okText="Rời nhóm"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger icon={<LogoutOutlined />}>
                  Rời nhóm
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      }
      style={{ borderRadius: 8 }}
    >
      {isOwner || isAdmin ? (
        <Tabs
          defaultActiveKey="members"
          items={[
            {
              key: 'members',
              label: (
                <span>
                  <TeamOutlined /> Thành viên & Danh mục
                </span>
              ),
              children: (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text strong style={{ fontSize: 15 }}>
                      Thành viên nhóm ({selectedTeam.members.length})
                    </Text>
                    {canManageMembers && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<UserAddOutlined />}
                        onClick={onOpenAddMember}
                      >
                        Thêm thành viên
                      </Button>
                    )}
                  </div>

                  <Table
                    dataSource={selectedTeam.members}
                    columns={memberColumns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                  />

                  <TeamCategorySection
                    key={`cat-admin-${selectedTeam.id}`}
                    teamId={selectedTeam.id}
                    canManage={canManageMembers}
                  />
                </>
              ),
            },
            {
              key: 'activities',
              label: (
                <span>
                  <HistoryOutlined /> Lịch sử hoạt động
                </span>
              ),
              children: (
                <TeamActivitySection
                  key={`activity-${selectedTeam.id}`}
                  teamId={selectedTeam.id}
                  members={selectedTeam.members}
                  owner={selectedTeam.owner}
                />
              ),
            },
          ]}
        />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text strong style={{ fontSize: 15 }}>
              Thành viên nhóm ({selectedTeam.members.length})
            </Text>
          </div>

          <Table
            dataSource={selectedTeam.members}
            columns={memberColumns}
            rowKey="id"
            pagination={false}
            size="small"
          />

          <TeamCategorySection
            key={`cat-member-${selectedTeam.id}`}
            teamId={selectedTeam.id}
            canManage={false}
          />
        </>
      )}
    </Card>
  );
}
