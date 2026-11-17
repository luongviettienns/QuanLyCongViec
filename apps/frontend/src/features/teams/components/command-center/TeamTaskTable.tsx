import { useState } from 'react';
import {
  Table,
  Tag,
  Avatar,
  Dropdown,
  DatePicker,
  Popover,
  Button,
  Space,
  Typography,
  Empty,
  List,
  Card,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import {
  UserOutlined,
  CalendarOutlined,
  DownOutlined,
  MoreOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Task, TaskPriority, TaskStatus } from '../../../tasks/types/task.types.ts';
import type { Team, TeamMember } from '../../types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';
import { getTaskPermissions } from '../../../tasks/utils/task-permission.utils.ts';
import { toDateKey, getVietnamTodayKey } from '../../../tasks/utils/calendar-date.utils.ts';
import { isTaskOverdue, isTaskDueSoon } from '../../utils/team-command-center.utils.ts';
import { ChecklistProgressBadge } from '../../../tasks/components/checklist/index.ts';
import { useResponsive } from '../../../../shared/hooks';

const { Text } = Typography;

export interface TeamTaskTableProps {
  tasks: Task[];
  loading?: boolean;
  selectedTaskId?: number | null;
  onSelectTask: (task: Task) => void;
  onUpdateStatus?: (taskId: number, status: TaskStatus) => Promise<boolean | void>;
  onUpdateAssignee?: (taskId: number, assigneeId: number | null) => Promise<boolean | void>;
  onUpdateDueDate?: (taskId: number, dueDate: string | null) => Promise<boolean | void>;
  onDeleteTask?: (task: Task) => void;
  team: Team | null;
  currentUser: User | null;
}

const STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  TODO: { label: 'Cần làm', color: 'orange', icon: <ClockCircleOutlined /> },
  IN_PROGRESS: { label: 'Đang làm', color: 'blue', icon: <ClockCircleOutlined /> },
  DONE: { label: 'Hoàn thành', color: 'green', icon: <CheckCircleOutlined /> },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  HIGH: { label: 'Cao', color: '#ff4d4f' },
  MEDIUM: { label: 'T.Bình', color: '#faad14' },
  LOW: { label: 'Thấp', color: '#1677ff' },
};

