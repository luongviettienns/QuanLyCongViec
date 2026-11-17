import {
  Card,
  Space,
  Typography,
  Badge,
  Avatar,
  List,
  Drawer,
  Grid,
} from 'antd';
import {
  ExclamationCircleOutlined,
  UserOutlined,
  RightOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { Subtask, Task, TaskPriority, TaskStatus } from '../../../tasks/types/task.types.ts';
import type { Team, TeamMember } from '../../types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';
import type {
  TeamCommandMetrics,
  CommandFilterType,
} from '../../utils/team-command-center.utils.ts';
import { computeMemberWorkloads } from '../../utils/team-command-center.utils.ts';
import { buildTeamMemberOptions } from '../../utils/team-quick-assign.utils.ts';
import { TeamTaskQuickDetail } from './TeamTaskQuickDetail.tsx';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export interface TeamCommandPanelProps {
  metrics: TeamCommandMetrics;
  members: TeamMember[];
  tasks: Task[];
  selectedTask: Task | null;
  onCloseTask: () => void;
  onSelectFilter: (filter: CommandFilterType) => void;
  onSelectAssigneeFilter: (userId: number | null) => void;
  activeFilter?: CommandFilterType;
  activeAssigneeId?: number | null;
  team: Team | null;
  currentUser: User | null;
  contextMode?: 'tasks' | 'members' | 'activity';
  onOpenFullModal: (task: Task) => void;
  onUpdateStatus?: (taskId: number, status: TaskStatus) => Promise<boolean | void>;
  onUpdateAssignee?: (taskId: number, assigneeId: number | null) => Promise<boolean | void>;
  onUpdateDueDate?: (taskId: number, dueDate: string | null) => Promise<boolean | void>;
  onUpdatePriority?: (taskId: number, priority: TaskPriority) => Promise<boolean | void>;
  onReturnTask?: (taskId: number, reason: string) => Promise<boolean | void>;
  onSubtasksChange?: (taskId: number, subtasks: Subtask[]) => void;
  isDrawerOpen?: boolean;
  onCloseDrawer?: () => void;
}

export function TeamCommandPanel({
  metrics,
  members,
  tasks,
  selectedTask,
  onCloseTask,
  onSelectFilter,
  onSelectAssigneeFilter,
  activeFilter = 'all',
  activeAssigneeId,
  team,
  currentUser,
  contextMode = 'tasks',
  onOpenFullModal,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdateDueDate,
  onUpdatePriority,
  onReturnTask,
  onSubtasksChange,
  isDrawerOpen = false,
  onCloseDrawer,
}: TeamCommandPanelProps) {
  const screens = useBreakpoint();
  const isMobileOrTablet = !screens.lg;
  const workloads = computeMemberWorkloads(members, tasks);
  const memberOptions = buildTeamMemberOptions(team);

  const memberContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        size="small"
        title={
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            <Text strong>Cơ cấu nhân sự nhóm</Text>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
            <Text type="secondary">Tổng thành viên:</Text>
            <Text strong>{memberOptions.length} người</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
            <Text type="secondary">Chủ nhóm:</Text>
            <Space size={4}>
              <CrownOutlined style={{ color: '#faad14' }} />
              <Text strong>{team?.owner?.name || 'Chưa rõ'}</Text>
            </Space>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
            <Text type="secondary">Quản trị viên:</Text>
            <Text strong>{memberOptions.filter((m) => !m.isOwner && m.role === 'ADMIN').length} người</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
            <Text type="secondary">Thành viên thường:</Text>
            <Text strong>{memberOptions.filter((m) => !m.isOwner && m.role === 'MEMBER').length} người</Text>
          </div>
        </div>
      </Card>

      <Card
        size="small"
        title={
          <Space>
            <UserOutlined style={{ color: '#52c41a' }} />
            <Text strong>Khối lượng đang phụ trách</Text>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <List
          size="small"
          dataSource={workloads}
          renderItem={(item) => (
            <List.Item style={{ padding: '8px 4px' }}>
              <Space>
                <Avatar
                  size="small"
                  style={{
                    backgroundColor:
                      item.role === 'OWNER'
                        ? '#faad14'
                        : item.role === 'ADMIN'
                          ? '#1677ff'
                          : '#52c41a',
                  }}
                >
                  {item.name.charAt(0).toUpperCase()}
                </Avatar>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{item.name}</Text>
                </div>
              </Space>
              <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                {item.taskCount} việc
              </Text>
            </List.Item>
          )}
        />
      </Card>
    </div>
  );

  const activityContent = (
    <Card
      size="small"
      title={
        <Space>
          <HistoryOutlined style={{ color: '#1677ff' }} />
          <Text strong>Nhật ký kiểm toán</Text>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Text style={{ fontSize: 13 }}>
          Mọi thay đổi về phân công, trạng thái công việc và nhân sự nhóm đều được ghi nhận tự động theo thời gian thực.
        </Text>
        <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chỉ Chủ nhóm và Quản trị viên mới có quyền xem toàn bộ lịch sử chi tiết.
          </Text>
        </div>
      </div>
    </Card>
  );

  const panelContent = selectedTask ? (
    <TeamTaskQuickDetail
      task={selectedTask}
      team={team}
      currentUser={currentUser}
      onClose={onCloseTask}
      onOpenFullModal={onOpenFullModal}
      onUpdateStatus={onUpdateStatus}
      onUpdateAssignee={onUpdateAssignee}
      onUpdateDueDate={onUpdateDueDate}
      onUpdatePriority={onUpdatePriority}
      onReturnTask={onReturnTask}
      onSubtasksChange={onSubtasksChange}
    />
  ) : contextMode === 'members' ? (
    memberContent
  ) : contextMode === 'activity' ? (
    activityContent
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Action Center: Cần xử lý ngay */}
      <Card
        size="small"
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            <Text strong>Cần xử lý ngay</Text>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Overdue */}
          <div
            onClick={() => onSelectFilter(activeFilter === 'overdue' ? 'all' : 'overdue')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 6,
              background: activeFilter === 'overdue' ? '#fff1f0' : '#fafafa',
              border: activeFilter === 'overdue' ? '1px solid #ff4d4f' : '1px solid #f0f0f0',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Space>
              <Badge count={metrics.overdue} color="#ff4d4f" />
              <Text strong={metrics.overdue > 0} style={{ fontSize: 13 }}>
                Công việc quá hạn
              </Text>
            </Space>
            <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
          </div>

          {/* Due Soon */}
          <div
            onClick={() => onSelectFilter(activeFilter === 'due_soon' ? 'all' : 'due_soon')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 6,
              background: activeFilter === 'due_soon' ? '#fffbe6' : '#fafafa',
              border: activeFilter === 'due_soon' ? '1px solid #faad14' : '1px solid #f0f0f0',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Space>
              <Badge count={metrics.dueSoon} color="#faad14" />
              <Text style={{ fontSize: 13 }}>Sắp đến hạn (7 ngày)</Text>
            </Space>
            <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
          </div>

          {/* Unassigned */}
          <div
            onClick={() => onSelectFilter(activeFilter === 'unassigned' ? 'all' : 'unassigned')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: 6,
              background: activeFilter === 'unassigned' ? '#e6f4ff' : '#fafafa',
              border: activeFilter === 'unassigned' ? '1px solid #1677ff' : '1px solid #f0f0f0',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Space>
              <Badge count={metrics.unassigned} color="#1677ff" />
              <Text style={{ fontSize: 13 }}>Chưa phân công</Text>
            </Space>
            <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
          </div>
        </div>
      </Card>

      {/* Member Workload list */}
      <Card
        size="small"
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <UserOutlined style={{ color: '#1677ff' }} />
              <Text strong>Tải công việc thành viên</Text>
            </Space>
            {activeAssigneeId !== undefined && activeAssigneeId !== null && (
              <a
                onClick={() => onSelectAssigneeFilter(null)}
                style={{ fontSize: 12, color: '#1677ff' }}
              >
                Bỏ lọc
              </a>
            )}
          </div>
        }
        style={{ borderRadius: 8 }}
      >
        <List
          size="small"
          dataSource={workloads}
          renderItem={(item) => {
            const isSelected = activeAssigneeId === item.userId;
            const isOwner = team?.ownerId === item.userId;
            const isAdmin = item.role === 'ADMIN';

            return (
              <List.Item
                onClick={() =>
                  onSelectAssigneeFilter(isSelected ? null : item.userId)
                }
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  backgroundColor: isSelected ? '#e6f4ff' : undefined,
                  border: isSelected ? '1px solid #1677ff' : '1px solid transparent',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Space size={8}>
                  <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
                    {item.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Space size={4}>
                      <Text strong style={{ fontSize: 12 }}>
                        {item.name}
                      </Text>
                      {isOwner && (
                        <CrownOutlined style={{ color: '#faad14', fontSize: 11 }} title="Chủ nhóm" />
                      )}
                      {isAdmin && !isOwner && (
                        <SafetyCertificateOutlined
                          style={{ color: '#1677ff', fontSize: 11 }}
                          title="Quản trị viên"
                        />
                      )}
                    </Space>
                  </div>
                </Space>

                <Space size={6}>
                  {item.overdueCount > 0 && (
                    <Badge
                      count={`${item.overdueCount} quá hạn`}
                      style={{ backgroundColor: '#ff4d4f', fontSize: 10 }}
                    />
                  )}
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 600 }}>
                    {item.taskCount} việc
                  </Text>
                </Space>
              </List.Item>
            );
          }}
        />
      </Card>
    </div>
  );

  // If mobile or tablet, render as Drawer / Bottom Sheet when activated
  if (isMobileOrTablet) {
    return (
      <Drawer
        title={selectedTask ? `Chi tiết #${selectedTask.id}` : 'Trung tâm điều hành'}
        placement={screens.xs ? 'bottom' : 'right'}
        height={screens.xs ? '80%' : undefined}
        width={screens.xs ? '100%' : 400}
        open={isDrawerOpen || Boolean(selectedTask)}
        onClose={() => {
          if (selectedTask) onCloseTask();
          onCloseDrawer?.();
        }}
        styles={{ body: { padding: 12 } }}
      >
        {panelContent}
      </Drawer>
    );
  }

  // Desktop inline panel
  return panelContent;
}
