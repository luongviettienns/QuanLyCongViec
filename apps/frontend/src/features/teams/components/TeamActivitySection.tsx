import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  List,
  Typography,
  Tag,
  Spin,
  Empty,
  Space,
  Select,
  Button,
  Pagination,
  Card,
  Tooltip,
} from 'antd';
import {
  UserAddOutlined,
  UserDeleteOutlined,
  SwapOutlined,
  CrownOutlined,
  LogoutOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  SyncOutlined,
  DeleteOutlined,
  UndoOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UsergroupAddOutlined,
  UsergroupDeleteOutlined,
  ReloadOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { getTeamActivityLogs } from '../api/teams.api';
import type {
  TeamActivityLog,
  TeamActivityAction,
  TeamMember,
  TeamMemberUser,
} from '../types/team.types';

const { Text } = Typography;

interface TeamActivitySectionProps {
  teamId: number;
  members?: TeamMember[];
  owner?: TeamMemberUser;
}

const PAGE_SIZE = 4;

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}, ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

function renderStatusTag(status?: string | null) {
  if (!status) return null;
  switch (status) {
    case 'TODO':
      return (
        <Tag color="default" variant="filled" style={{ margin: '0 4px', fontSize: 11 }}>
          Cần làm
        </Tag>
      );
    case 'IN_PROGRESS':
      return (
        <Tag color="processing" variant="filled" style={{ margin: '0 4px', fontSize: 11 }}>
          Đang làm
        </Tag>
      );
    case 'DONE':
      return (
        <Tag color="success" variant="filled" style={{ margin: '0 4px', fontSize: 11 }}>
          Hoàn thành
        </Tag>
      );
    default:
      return (
        <Tag variant="filled" style={{ margin: '0 4px', fontSize: 11 }}>
          {status}
        </Tag>
      );
  }
}

