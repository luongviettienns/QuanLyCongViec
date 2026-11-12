import {
  Row,
  Col,
  Card,
  Progress,
  Button,
  Space,
  Typography,
  Tag,
  Empty,
} from 'antd';
import {
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
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
import type { TaskStats, TaskFilterPatch } from '../../tasks/types/task.types';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
);

const { Text, Paragraph } = Typography;

export interface DashboardChartsProps {
  stats: TaskStats;
  onNavigateToTasks?: (patch?: TaskFilterPatch) => void;
}

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

function getProgressStatus(rate: number) {
  if (rate >= 100) return 'success';
  if (rate >= 50) return 'normal';
  return 'active';
}

function getProgressMessage(rate: number, total: number) {
  if (total === 0) return 'Chưa có công việc nào. Bắt đầu bằng việc thêm mới một công việc!';
  if (rate >= 100) return 'Xuất sắc! Bạn đã hoàn thành tất cả công việc.';
  if (rate >= 70) return 'Tiến độ rất tốt! Hãy tiếp tục duy trì nhịp độ làm việc.';
  if (rate >= 40) return 'Đang tiến triển ổn định. Hãy ưu tiên các đầu việc quan trọng.';
  return 'Tiến độ còn chậm. Hãy tập trung giải quyết các công việc đang tồn đọng.';
}

export function DashboardCharts({ stats, onNavigateToTasks }: DashboardChartsProps) {
  const statusChartData = {
    labels: ['Cần làm', 'Đang thực hiện', 'Đã hoàn thành'],
    datasets: [
      {
        data: [stats.todo, stats.inProgress, stats.done],
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
          stats.byPriority.low,
          stats.byPriority.medium,
          stats.byPriority.high,
        ],
        backgroundColor: ['#1890ff', '#fa8c16', '#ff4d4f'],
        borderRadius: 6,
      },
    ],
  };

  const deadlineChartData = {
    labels: stats.upcomingDeadlines.map((p) => {
      const parts = p.date.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}` : p.date;
    }),
    datasets: [
      {
        label: 'Công việc đến hạn',
        data: stats.upcomingDeadlines.map((p) => p.count),
        backgroundColor: 'rgba(250, 140, 22, 0.85)',
        hoverBackgroundColor: '#fa8c16',
        borderRadius: 6,
      },
    ],
  };

  return (
    <>
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
              {stats.total === 0 ? (
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
              {stats.total === 0 ? (
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
              {stats.upcomingDeadlines.every((p) => p.count === 0) ? (
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
              <Tag color={stats.completionRate >= 70 ? 'success' : stats.completionRate >= 40 ? 'processing' : 'warning'}>
                {stats.completionRate}% hoàn thành
              </Tag>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0' }}>
              <Progress
                type="dashboard"
                percent={stats.completionRate}
                status={getProgressStatus(stats.completionRate)}
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
                {getProgressMessage(stats.completionRate, stats.total)}
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
                onClick={() => onNavigateToTasks?.({})}
              >
                Xem chi tiết danh sách
              </Button>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '8px 0' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text><ClockCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />Cần làm (TODO)</Text>
                  <Text strong>{stats.todo} / {stats.total}</Text>
                </div>
                <Progress
                  percent={stats.total > 0 ? Math.round((stats.todo / stats.total) * 100) : 0}
                  strokeColor="#faad14"
                  size="small"
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text><SyncOutlined style={{ color: '#13c2c2', marginRight: 8 }} />Đang thực hiện (IN_PROGRESS)</Text>
                  <Text strong>{stats.inProgress} / {stats.total}</Text>
                </div>
                <Progress
                  percent={stats.total > 0 ? Math.round((stats.inProgress / stats.total) * 100) : 0}
                  strokeColor="#13c2c2"
                  size="small"
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text><CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />Đã hoàn thành (DONE)</Text>
                  <Text strong>{stats.done} / {stats.total}</Text>
                </div>
                <Progress
                  percent={stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0}
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
                        {stats.todo + stats.inProgress}
                      </div>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ padding: '10px 12px', background: stats.overdue > 0 ? '#fff2f0' : '#fafafa', borderRadius: 6 }}>
                      <Text type={stats.overdue > 0 ? 'danger' : 'secondary'} style={{ fontSize: 12 }}>Quá hạn cần ưu tiên</Text>
                      <div style={{ fontSize: 18, fontWeight: 600, color: stats.overdue > 0 ? '#ff4d4f' : '#1f1f1f', marginTop: 4 }}>
                        {stats.overdue}
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
  );
}