export function TeamTaskTable({
  tasks,
  loading = false,
  selectedTaskId,
  onSelectTask,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdateDueDate,
  onDeleteTask,
  team,
  currentUser,
}: TeamTaskTableProps) {
  const [editingDueDateTaskId, setEditingDueDateTaskId] = useState<number | null>(null);
  const screens = useResponsive();
  const isMobile = screens.xs;
  const todayKey = getVietnamTodayKey();

  const renderStatusControl = (status: TaskStatus, record: Task) => {
    const perms = getTaskPermissions(currentUser, record, team);
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.TODO;

    if (!perms.canChangeStatus || perms.allowedNextStatuses.length === 0) {
      return (
        <Tag color={config.color} style={{ borderRadius: 12, padding: '2px 8px', margin: 0 }}>
          {config.icon} {config.label}
        </Tag>
      );
    }

    const items: MenuProps['items'] = perms.allowedNextStatuses.map((nextStatus) => {
      const nextConfig = STATUS_CONFIG[nextStatus];
      return {
        key: nextStatus,
        label: (
          <span style={{ fontWeight: 500 }}>
            {nextConfig.icon} Chuyển sang {nextConfig.label}
          </span>
        ),
        onClick: (e) => {
          e.domEvent.stopPropagation();
          void onUpdateStatus?.(record.id, nextStatus);
        },
      };
    });

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items }} trigger={['click']} placement="bottomLeft">
          <Tag
            color={config.color}
            style={{
              borderRadius: 12,
              padding: '2px 8px',
              margin: 0,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {config.icon} {config.label} <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
          </Tag>
        </Dropdown>
      </div>
    );
  };

  const renderAssigneeControl = (record: Task) => {
    const perms = getTaskPermissions(currentUser, record, team);
    const assignee = record.assignee;
    const members: TeamMember[] = team?.members || [];

    const displayEl = assignee ? (
      <Space size={6} style={{ cursor: perms.canChangeAssignee ? 'pointer' : 'default' }}>
        <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
          {assignee.name.charAt(0).toUpperCase()}
        </Avatar>
        <Text ellipsis style={{ maxWidth: 110, fontSize: 13 }}>
          {assignee.name}
        </Text>
      </Space>
    ) : (
      <Tag style={{ cursor: perms.canChangeAssignee ? 'pointer' : 'default', borderStyle: 'dashed', margin: 0 }}>
        <UserOutlined /> Chưa giao
      </Tag>
    );

    if (!perms.canChangeAssignee || !team) {
      return displayEl;
    }

    const memberItems: MenuProps['items'] = members.map((m) => ({
      key: String(m.userId),
      label: (
        <Space>
          <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
            {m.user?.name.charAt(0).toUpperCase() || 'U'}
          </Avatar>
          <span>{m.user?.name}</span>
          {m.userId === team.ownerId && <Tag color="gold">Chủ nhóm</Tag>}
        </Space>
      ),
      onClick: (e) => {
        e.domEvent.stopPropagation();
        void onUpdateAssignee?.(record.id, m.userId);
      },
    }));

    const items: MenuProps['items'] = [
      {
        key: 'unassigned',
        label: (
          <span style={{ color: '#8c8c8c' }}>
            <UserOutlined /> Bỏ phân công
          </span>
        ),
        onClick: (e) => {
          e.domEvent.stopPropagation();
          void onUpdateAssignee?.(record.id, null);
        },
      },
      { type: 'divider' },
      ...memberItems,
    ];

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items }} trigger={['click']} placement="bottomLeft">
          {displayEl}
        </Dropdown>
      </div>
    );
  };

  const renderDueDateControl = (dueDate: string | null | undefined, record: Task) => {
    const perms = getTaskPermissions(currentUser, record, team);
    const overdue = isTaskOverdue(record, todayKey);
    const dueSoon = isTaskDueSoon(record, todayKey);
    const dueKey = toDateKey(dueDate);

    let dateEl = <Text type="secondary" style={{ fontSize: 12 }}>Chưa đặt</Text>;
    if (dueKey) {
      const formatted = dayjs(dueKey).format('DD/MM/YYYY');
      if (overdue) {
        dateEl = (
          <Tag color="error" style={{ borderRadius: 10, margin: 0 }}>
            <ExclamationCircleOutlined /> {formatted}
          </Tag>
        );
      } else if (dueSoon) {
        dateEl = (
          <Tag color="warning" style={{ borderRadius: 10, margin: 0 }}>
            <ClockCircleOutlined /> {formatted}
          </Tag>
        );
      } else {
        dateEl = (
          <Text style={{ fontSize: 13 }}>
            <CalendarOutlined style={{ marginRight: 4, color: '#8c8c8c' }} />
            {formatted}
          </Text>
        );
      }
    }

    if (!perms.canEditContent) {
      return dateEl;
    }

    const isEditing = editingDueDateTaskId === record.id;

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Popover
          open={isEditing}
          onOpenChange={(open) => setEditingDueDateTaskId(open ? record.id : null)}
          trigger="click"
          placement="bottomLeft"
          content={
            <div style={{ padding: 4 }}>
              <DatePicker
                value={dueKey ? dayjs(dueKey) : null}
                onChange={(date) => {
                  const nextDate = date ? date.format('YYYY-MM-DD') : null;
                  void onUpdateDueDate?.(record.id, nextDate);
                  setEditingDueDateTaskId(null);
                }}
                allowClear
                placeholder="Chọn hạn chót"
                format="DD/MM/YYYY"
                autoFocus
              />
            </div>
          }
        >
          <span style={{ cursor: 'pointer' }} title="Nhấn để đổi hạn chót">
            {dateEl}
          </span>
        </Popover>
      </div>
    );
  };

  const renderActionMenu = (record: Task) => {
    const perms = getTaskPermissions(currentUser, record, team);
    const actionItems: MenuProps['items'] = [
      {
        key: 'detail',
        label: 'Xem chi tiết',
        icon: <EyeOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          onSelectTask(record);
        },
      },
    ];

    if (perms.canDelete) {
      actionItems.push({
        key: 'delete',
        danger: true,
        label: 'Xóa công việc',
        icon: <DeleteOutlined />,
        onClick: (e) => {
          e.domEvent.stopPropagation();
          onDeleteTask?.(record);
        },
      });
    }

    return (
      <div onClick={(e) => e.stopPropagation()}>
        <Dropdown menu={{ items: actionItems }} trigger={['click']} placement="bottomRight">
          <Button type="text" size="small" icon={<MoreOutlined />} aria-label="Thao tác công việc" />
        </Dropdown>
      </div>
    );
  };

  if (isMobile) {
    return (
      <List
        loading={loading}
        dataSource={tasks}
        pagination={{ pageSize: 6, align: 'center', size: 'small' }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không có công việc nào phù hợp bộ lọc"
            />
          ),
        }}
        renderItem={(record) => {
          const isDone = record.status === 'DONE';
          const priorityConfig = PRIORITY_CONFIG[record.priority || 'MEDIUM'] || PRIORITY_CONFIG.MEDIUM;
          const isSelected = record.id === selectedTaskId;

          return (
            <Card
              size="small"
              onClick={() => onSelectTask(record)}
              style={{
                marginBottom: 10,
                borderRadius: 8,
                cursor: 'pointer',
                borderColor: isSelected ? '#1677ff' : '#f0f0f0',
                backgroundColor: isSelected ? '#f0f7ff' : '#ffffff',
              }}
              styles={{ body: { padding: 12 } }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Text
                    strong
                    delete={isDone}
                    style={{
                      color: isDone ? '#8c8c8c' : '#262626',
                      fontSize: 14,
                      wordBreak: 'break-word',
                    }}
                  >
                    {record.title}
                  </Text>
                  <ChecklistProgressBadge subtasks={record.subtasks} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  {renderStatusControl(record.status, record)}
                  {renderActionMenu(record)}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Tag
                  color={priorityConfig.color}
                  style={{ borderRadius: 10, fontSize: 11, padding: '1px 6px', margin: 0 }}
                >
                  {priorityConfig.label}
                </Tag>
                {renderAssigneeControl(record)}
                {renderDueDateControl(record.dueDate, record)}
              </div>
            </Card>
          );
        }}
      />
    );
  }

  const columns: ColumnsType<Task> = [
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: TaskStatus, record) => renderStatusControl(status, record),
    },
    {
      title: 'Công việc',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      ellipsis: true,
      render: (title: string, record) => {
        const isDone = record.status === 'DONE';

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text
              strong
              delete={isDone}
              style={{
                color: isDone ? '#8c8c8c' : '#262626',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {title}
            </Text>
            <ChecklistProgressBadge subtasks={record.subtasks} />
          </div>
        );
      },
    },
    {
      title: 'Phụ trách',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 170,
      render: (_, record) => renderAssigneeControl(record),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: 140,
      render: (dueDate: string | null, record) => renderDueDateControl(dueDate, record),
    },
    {
      title: 'Ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (priority: TaskPriority) => {
        const p = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.MEDIUM;
        return (
          <Tag
            color={p.color}
            style={{ borderRadius: 10, fontSize: 11, padding: '1px 6px' }}
          >
            {p.label}
          </Tag>
        );
      },
    },
    {
      title: '',
      key: 'actions',
      width: 50,
      render: (_, record) => renderActionMenu(record),
    },
  ];

  return (
    <div style={{ background: '#ffffff', borderRadius: 8, overflow: 'hidden' }}>
      <Table<Task>
        rowKey="id"
        columns={columns}
        dataSource={tasks}
        loading={loading}
        scroll={{ x: 760 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showTotal: (total) => `Tổng ${total} công việc`,
          size: 'small',
        }}
        onRow={(record) => ({
          onClick: () => onSelectTask(record),
          style: {
            cursor: 'pointer',
            backgroundColor: record.id === selectedTaskId ? '#e6f4ff' : undefined,
            transition: 'background-color 0.2s',
          },
        })}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không có công việc nào phù hợp bộ lọc"
            />
          ),
        }}
        size="middle"
      />
    </div>
  );
}
