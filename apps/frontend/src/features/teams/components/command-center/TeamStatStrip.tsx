import { Row, Col, Card, Statistic, Typography } from 'antd';
import {
  CheckSquareOutlined,
  SyncOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type {
  TeamCommandMetrics,
  CommandFilterType,
} from '../../utils/team-command-center.utils.ts';

const { Text } = Typography;

export interface TeamStatStripProps {
  metrics: TeamCommandMetrics;
  activeFilter?: CommandFilterType;
  onSelectFilter: (filter: CommandFilterType) => void;
}

export function TeamStatStrip({
  metrics,
  activeFilter = 'all',
  onSelectFilter,
}: TeamStatStripProps) {
  const cards = [
    {
      key: 'all' as CommandFilterType,
      title: 'Tổng việc',
      value: metrics.total,
      color: '#1677ff',
      icon: <CheckSquareOutlined style={{ color: '#1677ff' }} />,
    },
    {
      key: 'in_progress' as CommandFilterType,
      title: 'Đang làm',
      value: metrics.inProgress,
      color: '#13c2c2',
      icon: <SyncOutlined spin={activeFilter === 'in_progress'} style={{ color: '#13c2c2' }} />,
    },
    {
      key: 'overdue' as CommandFilterType,
      title: 'Quá hạn',
      value: metrics.overdue,
      color: metrics.overdue > 0 ? '#ff4d4f' : '#8c8c8c',
      icon: <ExclamationCircleOutlined style={{ color: metrics.overdue > 0 ? '#ff4d4f' : '#8c8c8c' }} />,
      alert: metrics.overdue > 0,
    },
    {
      key: 'done' as CommandFilterType,
      title: 'Hoàn thành',
      value: metrics.done,
      color: '#52c41a',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    },
  ];

  const handleCardClick = (targetKey: CommandFilterType) => {
    if (activeFilter === targetKey && targetKey !== 'all') {
      onSelectFilter('all');
    } else {
      onSelectFilter(targetKey);
    }
  };

  return (
    <div style={{ overflow: 'hidden', marginBottom: 16 }}>
      <Row gutter={[10, 10]}>
        {cards.map((card) => {
          const isActive = activeFilter === card.key;
          return (
            <Col xs={12} sm={12} md={6} key={card.key}>
              <Card
                hoverable
                onClick={() => handleCardClick(card.key)}
                styles={{
                  body: {
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  },
                }}
                style={{
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: isActive ? `2px solid ${card.color}` : '1px solid #f0f0f0',
                  background: isActive ? '#fafafa' : '#ffffff',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : undefined,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }} ellipsis>
                    {card.title}
                  </Text>
                  <Statistic
                    value={card.value}
                    styles={{
                      content: {
                        fontSize: 20,
                        fontWeight: 700,
                        color: card.color,
                        lineHeight: 1.2,
                      },
                    }}
                  />
                </div>
                <div
                  style={{
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: `${card.color}15`,
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
}
