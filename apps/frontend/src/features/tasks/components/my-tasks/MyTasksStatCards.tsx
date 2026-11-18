import React from 'react';
import {
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import type {
  MyTaskDeadlineCardKey,
  MyTasksStatsSummary,
} from '../../utils/my-tasks.utils';

export interface MyTasksStatCardsProps {
  stats: MyTasksStatsSummary;
  activeCard: MyTaskDeadlineCardKey | null;
  onToggleCard: (card: MyTaskDeadlineCardKey) => void;
}

interface StatCardConfig {
  key: MyTaskDeadlineCardKey;
  label: string;
  subtitle: string;
  count: number;
  accentColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

export const MyTasksStatCards: React.FC<MyTasksStatCardsProps> = ({
  stats,
  activeCard,
  onToggleCard,
}) => {
  const cards: StatCardConfig[] = [
    {
      key: 'overdue',
      label: 'Quá hạn',
      subtitle: 'Cần xử lý ngay',
      count: stats.overdue,
      accentColor: stats.overdue > 0 ? '#cf1322' : '#595959',
      iconBg: '#fff1f0',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />,
    },
    {
      key: 'today',
      label: 'Hôm nay',
      subtitle: 'Đến hạn trong ngày',
      count: stats.today,
      accentColor: stats.today > 0 ? '#d46b08' : '#595959',
      iconBg: '#fff7e6',
      icon: <ClockCircleOutlined style={{ color: '#fa8c16', fontSize: 16 }} />,
    },
    {
      key: 'upcoming',
      label: 'Sắp đến hạn',
      subtitle: 'Trong 7 ngày tới',
      count: stats.upcoming,
      accentColor: stats.upcoming > 0 ? '#0958d9' : '#595959',
      iconBg: '#e6f4ff',
      icon: <CalendarOutlined style={{ color: '#1677ff', fontSize: 16 }} />,
    },
  ];

  return (
    <div className="my-tasks-stats-grid" role="group" aria-label="Thống kê nhanh hạn chót">
      {cards.map((card) => {
        const isActive = activeCard === card.key;
        return (
          <button
            key={card.key}
            type="button"
            aria-pressed={isActive}
            data-testid={`my-tasks-stat-${card.key}`}
            className={`my-tasks-stat-card my-tasks-stat-card--${card.key}${
              isActive ? ' my-tasks-stat-card--active' : ''
            }`}
            onClick={() => onToggleCard(card.key)}
          >
            <div className="my-tasks-stat-card-header">
              <span
                className="my-tasks-stat-card-icon"
                style={{ backgroundColor: card.iconBg }}
              >
                {card.icon}
              </span>
              <div className="my-tasks-stat-card-text">
                <div className="my-tasks-stat-card-label">{card.label}</div>
                <div className="my-tasks-stat-card-subtitle">{card.subtitle}</div>
              </div>
            </div>

            <div
              className="my-tasks-stat-card-count"
              style={{ color: card.accentColor }}
            >
              {card.count}
            </div>
          </button>
        );
      })}
    </div>
  );
};
