import React, { useMemo } from 'react';
import { Alert, Button, Empty, Segmented, Spin, Tag } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { NotificationItemView } from './NotificationItemView';
import type { Notification, NotificationFilterTab } from '../types/notification.types';
import {
  buildNotificationDestination,
  groupNotificationsByTime,
  resolveNotificationModalTab,
  type NotificationDestination,
} from '../utils/notification-state.utils';
import './notifications.css';

interface NotificationPopoverProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  loadingMore: boolean;
  error?: string | null;
  hasMore: boolean;
  activeTab: NotificationFilterTab;
  variant?: 'popover' | 'drawer';
  onTabChange: (tab: NotificationFilterTab) => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onLoadMore: () => void;
  onRetry?: () => void;
  onNavigate?: (dest: NotificationDestination) => void;
  onClose: () => void;
}

function getEmptyDescription(activeTab: NotificationFilterTab): string {
  switch (activeTab) {
    case 'unread':
      return 'Bạn đã đọc tất cả thông báo!';
    case 'important':
      return 'Không có thông báo quan trọng nào';
    default:
      return 'Chưa có thông báo nào';
  }
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  notifications,
  unreadCount,
  loading,
  loadingMore,
  error,
  hasMore,
  activeTab,
  variant = 'popover',
  onTabChange,
  onMarkRead,
  onMarkAllRead,
  onLoadMore,
  onRetry,
  onNavigate,
  onClose,
}) => {
  const isDrawer = variant === 'drawer';

  const groupedNotifications = useMemo(
    () => groupNotificationsByTime(notifications),
    [notifications],
  );

  const handleItemClick = (notification: Notification) => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    onClose();

    const dest = buildNotificationDestination(notification);
    if (dest) {
      if (dest.type === 'task') {
        onNavigate?.({
          ...dest,
          targetTab: resolveNotificationModalTab(
            notification.type,
            notification.subtaskId,
            notification.commentId,
          ),
        });
      } else {
        onNavigate?.(dest);
      }
    }
  };

  return (
    <div
      style={{
        width: isDrawer ? '100%' : 400,
        maxWidth: isDrawer ? '100%' : 'calc(100vw - 24px)',
        height: isDrawer ? '100%' : undefined,
        maxHeight: isDrawer ? '100%' : 540,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        borderRadius: isDrawer ? 0 : 8,
        overflow: isDrawer ? undefined : 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px 10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: '#1f1f1f' }}>Thông báo</span>
          {unreadCount > 0 && (
            <Tag
              color="blue"
              style={{
                margin: 0,
                borderRadius: 10,
                fontSize: 11,
                lineHeight: '18px',
                padding: '0 7px',
              }}
            >
              {unreadCount} chưa đọc
            </Tag>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          {isDrawer && (
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={onClose}
              aria-label="Đóng thông báo"
              style={{ minWidth: 32, minHeight: 32 }}
            />
          )}
        </div>
      </div>

      {/* Tabs Filter */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Segmented<NotificationFilterTab>
          block
          size="small"
          value={activeTab}
          onChange={(val) => onTabChange(val)}
          options={[
            { label: 'Tất cả', value: 'all' },
            {
              label: unreadCount > 0 ? `Chưa đọc (${unreadCount})` : 'Chưa đọc',
              value: 'unread',
            },
            { label: 'Quan trọng', value: 'important' },
          ]}
        />
      </div>

      {/* List Container */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: isDrawer ? undefined : 410,
          minHeight: isDrawer ? 0 : 200,
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
            <Spin description="Đang tải..." />
          </div>
        ) : (
          <div>
            {groupedNotifications.map((group) => (
              <div key={group.key}>
                <div className="notification-group-header">{group.label}</div>
                {group.items.map((item) => (
                  <NotificationItemView
                    key={item.id}
                    notification={item}
                    onClick={handleItemClick}
                    onMarkRead={onMarkRead}
                  />
                ))}
              </div>
            ))}

            {error && (
              <div style={{ padding: notifications.length > 0 ? '8px 16px' : 16 }}>
                <Alert
                  type="error"
                  showIcon
                  message="Không thể tải thông báo"
                  description={error}
                  action={
                    onRetry && (
                      <Button size="small" danger onClick={onRetry}>
                        Thử lại
                      </Button>
                    )
                  }
                />
              </div>
            )}

            {!error && notifications.length === 0 && (
              <div style={{ padding: '44px 16px' }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={getEmptyDescription(activeTab)}
                />
              </div>
            )}

            {notifications.length > 0 && hasMore && (
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
