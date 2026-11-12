import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Space,
  Typography,
  Alert,
  Skeleton,
  Tag,
  Select,
  Segmented,
  type SegmentedProps,
} from 'antd';
import {
  PlusOutlined,
  TeamOutlined,
  AppstoreOutlined,
  SolutionOutlined,
  CheckSquareOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { getTaskStats } from '../../tasks/api/tasks.api';
import { useRealtimeReconnect } from '../../realtime';
import type {
  TaskStats,
  TaskFilterPatch,
  ScopeFilter,
  TaskPriorityStats,
  TaskDeadlinePoint,
} from '../../tasks/types/task.types';
import type { Team } from '../../teams/types/team.types';
import { DashboardStatCards } from '../components/DashboardStatCards';
import {
  buildDashboardNavigationPatch,
  resolveDashboardCreateTaskTeamId,
  buildDashboardStatsParams,
} from '../utils/dashboard-navigation.utils.ts';

const DashboardCharts = lazy(() =>
  import('../components/DashboardCharts').then((m) => ({ default: m.DashboardCharts })),
);

function ChartsSkeleton() {
  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[1, 2, 3].map((key) => (
          <Col xs={24} lg={8} key={key}>
            <Card style={{ borderRadius: 8, height: '100%' }}>
              <Skeleton.Input active size="small" style={{ width: 140, marginBottom: 16 }} />
              <div
                style={{
                  height: 260,
                  minHeight: 260,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Skeleton.Node active style={{ width: '100%', height: 220 }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        {[1, 2].map((key) => (
          <Col xs={24} lg={12} key={key}>
            <Card style={{ borderRadius: 8, height: '100%' }}>
              <Skeleton active paragraph={{ rows: 5 }} />
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}

const { Title, Paragraph } = Typography;

export interface DashboardPageProps {
  teams?: Team[];
  onNavigateToTasks?: (patch?: TaskFilterPatch) => void;
  onOpenCreateTask?: (defaultTeamId?: number | null) => void;
  active?: boolean;
  refreshTrigger?: number;
  onLoadingChange?: (loading: boolean) => void;
}

const DASHBOARD_SCOPE_OPTIONS: NonNullable<SegmentedProps<ScopeFilter>['options']> = [
  { value: 'all', label: 'Tất cả công việc', icon: <AppstoreOutlined /> },
  { value: 'my_work', label: 'Công việc của tôi', icon: <SolutionOutlined /> },
  { value: 'assigned_to_me', label: 'Tôi phụ trách', icon: <CheckSquareOutlined /> },
  { value: 'collaborating', label: 'Tôi phối hợp', icon: <TeamOutlined /> },
  { value: 'created_by_me', label: 'Tôi đã tạo', icon: <UserOutlined /> },
];

function sanitizeNumber(val: unknown): number {
  if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val) && val >= 0) {
    return Math.floor(val);
  }
  return 0;
}

function sanitizeStats(raw: Partial<TaskStats> | null | undefined): TaskStats {
  const total = sanitizeNumber(raw?.total);
  const todo = sanitizeNumber(raw?.todo);
  const inProgress = sanitizeNumber(raw?.inProgress);
  const done = sanitizeNumber(raw?.done);
  const overdue = sanitizeNumber(raw?.overdue);
  const dueSoon = sanitizeNumber(raw?.dueSoon);
  const completionRate = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;

  const rawPriority = raw?.byPriority;
  const byPriority: TaskPriorityStats = {
    low: sanitizeNumber(rawPriority?.low),
    medium: sanitizeNumber(rawPriority?.medium),
    high: sanitizeNumber(rawPriority?.high),
  };

  const upcomingDeadlines: TaskDeadlinePoint[] = Array.isArray(raw?.upcomingDeadlines)
    ? raw.upcomingDeadlines.map((p) => ({
        date: typeof p?.date === 'string' ? p.date : '',
        count: sanitizeNumber(p?.count),
      }))
    : [];

  return {
    total,
    todo,
    inProgress,
    done,
    overdue,
    dueSoon,
    completionRate,
    byPriority,
    upcomingDeadlines,
  };
}

export default function DashboardPage({
  teams = [],
  onNavigateToTasks,
  onOpenCreateTask,
  active = true,
  refreshTrigger,
  onLoadingChange,
}: DashboardPageProps) {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<number | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  const fetchStats = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await getTaskStats(
          buildDashboardStatsParams(teamFilter, scopeFilter),
          signal,
        );
        if (!signal?.aborted) {
          setStats(sanitizeStats(data));
          setError(null);
          const now = new Date();
          setLastUpdated(
            now.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          );
        }
      } catch (err: unknown) {
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'UnauthorizedError')) {
          return;
        }
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : 'Không thể tải số liệu thống kê');
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [teamFilter, scopeFilter],
  );

  const handleRetry = useCallback(() => {
    setLoading(true);
    void fetchStats();
  }, [fetchStats]);

  useRealtimeReconnect(() => {
    if (active) {
      void fetchStats();
    }
  });

  const prevTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = refreshTrigger;
      setLoading(true);
      void fetchStats();
    }
  }, [refreshTrigger, fetchStats]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    async function load() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setLoading(true);
      void fetchStats(controller.signal);
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [active, fetchStats]);

  const handleNavigateWithDashboardContext = useCallback(
    (patch: TaskFilterPatch = {}) => {
      onNavigateToTasks?.(buildDashboardNavigationPatch(teamFilter, scopeFilter, patch));
    },
    [onNavigateToTasks, teamFilter, scopeFilter],
  );

  const safeStats = stats || sanitizeStats(null);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Tổng quan công việc
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
            Theo dõi thống kê số lượng, tiến độ và cảnh báo công việc thời gian thực
          </Paragraph>
        </div>
        <Space wrap>
          {lastUpdated && (
            <Tag color="default" style={{ padding: '4px 10px', fontSize: 13 }}>
              Cập nhật lúc: {lastUpdated}
            </Tag>
          )}
          {onOpenCreateTask && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => onOpenCreateTask(resolveDashboardCreateTaskTeamId(teamFilter))}
            >
              Thêm công việc
            </Button>
          )}
        </Space>
      </div>

      <div
        style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Segmented<ScopeFilter>
            value={scopeFilter}
            onChange={(val) => setScopeFilter(val)}
            options={DASHBOARD_SCOPE_OPTIONS}
            style={{ overflowX: 'auto', maxWidth: '100%' }}
          />
        </div>

        <Select<number | 'ALL'>
          value={teamFilter}
          onChange={(val) => setTeamFilter(val)}
          style={{ minWidth: 200 }}
          options={[
            {
              value: 'ALL',
              label: (
                <Space size={6}>
                  <TeamOutlined style={{ color: '#8c8c8c' }} />
                  <span>Tất cả nhóm</span>
                </Space>
              ),
            },
            ...teams.map((t) => ({
              value: t.id,
              label: (
                <Space size={6}>
                  <TeamOutlined style={{ color: '#1677ff' }} />
                  <span>{t.name}</span>
                </Space>
              ),
            })),
          ]}
        />
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Lỗi kết nối dữ liệu thống kê"
          description={error}
          action={
            <Button size="small" danger onClick={handleRetry}>
              Thử lại
            </Button>
          }
          style={{ marginBottom: 24 }}
        />
      )}

      {loading && !stats ? (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {[1, 2, 3, 4, 5, 6].map((key) => (
              <Col xs={24} sm={12} lg={8} xl={4} key={key}>
                <Card style={{ borderRadius: 8, height: '100%' }}>
                  <Skeleton active paragraph={{ rows: 2 }} />
                </Card>
              </Col>
            ))}
          </Row>
          <ChartsSkeleton />
        </>
      ) : (
        <>
          <DashboardStatCards
            stats={safeStats}
            onNavigateToTasks={handleNavigateWithDashboardContext}
          />
          <Suspense fallback={<ChartsSkeleton />}>
            <DashboardCharts
              stats={safeStats}
              onNavigateToTasks={handleNavigateWithDashboardContext}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}
