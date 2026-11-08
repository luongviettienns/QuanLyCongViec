import React from 'react';
import { Button, Segmented, Empty, Spin } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { NotificationItemView } from './NotificationItemView';
import type { Notification } from '../types/notification.types';

interface NotificationPopoverProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  activeTab: 'all' | 'unread';
  onTabChange: (tab: 'all' | 'unread') => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onLoadMore: () => void;
  onNavigate?: (dest: { type: 'task' | 'team'; id: number }) => void;
  onClose: () => void;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  notifications,
  unreadCount,
  loading,
  loadingMore,
  hasMore,
  activeTab,
  onTabChange,
  onMarkRead,
  onMarkAllRead,
  onLoadMore,
  onNavigate,
  onClose,
}) => {
  const handleItemClick = (notification: Notification) => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    onClose();

    if (notification.taskId) {
      onNavigate?.({ type: 'task', id: notification.taskId });
    } else if (notification.teamId) {
      onNavigate?.({ type: 'team', id: notification.teamId });
    }
  };

  return (
    <div
      style={{
        width: 360,
        maxWidth: '92vw',
        maxHeight: 520,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px 8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15, color: '#1f1f1f' }}>
          Thông báo {unreadCount > 0 && `(${unreadCount})`}
        </span>
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
          style={{ padding: 0, fontSize: 12 }}
        >
          Đọc tất cả
        </Button>
      </div>

      {/* Tabs Filter */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
        <Segmented
          block
          size="small"
          value={activeTab}
          onChange={(val) => onTabChange(val as 'all' | 'unread')}
          options={[
            { label: 'Tất cả', value: 'all' },
            {
              label: unreadCount > 0 ? `Chưa đọc (${unreadCount})` : 'Chưa đọc',
              value: 'unread',
            },
          ]}
        />
      </div>

      {/* List Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: 380,
          minHeight: 180,
          position: 'relative',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: 200,
            }}
          >
            <Spin tip="Đang tải..." />
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '40px 16px' }}>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                activeTab === 'unread'
                  ? 'Bạn đã đọc tất cả thông báo!'
                  : 'Chưa có thông báo nào'
              }
            />
          </div>
        ) : (
          <div>
            {notifications.map((item) => (
              <NotificationItemView
                key={item.id}
                notification={item}
                onClick={handleItemClick}
              />
            ))}

            {hasMore && (
              <div style={{ textAlign: 'center', padding: '12px 16px' }}>
                <Button
                  type="text"
                  size="small"
                  loading={loadingMore}
                  onClick={onLoadMore}
                  style={{ color: '#1677ff', fontSize: 12 }}
                >
                  Xem các thông báo cũ hơn
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
