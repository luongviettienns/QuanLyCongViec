import { Button, Select, Dropdown, Space, Typography, Tag, Popconfirm } from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined,
  SettingOutlined,
  UsergroupAddOutlined,
  EditOutlined,
  SwapOutlined,
  LogoutOutlined,
  DeleteOutlined,
  TeamOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import type { Team } from '../../types/team.types.ts';

const { Text } = Typography;

export interface TeamCommandHeaderProps {
  teams: Team[];
  selectedTeam: Team | null;
  onSelectTeamId: (teamId: number) => void;
  onOpenCreateTask: () => void;
  canCreateTask?: boolean;
  canManageTeam?: boolean;
  isOwner?: boolean;
  onOpenEditTeam?: () => void;
  onOpenAddMember?: () => void;
  onOpenTransferOwnership?: () => void;
  onOpenManageCategories?: () => void;
  onDeleteTeam?: () => void;
  onLeaveTeam?: () => void;
}

export function TeamCommandHeader({
  teams,
  selectedTeam,
  onSelectTeamId,
  onOpenCreateTask,
  canCreateTask = true,
  canManageTeam = false,
  isOwner = false,
  onOpenEditTeam,
  onOpenAddMember,
  onOpenTransferOwnership,
  onOpenManageCategories,
  onDeleteTeam,
  onLeaveTeam,
}: TeamCommandHeaderProps) {
  const memberCount = selectedTeam
    ? 1 + (selectedTeam.members?.length || 0)
    : 0;

  const menuItems: MenuProps['items'] = [];

  if (canManageTeam) {
    menuItems.push({
      key: 'edit',
      label: 'Sửa thông tin nhóm',
      icon: <EditOutlined />,
      onClick: onOpenEditTeam,
    });
    menuItems.push({
      key: 'categories',
      label: 'Quản lý danh mục nhóm',
      icon: <TagsOutlined />,
      onClick: onOpenManageCategories,
    });
    menuItems.push({
      key: 'add-member',
      label: 'Thêm thành viên mới',
      icon: <UsergroupAddOutlined />,
      onClick: onOpenAddMember,
    });
  }

  if (isOwner) {
    menuItems.push({
      key: 'transfer',
      label: 'Chuyển quyền chủ nhóm',
      icon: <SwapOutlined />,
      onClick: onOpenTransferOwnership,
    });
    menuItems.push({ type: 'divider' });
    menuItems.push({
      key: 'delete',
      label: (
        <Popconfirm
          title="Giải tán nhóm làm việc?"
          description="Hành động này sẽ xóa nhóm. Các công việc còn lại phải được xử lý trước."
          okText="Giải tán"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={onDeleteTeam}
        >
          <span style={{ color: '#ff4d4f' }}>Giải tán nhóm</span>
        </Popconfirm>
      ),
      icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
    });
  } else if (selectedTeam) {
    menuItems.push({ type: 'divider' });
    menuItems.push({
      key: 'leave',
      label: (
        <Popconfirm
          title="Rời khỏi nhóm này?"
          description="Bạn sẽ mất quyền truy cập vào các công việc nội bộ của nhóm."
          okText="Rời nhóm"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
          onConfirm={onLeaveTeam}
        >
          <span style={{ color: '#ff4d4f' }}>Rời khỏi nhóm</span>
        </Popconfirm>
      ),
      icon: <LogoutOutlined style={{ color: '#ff4d4f' }} />,
    });
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        padding: '12px 16px',
        background: '#ffffff',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TeamOutlined style={{ fontSize: 20, color: '#1677ff' }} />
        <Select
          value={selectedTeam?.id}
          onChange={onSelectTeamId}
          style={{ minWidth: 220, maxWidth: 300 }}
          placeholder="Chọn nhóm làm việc"
          showSearch
          optionFilterProp="label"
          options={teams.map((t) => ({
            value: t.id,
            label: t.name,
          }))}
        />
        <Tag color="blue" style={{ borderRadius: 12, padding: '2px 10px', fontSize: 13 }}>
          {memberCount} thành viên
        </Tag>
        {selectedTeam?.description && (
          <Text
            type="secondary"
            ellipsis={{ tooltip: selectedTeam.description }}
            style={{ maxWidth: 280, fontSize: 13 }}
          >
            {selectedTeam.description}
          </Text>
        )}
      </div>

      <Space size={8}>
        {canCreateTask && (
          <Button type="primary" icon={<PlusOutlined />} onClick={onOpenCreateTask}>
            Giao việc
          </Button>
        )}
        {menuItems.length > 0 && (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button icon={<SettingOutlined />} />
          </Dropdown>
        )}
      </Space>
    </div>
  );
}
