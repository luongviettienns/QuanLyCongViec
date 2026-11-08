import { useEffect, useState, useCallback } from 'react';
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
} from 'antd';
import { ReloadOutlined, PlusOutlined } from '@ant-design/icons';
import { getTaskStats } from '../../tasks/api/tasks.api';
import type {
  TaskStats,
  TaskStatus,
  TaskPriorityStats,
  TaskDeadlinePoint,
} from '../../tasks/types/task.types';
import { DashboardStatCards } from '../components/DashboardStatCards';
import { DashboardCharts } from '../components/DashboardCharts';

const { Title, Paragraph } = Typography;

interface DashboardPageProps {
  onNavigateToTasks?: (status?: TaskStatus) => void;
  onOpenCreateTask?: () => void;
  active?: boolean;
}

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
  onNavigateToTasks,
  onOpenCreateTask,
  active = true,
}: DashboardPageProps) {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getTaskStats(signal);
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
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.name === 'UnauthorizedError')) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Không thể tải số liệu thống kê');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManualReload = useCallback(() => {
    setLoading(true);
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();

    async function load() {
      await Promise.resolve();
      void fetchStats(controller.signal);
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [active, fetchStats]);

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
          marginBottom: 24,
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
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleManualReload}
          >
            Làm mới
          </Button>
          {onOpenCreateTask && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onOpenCreateTask}
            >
              Thêm công việc
            </Button>
          )}
        </Space>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Lỗi kết nối dữ liệu thống kê"
          description={error}
          action={
            <Button size="small" danger onClick={handleManualReload}>
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

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            {[1, 2, 3].map((key) => (
              <Col xs={24} lg={8} key={key}>
                <Card style={{ borderRadius: 8, height: '100%' }}>
                  <Skeleton.Input active size="small" style={{ width: 140, marginBottom: 16 }} />
                  <div style={{ height: 260, minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      ) : (
        <>
          <DashboardStatCards
            stats={safeStats}
            onNavigateToTasks={onNavigateToTasks}
          />
          <DashboardCharts
            stats={safeStats}
            onNavigateToTasks={onNavigateToTasks}
          />
        </>
      )}
    </div>
  );
}
