import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  List,
  Typography,
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
  ReloadOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { getTeamActivityLogs } from '../api/teams.api';
import type {
  TeamActivityLog,
  TeamActivityAction,
  TeamMember,
  TeamMemberUser,
  TeamActivityActor,
} from '../types/team.types';
import { renderActivityItem } from './team-activity.renderers';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  shouldRefreshTeamActivityOnEvent,
  createDebouncedCallback,
} from '../utils/team-realtime.utils';
import { isAbortError, isUnauthorizedError } from '../../../shared/api';
import { ApiErrorFallback } from '../../../app/pages/errors';

const { Text } = Typography;

interface TeamActivitySectionProps {
  teamId: number;
  members?: TeamMember[];
  owner?: TeamMemberUser;
}

const PAGE_SIZE = 4;

export function TeamActivitySection({ teamId, members = [], owner }: TeamActivitySectionProps) {
  const [logs, setLogs] = useState<TeamActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState<TeamActivityAction | undefined>(undefined);
  const [selectedActorId, setSelectedActorId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [backendActors, setBackendActors] = useState<TeamActivityActor[]>([]);

  // Build unique actor list from members + owner + historical backend actors
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
    backendActors.forEach((a) => {
      if (!map.has(a.id)) {
        map.set(a.id, `${a.name} (Đã rời nhóm)`);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({
      value: id,
      label,
    }));
  }, [members, owner, backendActors]);

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
        if (signal?.aborted) return;
        setLogs(res.data || []);
        setTotal(res.total || 0);
        setError(null);
        if (res.actors) {
          setBackendActors(res.actors);
        }
      } catch (err: unknown) {
        if (signal?.aborted || isAbortError(err) || isUnauthorizedError(err)) return;
        setError(err);
        setLogs([]);
        setTotal(0);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
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
  }, [loadLogs, page, selectedAction, selectedActorId, reloadKey]);

  const debouncedReloadRef = useRef<ReturnType<typeof createDebouncedCallback> | null>(null);

  useEffect(() => {
    const debounced = createDebouncedCallback(() => {
      setReloadKey((k) => k + 1);
    }, 300);
    debouncedReloadRef.current = debounced;
    return () => {
      debounced.cancel();
      debouncedReloadRef.current = null;
    };
  }, [teamId]);

  const handleRealtimeActivityCreated = useCallback(
    (event: RealtimeEventData) => {
      if (
        shouldRefreshTeamActivityOnEvent({
          eventType: event.type,
          activeTeamId: teamId,
          event,
        })
      ) {
        debouncedReloadRef.current?.trigger();
      }
    },
    [teamId],
  );

  useRealtimeEvent('TEAM_ACTIVITY_CREATED', handleRealtimeActivityCreated);
  useRealtimeReconnect(() => {
    debouncedReloadRef.current?.trigger();
  });

  const handleActionChange = (value?: TeamActivityAction) => {
    setError(null);
    setSelectedAction(value);
    setPage(1);
  };

  const handleActorChange = (value?: number) => {
    setError(null);
    setSelectedActorId(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setError(null);
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
              style={{ width: 220 }}
              options={[
                {
                  label: 'Công việc (Tasks)',
                  options: [
                    { value: 'TASK_CREATED', label: 'Tạo công việc' },
                    { value: 'TASK_STATUS_CHANGED', label: 'Đổi trạng thái việc' },
                    { value: 'TASK_ASSIGNED', label: 'Phân công việc' },
                    { value: 'TASK_UNASSIGNED', label: 'Hủy phân công việc' },
                    { value: 'TASK_RETURNED', label: 'Trả lại công việc' },
                    { value: 'TASK_MOVED_OUT', label: 'Chuyển khỏi nhóm' },
                    { value: 'TASK_MOVED_IN', label: 'Chuyển vào nhóm' },
                    { value: 'TASK_DEADLINE_CHANGED', label: 'Đổi hạn chót việc' },
                    { value: 'TASK_PRIORITY_CHANGED', label: 'Đổi mức ưu tiên việc' },
                    { value: 'TASK_UPDATED', label: 'Cập nhật công việc' },
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
                    { value: 'COLLABORATOR_INVITED', label: 'Mời người phối hợp' },
                    { value: 'COLLABORATOR_ACCEPTED', label: 'Chấp nhận phối hợp' },
                    { value: 'COLLABORATOR_DECLINED', label: 'Từ chối phối hợp' },
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
              style={{ width: 200 }}
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
              onClick={() => setReloadKey((k) => k + 1)}
              size="small"
            />
          </Tooltip>
        </Space>
      </Card>

      {/* Main Content */}
      {Boolean(error) && logs.length === 0 ? (
        <ApiErrorFallback
          variant="inline"
          error={error}
          onRetry={() => setReloadKey((k) => k + 1)}
          retrying={loading}
          showNavigation={false}
        />
      ) : loading ? (
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
          {Boolean(error) && (
            <div style={{ marginBottom: 16 }}>
              <ApiErrorFallback
                variant="inline"
                error={error}
                onRetry={() => setReloadKey((k) => k + 1)}
                retrying={loading}
                showNavigation={false}
              />
            </div>
          )}
          <List
            itemLayout="horizontal"
            dataSource={logs}
            renderItem={(log) => {
              const { icon, titleNode, detailNode } = renderActivityItem(log);

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
