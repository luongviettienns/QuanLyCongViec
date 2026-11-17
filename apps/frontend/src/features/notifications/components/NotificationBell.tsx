import React, { useState } from 'react';
import { Badge, Button, Drawer, Popover } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useResponsive } from '../../../shared/hooks';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationPopover } from './NotificationPopover';
import type { NotificationDestination } from '../utils/notification-state.utils';

interface NotificationBellProps {
  onNavigate?: (dest: NotificationDestination) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ onNavigate }) => {
  const [open, setOpen] = useState(false);
  const screens = useResponsive();
  const isMobile = !screens.md;

  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    error,
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
      void fetchNotifications({ silent: notifications.length > 0 });
    }
  };

  const triggerButton = (
    <Badge count={unreadCount} overflowCount={99} size="small" offset={[-2, 4]}>
      <Button
        type="text"
        shape="circle"
        icon={<BellOutlined style={{ fontSize: 18 }} />}
        aria-label="Thông báo"
        onClick={isMobile ? () => handleOpenChange(!open) : undefined}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
        }}
      />
    </Badge>
  );

  const renderContent = (variant: 'popover' | 'drawer') => (
    <NotificationPopover
      notifications={notifications}
      unreadCount={unreadCount}
      loading={loading}
      loadingMore={loadingMore}
      error={error}
      hasMore={hasMore}
      activeTab={activeTab}
      variant={variant}
      onTabChange={setActiveTab}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
      onLoadMore={loadMore}
      onRetry={() => void fetchNotifications()}
      onNavigate={onNavigate}
      onClose={() => setOpen(false)}
    />
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Drawer
          open={open}
          onClose={() => setOpen(false)}
          placement="right"
          size="100%"
          closable={false}
          destroyOnHidden
          styles={{
            body: {
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            },
          }}
        >
          {renderContent('drawer')}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      content={renderContent('popover')}
      trigger="click"
      open={open}
      onOpenChange={handleOpenChange}
      placement="bottomRight"
      styles={{ container: { padding: 0 } }}
      arrow={{ pointAtCenter: true }}
    >
      {triggerButton}
    </Popover>
  );
};
