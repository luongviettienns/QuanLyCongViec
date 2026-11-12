import { Row, Col, Card, Statistic, Typography } from 'antd';
import {
  CheckSquareOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CalendarOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import type { TaskStats, TaskFilterPatch } from '../../tasks/types/task.types';

const { Text } = Typography;

export interface DashboardStatCardsProps {
  stats: TaskStats;
  onNavigateToTasks?: (patch?: TaskFilterPatch) => void;
}

export function DashboardStatCards({ stats, onNavigateToTasks }: DashboardStatCardsProps) {
  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
      <Col xs={24} sm={12} lg={8} xl={4}>
        <Card
          hoverable
          onClick={() => onNavigateToTasks?.({})}
          style={{
            borderRadius: 8,
            borderTop: '3px solid #1677ff',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong>Tổng công việc</Text>}
            value={stats.total}
            prefix={<CheckSquareOutlined style={{ color: '#1677ff', marginRight: 6 }} />}
            styles={{ content: { color: '#1677ff', fontWeight: 600 } }}
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
          onClick={() => onNavigateToTasks?.({ statusFilter: 'TODO' })}
          style={{
            borderRadius: 8,
            borderTop: '3px solid #faad14',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong>Cần làm</Text>}
            value={stats.todo}
            prefix={<ClockCircleOutlined style={{ color: '#faad14', marginRight: 6 }} />}
            styles={{ content: { color: '#faad14', fontWeight: 600 } }}
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
          onClick={() => onNavigateToTasks?.({ statusFilter: 'IN_PROGRESS' })}
          style={{
            borderRadius: 8,
            borderTop: '3px solid #13c2c2',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong>Đang thực hiện</Text>}
            value={stats.inProgress}
            prefix={<SyncOutlined style={{ color: '#13c2c2', marginRight: 6 }} />}
            styles={{ content: { color: '#13c2c2', fontWeight: 600 } }}
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
          onClick={() => onNavigateToTasks?.({ statusFilter: 'DONE' })}
          style={{
            borderRadius: 8,
            borderTop: '3px solid #52c41a',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong>Đã hoàn thành</Text>}
            value={stats.done}
            prefix={<CheckCircleOutlined style={{ color: '#52c41a', marginRight: 6 }} />}
            styles={{ content: { color: '#52c41a', fontWeight: 600 } }}
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
          onClick={() => onNavigateToTasks?.({ statusFilter: 'ALL', deadlineFilter: 'overdue' })}
          style={{
            borderRadius: 8,
            borderTop: stats.overdue > 0 ? '3px solid #ff4d4f' : '3px solid #d9d9d9',
            backgroundColor: stats.overdue > 0 ? '#fff2f0' : '#ffffff',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong style={{ color: stats.overdue > 0 ? '#cf1322' : 'inherit' }}>Quá hạn</Text>}
            value={stats.overdue}
            prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />}
            styles={{ content: { color: stats.overdue > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: 600 } }}
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
          onClick={() => onNavigateToTasks?.({ statusFilter: 'ALL', deadlineFilter: 'due_soon' })}
          style={{
            borderRadius: 8,
            borderTop: stats.dueSoon > 0 ? '3px solid #fa8c16' : '3px solid #d9d9d9',
            backgroundColor: stats.dueSoon > 0 ? '#fffbe6' : '#ffffff',
            height: '100%',
            cursor: onNavigateToTasks ? 'pointer' : undefined,
          }}
        >
          <Statistic
            title={<Text strong style={{ color: stats.dueSoon > 0 ? '#d46b08' : 'inherit' }}>Sắp đến hạn</Text>}
            value={stats.dueSoon}
            prefix={<CalendarOutlined style={{ color: '#fa8c16', marginRight: 6 }} />}
            styles={{ content: { color: stats.dueSoon > 0 ? '#fa8c16' : '#8c8c8c', fontWeight: 600 } }}
          />
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Trong 7 ngày tới</Text>
            <ArrowRightOutlined style={{ fontSize: 11, color: '#bfbfbf' }} />
          </div>
        </Card>
      </Col>
    </Row>
  );
}
