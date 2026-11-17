import React from 'react';
import { Button, Space, Tag, Tooltip, Typography } from 'antd';
import {
  UserAddOutlined,
  UserDeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  RollbackOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  CrownOutlined,
  StopOutlined,
  BellOutlined,
  OrderedListOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { Notification, NotificationType } from '../types/notification.types';
import { getNotificationVisualStyle } from '../utils/notification-state.utils';

const { Text } = Typography;

interface NotificationItemViewProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
  onMarkRead?: (id: number) => void;
}

function getNotificationIcon(type: NotificationType, color: string) {
  const iconStyle = { fontSize: 15, color };

  switch (type) {
    case 'TASK_ASSIGNED':
    case 'TASK_COLLABORATOR_INVITED':
      return <UserAddOutlined style={iconStyle} />;
    case 'TASK_UNASSIGNED':
    case 'TEAM_MEMBER_REMOVED':
    case 'TASK_COLLABORATOR_REMOVED':
    case 'SUBTASK_UNASSIGNED':
      return <UserDeleteOutlined style={iconStyle} />;
    case 'TASK_STATUS_CHANGED':
    case 'SUBTASK_STATUS_CHANGED':
      return <SyncOutlined style={iconStyle} />;
    case 'TASK_COMPLETED':
    case 'TASK_COLLABORATOR_ACCEPTED':
    case 'SUBTASK_COMPLETED':
      return <CheckCircleOutlined style={iconStyle} />;
    case 'TASK_RETURNED':
    case 'SUBTASK_REOPENED':
      return <RollbackOutlined style={iconStyle} />;
    case 'TASK_DEADLINE_CHANGED':
      return <CalendarOutlined style={iconStyle} />;
    case 'TASK_DEADLINE_SOON':
    case 'DEADLINE_SOON':
      return <ClockCircleOutlined style={iconStyle} />;
    case 'TASK_OVERDUE':
      return <AlertOutlined style={iconStyle} />;
    case 'TASK_DELETED':
      return <DeleteOutlined style={iconStyle} />;
    case 'TASK_MOVED_TEAM':
      return <FolderOpenOutlined style={iconStyle} />;
    case 'TEAM_MEMBER_ADDED':
    case 'TEAM_INVITED':
      return <TeamOutlined style={iconStyle} />;
    case 'TEAM_ROLE_CHANGED':
      return <SafetyCertificateOutlined style={iconStyle} />;
    case 'TEAM_OWNERSHIP_TRANSFERRED':
      return <CrownOutlined style={iconStyle} />;
    case 'TEAM_DELETED':
    case 'TASK_COLLABORATOR_DECLINED':
      return <StopOutlined style={iconStyle} />;
    case 'SUBTASK_ASSIGNED':
      return <OrderedListOutlined style={iconStyle} />;
    default:
      return <BellOutlined style={iconStyle} />;
  }
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Vừa xong';
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return `${diffDays} ngày trước`;

    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export const NotificationItemView: React.FC<NotificationItemViewProps> = ({
  notification,
  onClick,
  onMarkRead,
}) => {
  const visualStyle = getNotificationVisualStyle(notification.type);

  const rowClassName = [
    'notification-item',
    !notification.isRead ? 'notification-item--unread' : '',
    visualStyle.isOverdue ? 'notification-item--overdue' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="button"
      tabIndex={0}
      className={rowClassName}
      onClick={() => onClick(notification)}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(notification);
        }
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: visualStyle.iconBgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {getNotificationIcon(notification.type, visualStyle.iconColor)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 6,
            marginBottom: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <Text
              strong={!notification.isRead}
              style={{
                fontSize: 13,
                color: notification.isRead ? '#595959' : '#1f1f1f',
                lineHeight: 1.35,
              }}
              ellipsis
            >
              {notification.title}
            </Text>
            {visualStyle.isOverdue && (
              <Tag
                color="error"
                style={{
                  margin: 0,
                  fontSize: 10,
                  lineHeight: '16px',
                  padding: '0 5px',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              >
                Quá hạn
              </Tag>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {!notification.isRead && onMarkRead && (
              <Tooltip title="Đánh dấu đã đọc">
                <Button
                  type="text"
                  size="small"
                  className="notification-mark-read-btn"
                  icon={<CheckOutlined style={{ fontSize: 11, color: '#1677ff' }} />}
                  aria-label="Đánh dấu đã đọc"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead(notification.id);
                  }}
                />
              </Tooltip>
            )}
            {!notification.isRead && (
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: visualStyle.isOverdue ? '#ff4d4f' : '#1677ff',
                  display: 'inline-block',
                }}
              />
            )}
          </div>
        </div>

        <Text
          type="secondary"
          style={{
            fontSize: 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
            marginBottom: 4,
          }}
        >
          {notification.content}
        </Text>

        <Space size={8} style={{ fontSize: 11, color: '#8c8c8c' }}>
          <span>{formatTime(notification.createdAt)}</span>
          {notification.actor?.name && <span>• từ {notification.actor.name}</span>}
        </Space>
      </div>
    </div>
  );
};
