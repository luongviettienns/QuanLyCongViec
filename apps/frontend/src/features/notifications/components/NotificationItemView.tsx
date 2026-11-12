import React from 'react';
import { Typography, Space } from 'antd';
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
} from '@ant-design/icons';
import type { Notification, NotificationType } from '../types/notification.types';

const { Text } = Typography;

interface NotificationItemViewProps {
  notification: Notification;
  onClick: (notification: Notification) => void;
}

function getNotificationIcon(type: NotificationType) {
  const iconStyle = { fontSize: 18, marginTop: 2 };

  switch (type) {
    case 'TASK_ASSIGNED':
      return <UserAddOutlined style={{ ...iconStyle, color: '#1677ff' }} />;
    case 'TASK_UNASSIGNED':
      return <UserDeleteOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;
    case 'TASK_STATUS_CHANGED':
      return <SyncOutlined style={{ ...iconStyle, color: '#13c2c2' }} />;
    case 'TASK_COMPLETED':
      return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
    case 'TASK_RETURNED':
      return <RollbackOutlined style={{ ...iconStyle, color: '#faad14' }} />;
    case 'TASK_DEADLINE_CHANGED':
      return <CalendarOutlined style={{ ...iconStyle, color: '#722ed1' }} />;
    case 'TASK_DEADLINE_SOON':
    case 'DEADLINE_SOON':
      return <ClockCircleOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;
    case 'TASK_OVERDUE':
      return <AlertOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />;
    case 'TASK_DELETED':
      return <DeleteOutlined style={{ ...iconStyle, color: '#8c8c8c' }} />;
    case 'TASK_MOVED_TEAM':
      return <FolderOpenOutlined style={{ ...iconStyle, color: '#2f54eb' }} />;
    case 'TEAM_MEMBER_ADDED':
    case 'TEAM_INVITED':
      return <TeamOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
    case 'TEAM_MEMBER_REMOVED':
      return <UserDeleteOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />;
    case 'TEAM_ROLE_CHANGED':
      return <SafetyCertificateOutlined style={{ ...iconStyle, color: '#1677ff' }} />;
    case 'TEAM_OWNERSHIP_TRANSFERRED':
      return <CrownOutlined style={{ ...iconStyle, color: '#faad14' }} />;
    case 'TEAM_DELETED':
      return <StopOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />;
    case 'TASK_COLLABORATOR_INVITED':
      return <UserAddOutlined style={{ ...iconStyle, color: '#722ed1' }} />;
    case 'TASK_COLLABORATOR_ACCEPTED':
      return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
    case 'TASK_COLLABORATOR_DECLINED':
      return <StopOutlined style={{ ...iconStyle, color: '#ff4d4f' }} />;
    case 'TASK_COLLABORATOR_REMOVED':
      return <UserDeleteOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;
    case 'SUBTASK_ASSIGNED':
      return <OrderedListOutlined style={{ ...iconStyle, color: '#13c2c2' }} />;
    case 'SUBTASK_UNASSIGNED':
      return <UserDeleteOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;
    case 'SUBTASK_STATUS_CHANGED':
      return <SyncOutlined style={{ ...iconStyle, color: '#13c2c2' }} />;
    case 'SUBTASK_COMPLETED':
      return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
    case 'SUBTASK_REOPENED':
      return <RollbackOutlined style={{ ...iconStyle, color: '#faad14' }} />;
    default:
      return <BellOutlined style={{ ...iconStyle, color: '#1677ff' }} />;
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
}) => {
  return (
    <div
      onClick={() => onClick(notification)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 16px',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        backgroundColor: notification.isRead ? '#ffffff' : '#f0f7ff',
        borderBottom: '1px solid #f0f0f0',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = notification.isRead ? '#fafafa' : '#e6f4ff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = notification.isRead ? '#ffffff' : '#f0f7ff';
      }}
    >
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        {getNotificationIcon(notification.type)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <Text
            strong={!notification.isRead}
            style={{
              fontSize: 13,
              color: notification.isRead ? '#595959' : '#1f1f1f',
              lineHeight: 1.3,
            }}
            ellipsis
          >
            {notification.title}
          </Text>
          {!notification.isRead && (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#1677ff',
                display: 'inline-block',
                marginLeft: 6,
                flexShrink: 0,
              }}
            />
          )}
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
          {notification.actor?.name && (
            <span>• từ {notification.actor.name}</span>
          )}
        </Space>
      </div>
    </div>
  );
};