export function TeamActivitySection({ teamId, members = [], owner }: TeamActivitySectionProps) {
  const [logs, setLogs] = useState<TeamActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState<TeamActivityAction | undefined>(undefined);
  const [selectedActorId, setSelectedActorId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Build unique actor list from members + owner
  const actorOptions = useMemo(() => {
    const map = new Map<number, string>();
    if (owner) {
      map.set(owner.id, `${owner.name} (Chủ nhóm)`);
    }
    members.forEach((m) => {
      if (m.user) {
        map.set(m.userId, m.user.name);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({
      value: id,
      label,
    }));
  }, [members, owner]);

  const loadLogs = useCallback(
    async (currentPage: number, action?: string, actorId?: number, signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await getTeamActivityLogs(
          teamId,
          {
            page: currentPage,
            limit: PAGE_SIZE,
            action,
            actorId,
          },
          signal,
        );
        setLogs(res.data || []);
        setTotal(res.total || 0);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLogs([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [teamId],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function init() {
      await Promise.resolve();
      if (!active) return;
      await loadLogs(page, selectedAction, selectedActorId, controller.signal);
    }
    void init();
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadLogs, page, selectedAction, selectedActorId]);

  const handleActionChange = (value?: TeamActivityAction) => {
    setSelectedAction(value);
    setPage(1);
  };

  const handleActorChange = (value?: number) => {
    setSelectedActorId(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSelectedAction(undefined);
    setSelectedActorId(undefined);
    setPage(1);
  };

  return (
    <div>
      {/* Filter Bar */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          backgroundColor: '#fafafa',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
        }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size="middle">
            <Space size="small">
              <FilterOutlined style={{ color: '#8c8c8c' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Lọc hoạt động:
              </Text>
            </Space>

            <Select
              allowClear
              placeholder="Tất cả hành động"
              value={selectedAction}
              onChange={handleActionChange}
              style={{ width: 190 }}
              options={[
                {
                  label: 'Công việc (Tasks)',
                  options: [
                    { value: 'TASK_CREATED', label: 'Tạo công việc' },
                    { value: 'TASK_STATUS_CHANGED', label: 'Đổi trạng thái việc' },
                    { value: 'TASK_ASSIGNED', label: 'Phân công việc' },
                    { value: 'TASK_UNASSIGNED', label: 'Hủy phân công việc' },
                    { value: 'TASK_DELETED', label: 'Xóa vào thùng rác' },
                    { value: 'TASK_RESTORED', label: 'Khôi phục việc' },
                  ],
                },
                {
                  label: 'Việc con (Subtasks)',
                  options: [
                    { value: 'SUBTASK_COMPLETED', label: 'Hoàn thành việc con' },
                    { value: 'SUBTASK_REOPENED', label: 'Mở lại việc con' },
                  ],
                },
                {
                  label: 'Phối hợp (Collaborators)',
                  options: [
                    { value: 'COLLABORATOR_ADDED', label: 'Mời người phối hợp' },
                    { value: 'COLLABORATOR_REMOVED', label: 'Gỡ người phối hợp' },
                  ],
                },
                {
                  label: 'Thành viên (Members)',
                  options: [
                    { value: 'ADD_MEMBER', label: 'Thêm thành viên' },
                    { value: 'CHANGE_ROLE', label: 'Đổi quyền thành viên' },
                    { value: 'REMOVE_MEMBER', label: 'Xóa khỏi nhóm' },
                    { value: 'LEAVE_TEAM', label: 'Tự rời nhóm' },
                    { value: 'TRANSFER_OWNER', label: 'Chuyển quyền Owner' },
                  ],
                },
              ]}
            />

            <Select
              allowClear
              placeholder="Tất cả người thực hiện"
              value={selectedActorId}
              onChange={handleActorChange}
              style={{ width: 190 }}
              options={actorOptions}
            />

            {(selectedAction !== undefined || selectedActorId !== undefined) && (
              <Button type="link" onClick={handleResetFilters} style={{ padding: 0, fontSize: 13 }}>
                Đặt lại bộ lọc
              </Button>
            )}
          </Space>

          <Tooltip title="Tải lại lịch sử">
            <Button
              type="text"
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => void loadLogs(page, selectedAction, selectedActorId)}
              size="small"
            />
          </Tooltip>
        </Space>
      </Card>

      {/* Main Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin />
        </div>
      ) : logs.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            selectedAction !== undefined || selectedActorId !== undefined
              ? 'Không có hoạt động nào phù hợp với bộ lọc'
              : 'Chưa có lịch sử hoạt động nào trong nhóm'
          }
        >
          {(selectedAction !== undefined || selectedActorId !== undefined) && (
            <Button size="small" onClick={handleResetFilters}>
              Xóa bộ lọc
            </Button>
          )}
        </Empty>
      ) : (
        <>
          <List
            itemLayout="horizontal"
            dataSource={logs}
            renderItem={(log) => {
              const actorName = log.actor?.name || 'Hệ thống';
              const targetName = log.targetUser?.name || 'Thành viên';
              const taskTitle = log.metadata?.taskTitle || 'Công việc';
              const subtaskTitle = log.metadata?.subtaskTitle || 'Việc con';

              let icon = <HistoryOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
              let titleNode = null;
              let detailNode = null;

              const metadataParts: string[] = [];
              if (log.metadata?.unassignedTaskCount && log.metadata.unassignedTaskCount > 0) {
                metadataParts.push(`Hủy phân công ${log.metadata.unassignedTaskCount} Task`);
              }
              if (log.metadata?.affectedSubtaskCount && log.metadata.affectedSubtaskCount > 0) {
                metadataParts.push(`${log.metadata.affectedSubtaskCount} Subtask`);
              }
              if (log.metadata?.revokedCollaboratorCount && log.metadata.revokedCollaboratorCount > 0) {
                metadataParts.push(`Thu hồi ${log.metadata.revokedCollaboratorCount} lời mời`);
              }
              const metadataDesc = metadataParts.length > 0 ? metadataParts.join(' và ') : null;

              switch (log.action) {
                // Task Events
                case 'TASK_CREATED':
                  icon = <PlusCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã tạo công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'TASK_STATUS_CHANGED':
                  icon = <SyncOutlined style={{ color: '#1677ff', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã chuyển trạng thái{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text> từ{' '}
                      {renderStatusTag(log.metadata?.oldStatus as string)} →{' '}
                      {renderStatusTag(log.metadata?.newStatus as string)}
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'TASK_ASSIGNED':
                  icon = <UserAddOutlined style={{ color: '#722ed1', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã phân công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text> cho{' '}
                      <Text strong>{targetName}</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'TASK_UNASSIGNED':
                  icon = <UserDeleteOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã gỡ phân công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text> khỏi{' '}
                      <Text strong>{targetName}</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'TASK_DELETED':
                  icon = <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã chuyển công việc{' '}
                      <Text strong delete style={{ color: '#8c8c8c' }}>"{taskTitle}"</Text> vào thùng rác
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'TASK_RESTORED':
                  icon = <UndoOutlined style={{ color: '#13c2c2', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã khôi phục công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text> từ thùng rác
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                // Subtask Events
                case 'SUBTASK_COMPLETED':
                  icon = <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã hoàn thành việc con{' '}
                      <Text strong>"{subtaskTitle}"</Text> trong công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'SUBTASK_REOPENED':
                  icon = <ClockCircleOutlined style={{ color: '#faad14', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã mở lại việc con{' '}
                      <Text strong>"{subtaskTitle}"</Text> trong công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                // Collaborator Events
                case 'COLLABORATOR_ADDED':
                  icon = <UsergroupAddOutlined style={{ color: '#1890ff', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã mời{' '}
                      <Text strong>{targetName}</Text> phối hợp trong công việc{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                case 'COLLABORATOR_REMOVED':
                  icon = <UsergroupDeleteOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã gỡ{' '}
                      <Text strong>{targetName}</Text> khỏi việc phối hợp{' '}
                      <Text strong style={{ color: '#1677ff' }}>"{taskTitle}"</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;

                // Team Member Events
                case 'ADD_MEMBER':
                  icon = <UserAddOutlined style={{ color: '#52c41a', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã thêm <Text strong>{targetName}</Text> vào nhóm
                    </span>
                  );
                  detailNode = (
                    <Space size="small">
                      <span>
                        Vai trò:{' '}
                        <Tag
                          color={log.newRole === 'ADMIN' ? 'blue' : 'green'}
                          variant="filled"
                        >
                          {log.newRole ?? 'MEMBER'}
                        </Tag>
                      </span>
                      <span>·</span>
                      <span>{formatDate(log.createdAt)}</span>
                    </Space>
                  );
                  break;

                case 'CHANGE_ROLE':
                  icon = <SwapOutlined style={{ color: '#fa8c16', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã cấp quyền{' '}
                      <Tag color={log.newRole === 'ADMIN' ? 'blue' : 'green'} variant="filled">
                        {log.newRole}
                      </Tag>{' '}
                      cho <Text strong>{targetName}</Text>
                    </span>
                  );
                  detailNode = (
                    <Space size="small">
                      <span>
                        {log.oldRole ?? 'MEMBER'} → {log.newRole ?? 'ADMIN'}
                      </span>
                      <span>·</span>
                      <span>{formatDate(log.createdAt)}</span>
                    </Space>
                  );
                  break;

                case 'REMOVE_MEMBER':
                  icon = <UserDeleteOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã xóa <Text strong>{targetName}</Text> khỏi nhóm
                    </span>
                  );
                  detailNode = (
                    <Space size="small">
                      {metadataDesc && <span>{metadataDesc} ·</span>}
                      <span>{formatDate(log.createdAt)}</span>
                    </Space>
                  );
                  break;

                case 'LEAVE_TEAM':
                  icon = <LogoutOutlined style={{ color: '#8c8c8c', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{targetName}</Text> đã tự rời khỏi nhóm
                    </span>
                  );
                  detailNode = (
                    <Space size="small">
                      {metadataDesc && <span>{metadataDesc} ·</span>}
                      <span>{formatDate(log.createdAt)}</span>
                    </Space>
                  );
                  break;

                case 'TRANSFER_OWNER':
                  icon = <CrownOutlined style={{ color: '#faad14', fontSize: 18 }} />;
                  titleNode = (
                    <span>
                      <Text strong>{actorName}</Text> đã chuyển quyền Owner cho{' '}
                      <Text strong>{targetName}</Text>
                    </span>
                  );
                  detailNode = <span>{formatDate(log.createdAt)}</span>;
                  break;
              }

              return (
                <List.Item
                  style={{
                    padding: '12px 16px',
                    borderRadius: 6,
                    marginBottom: 8,
                    backgroundColor: '#ffffff',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          backgroundColor: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {icon}
                      </div>
                    }
                    title={titleNode}
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {detailNode}
                      </Text>
                    }
                  />
                </List.Item>
              );
            }}
          />

          {/* Pagination: 4 items per page */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 16,
              paddingTop: 8,
            }}
          >
            <Pagination
              current={page}
              pageSize={PAGE_SIZE}
              total={total}
              onChange={(newPage) => setPage(newPage)}
              showSizeChanger={false}
              showTotal={(tot) => `Tổng cộng ${tot} hoạt động`}
              size="small"
            />
          </div>
        </>
      )}
    </div>
  );
}
