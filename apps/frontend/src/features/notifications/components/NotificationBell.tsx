import React, { useState } from 'react';
import { Badge, Button, Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationPopover } from './NotificationPopover';

interface NotificationBellProps {
  onNavigate?: (dest: { type: 'task' | 'team'; id: number }) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    activeTab,
    setActiveTab,
    loadMore,
    markRead,
    markAllRead,
    fetchNotifications,
  } = useNotifications();

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      fetchNotifications();
    }
  };

  return (
    <Popover
      content={
        <NotificationPopover
          notifications={notifications}
          unreadCount={unreadCount}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={hasMore}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onLoadMore={loadMore}
          onNavigate={onNavigate}
          onClose={() => setOpen(false)}
        />
      }
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      overlayInnerStyle={{ padding: 0 }}
      arrow={{ pointAtCenter: true }}
    >
      <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 4]}>
        <Button
          type="text"
          shape="circle"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          aria-label="Thông báo"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
          }}
        />
      </Badge>
    </Popover>
  );
};
