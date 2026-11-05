import { useEffect, useState, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Progress,
  Button,
  Space,
  Typography,
  Alert,
  Skeleton,
  Tag,
  Empty,
} from 'antd';
import {
  CheckSquareOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  ReloadOutlined,
  PlusOutlined,
  ArrowRightOutlined,
  PieChartOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { getTaskStats } from '../api/tasks.api';
import type {
  TaskStats,
  TaskStatus,
  TaskPriorityStats,
  TaskDeadlinePoint,
} from '../types/task.types';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
);

const { Title, Text, Paragraph } = Typography;

interface DashboardPageProps {
  onNavigateToTasks?: (status?: TaskStatus) => void;
  onOpenCreateTask?: () => void;
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
      if (err instanceof Error && err.name === 'AbortError') {
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
    const controller = new AbortController();

    async function load() {
      await Promise.resolve();
      void fetchStats(controller.signal);
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [fetchStats]);

  const safeStats = stats || sanitizeStats(null);

  const getProgressStatus = (rate: number) => {
    if (rate >= 100) return 'success';
    if (rate >= 50) return 'normal';
    return 'active';
  };

  const getProgressMessage = (rate: number, total: number) => {
    if (total === 0) return 'Chưa có công việc nào. Bắt đầu bằng việc thêm mới một công việc!';
    if (rate >= 100) return 'Xuất sắc! Bạn đã hoàn thành tất cả công việc.';
    if (rate >= 70) return 'Tiến độ rất tốt! Hãy tiếp tục duy trì nhịp độ làm việc.';
    if (rate >= 40) return 'Đang tiến triển ổn định. Hãy ưu tiên các đầu việc quan trọng.';
    return 'Tiến độ còn chậm. Hãy tập trung giải quyết các công việc đang tồn đọng.';
  };

  const statusChartData = {
    labels: ['Cần làm', 'Đang thực hiện', 'Đã hoàn thành'],
    datasets: [
      {
        data: [safeStats.todo, safeStats.inProgress, safeStats.done],
        backgroundColor: ['#faad14', '#1677ff', '#52c41a'],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  const priorityChartData = {
    labels: ['Thấp', 'Trung bình', 'Cao'],
    datasets: [
      {
        label: 'Số lượng công việc',
        data: [
          safeStats.byPriority.low,
          safeStats.byPriority.medium,
          safeStats.byPriority.high,
        ],
        backgroundColor: ['#1890ff', '#fa8c16', '#ff4d4f'],
        borderRadius: 6,
      },
    ],
  };

  const deadlineChartData = {
    labels: safeStats.upcomingDeadlines.map((p) => {
      const parts = p.date.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : p.date;
    }),
    datasets: [
      {
        label: 'Công việc đến hạn',
        data: safeStats.upcomingDeadlines.map((p) => p.count),
        backgroundColor: 'rgba(250, 140, 22, 0.85)',
        hoverBackgroundColor: '#fa8c16',
        borderRadius: 6,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        padding: 8,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
        },
        grid: {
          color: '#f0f0f0',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          padding: 14,
        },
      },
      tooltip: {
        padding: 8,
      },
    },
  };

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
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.()}
                style={{
                  borderRadius: 8,
                  borderTop: '3px solid #1677ff',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong>Tổng công việc</Text>}
                  value={safeStats.total}
                  prefix={<CheckSquareOutlined style={{ color: '#1677ff', marginRight: 6 }} />}
                  valueStyle={{ color: '#1677ff', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Tất cả các mục</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.('TODO')}
                style={{
                  borderRadius: 8,
                  borderTop: '3px solid #faad14',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong>Cần làm</Text>}
                  value={safeStats.todo}
                  prefix={<ClockCircleOutlined style={{ color: '#faad14', marginRight: 6 }} />}
                  valueStyle={{ color: '#faad14', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Chờ xử lý</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.('IN_PROGRESS')}
                style={{
                  borderRadius: 8,
                  borderTop: '3px solid #13c2c2',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong>Đang thực hiện</Text>}
                  value={safeStats.inProgress}
                  prefix={<SyncOutlined style={{ color: '#13c2c2', marginRight: 6 }} />}
                  valueStyle={{ color: '#13c2c2', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Đang tiến hành</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.('DONE')}
                style={{
                  borderRadius: 8,
                  borderTop: '3px solid #52c41a',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong>Đã hoàn thành</Text>}
                  value={safeStats.done}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />}
                  valueStyle={{ color: '#52c41a', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Đã kết thúc</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.()}
                style={{
                  borderRadius: 8,
                  borderTop: safeStats.overdue > 0 ? '3px solid #ff4d4f' : '3px solid #d9d9d9',
                  backgroundColor: safeStats.overdue > 0 ? '#fff2f0' : '#ffffff',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong style={{ color: safeStats.overdue > 0 ? '#cf1322' : 'inherit' }}>Quá hạn</Text>}
                  value={safeStats.overdue}
                  prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />}
                  valueStyle={{ color: safeStats.overdue > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Cần xử lý gấp</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>

            <Col xs={24} sm={12} lg={8} xl={4}>
              <Card
                hoverable
                onClick={() => onNavigateToTasks?.()}
                style={{
                  borderRadius: 8,
                  borderTop: safeStats.dueSoon > 0 ? '3px solid #fa8c16' : '3px solid #d9d9d9',
                  backgroundColor: safeStats.dueSoon > 0 ? '#fffbe6' : '#ffffff',
                  height: '100%',
                }}
              >
                <Statistic
                  title={<Text strong style={{ color: safeStats.dueSoon > 0 ? '#d46b08' : 'inherit' }}>Sắp đến hạn</Text>}
                  value={safeStats.dueSoon}
                  prefix={<CalendarOutlined style={{ color: '#fa8c16', marginRight: 6 }} />}
                  valueStyle={{ color: safeStats.dueSoon > 0 ? '#fa8c16' : '#8c8c8c', fontWeight: 600 }}
                />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Trong 7 ngày tới</Text>
                  <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={8}>
              <Card
                title={
                  <Space>
                    <PieChartOutlined style={{ color: '#1677ff' }} />
                    <span>Trạng thái công việc</span>
                  </Space>
                }
                style={{ borderRadius: 8, height: '100%' }}
              >
                <div style={{ height: 260, minHeight: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {safeStats.total === 0 ? (
                    <Empty description="Chưa có dữ liệu" />
                  ) : (
                    <Doughnut data={statusChartData} options={doughnutChartOptions} />
                  )}
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Card
                title={
                  <Space>
                    <BarChartOutlined style={{ color: '#fa8c16' }} />
                    <span>Mức độ ưu tiên</span>
                  </Space>
                }
                style={{ borderRadius: 8, height: '100%' }}
              >
                <div style={{ height: 260, minHeight: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {safeStats.total === 0 ? (
                    <Empty description="Chưa có dữ liệu" />
                  ) : (
                    <div style={{ width: '100%', height: '100%' }}>
                      <Bar data={priorityChartData} options={barChartOptions} />
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Card
                title={
                  <Space>
                    <CalendarOutlined style={{ color: '#fa8c16' }} />
                    <span>Deadline 7 ngày tới</span>
                  </Space>
                }
                style={{ borderRadius: 8, height: '100%' }}
              >
                <div style={{ height: 260, minHeight: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {safeStats.upcomingDeadlines.every((p) => p.count === 0) ? (
                    <Empty description="Không có deadline trong 7 ngày tới" />
                  ) : (
                    <div style={{ width: '100%', height: '100%' }}>
                      <Bar data={deadlineChartData} options={barChartOptions} />
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card
                title="Tiến độ hoàn thành công việc"
                style={{ borderRadius: 8, height: '100%' }}
                extra={
                  <Tag color={safeStats.completionRate >= 70 ? 'success' : safeStats.completionRate >= 40 ? 'processing' : 'warning'}>
                    {safeStats.completionRate}% hoàn thành
                  </Tag>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0' }}>
                  <Progress
                    type="dashboard"
                    percent={safeStats.completionRate}
                    status={getProgressStatus(safeStats.completionRate)}
                    strokeWidth={8}
                    size={180}
                  />
                  <Paragraph
                    style={{
                      marginTop: 16,
                      fontSize: 14,
                      textAlign: 'center',
                      fontWeight: 500,
                      color: '#595959',
                    }}
                  >
                    {getProgressMessage(safeStats.completionRate, safeStats.total)}
                  </Paragraph>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title="Phân bố chi tiết trạng thái"
                style={{ borderRadius: 8, height: '100%' }}
                extra={
                  <Button
                    type="link"
                    size="small"
                    onClick={() => onNavigateToTasks?.()}
                  >
                    Xem chi tiết danh sách
                  </Button>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text><ClockCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />Cần làm (TODO)</Text>
                      <Text strong>{safeStats.todo} / {safeStats.total}</Text>
                    </div>
                    <Progress
                      percent={safeStats.total > 0 ? Math.round((safeStats.todo / safeStats.total) * 100) : 0}
                      strokeColor="#faad14"
                      size="small"
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text><SyncOutlined style={{ color: '#13c2c2', marginRight: 8 }} />Đang thực hiện (IN_PROGRESS)</Text>
                      <Text strong>{safeStats.inProgress} / {safeStats.total}</Text>
                    </div>
                    <Progress
                      percent={safeStats.total > 0 ? Math.round((safeStats.inProgress / safeStats.total) * 100) : 0}
                      strokeColor="#13c2c2"
                      size="small"
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Đã hoàn thành (DONE)</Text>
                      <Text strong>{safeStats.done} / {safeStats.total}</Text>
                    </div>
                    <Progress
                      percent={safeStats.total > 0 ? Math.round((safeStats.done / safeStats.total) * 100) : 0}
                      strokeColor="#52c41a"
                      size="small"
                    />
                  </div>

                  <div style={{ marginTop: 12, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                    <Row gutter={16}>
                      <Col span={12}>
                        <div style={{ padding: '10px 12px', background: '#fafafa', borderRadius: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Đang mở (chưa xong)</Text>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#1f1f1f', marginTop: 4 }}>
                            {safeStats.todo + safeStats.inProgress}
                          </div>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div style={{ padding: '10px 12px', background: safeStats.overdue > 0 ? '#fff2f0' : '#fafafa', borderRadius: 6 }}>
                          <Text type={safeStats.overdue > 0 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>Quá hạn cần ưu tiên</Text>
                          <div style={{ fontSize: 18, fontWeight: 600, color: safeStats.overdue > 0 ? '#ff4d4f' : '#1f1f1f', marginTop: 4 }}>
                            {safeStats.overdue}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>
                </div>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
