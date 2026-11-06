import { useState, type ReactNode } from 'react';
import {
  Layout,
  Menu,
  Button,
  Space,
  Avatar,
  Typography,
  Dropdown,
  Drawer,
  Grid,
  type MenuProps,
} from 'antd';
import {
  CheckSquareOutlined,
  DashboardOutlined,
  ReloadOutlined,
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  LoginOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../features/auth/hooks/useAuth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: ReactNode;
  onReload: () => void;
  onCreateTask: () => void;
  onOpenCategories?: () => void;
  onOpenAuth?: () => void;
  loading?: boolean;
  currentNav?: 'dashboard' | 'tasks' | 'teams' | 'categories';
  onNavChange?: (key: 'dashboard' | 'tasks' | 'teams' | 'categories') => void;
}

export default function AppLayout({
  children,
  onReload,
  onCreateTask,
  onOpenAuth,
  loading = false,
  currentNav = 'tasks',
  onNavChange,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const { user, logout } = useAuth();

  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: 'Tổng quan',
    },
    {
      key: 'tasks',
      icon: <CheckSquareOutlined />,
      label: 'Công việc',
    },
    {
      key: 'teams',
      icon: <TeamOutlined />,
      label: 'Nhóm làm việc',
    },
    {
      key: 'categories',
      icon: <TagsOutlined />,
      label: 'Danh mục',
    },
  ];

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'user-info',
      disabled: true,
      label: (
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 600, color: '#1f1f1f' }}>{user?.name || 'Tài khoản'}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{user?.email}</div>
        </div>
      ),
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      danger: true,
      label: 'Đăng xuất',
      onClick: () => {
        logout();
      },
    },
  ];

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: !isMobile && collapsed ? 'center' : 'flex-start',
          padding: !isMobile && collapsed ? '0' : '0 20px',
          borderBottom: '1px solid #f0f0f0',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: '#1677ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          T
        </div>
        {(isMobile || !collapsed) && (
          <span style={{ fontWeight: 700, fontSize: 17, color: '#1677ff', letterSpacing: -0.3 }}>
            TaskFlow
          </span>
        )}
      </div>

      <div style={{ flex: 1, padding: '12px 0' }}>
        <Menu
          mode="inline"
          selectedKeys={[currentNav]}
          items={menuItems}
          onClick={({ key }) => {
            if (isMobile) {
              setDrawerOpen(false);
            }
            if (key === 'dashboard' || key === 'tasks' || key === 'teams' || key === 'categories') {
              onNavChange?.(key);
            }
          }}
          style={{ borderRight: 0 }}
        />
      </div>

      <div
        style={{
          padding: !isMobile && collapsed ? '16px 8px' : '16px 20px',
          borderTop: '1px solid #f0f0f0',
          textAlign: !isMobile && collapsed ? 'center' : 'left',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          {!isMobile && collapsed ? 'v1.0' : 'TaskFlow v1.0.0'}
        </Text>
      </div>
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          trigger={null}
          collapsible
          collapsed={collapsed}
          theme="light"
          width={220}
          style={{
            borderRight: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            height: '100vh',
            zIndex: 100,
          }}
        >
          {sidebarContent}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={260}
          styles={{ body: { padding: 0 } }}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            height: 64,
            padding: screens.md ? '0 24px' : '0 12px',
            background: '#ffffff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 99,
          }}
        >
          <Space size={screens.sm ? 'middle' : 'small'} align="center">
            <Button
              type="text"
              icon={
                isMobile ? (
                  <MenuUnfoldOutlined />
                ) : collapsed ? (
                  <MenuUnfoldOutlined />
                ) : (
                  <MenuFoldOutlined />
                )
              }
              onClick={() => {
                if (isMobile) {
                  setDrawerOpen(true);
                } else {
                  setCollapsed(!collapsed);
                }
              }}
              style={{ fontSize: 16 }}
            />
            {screens.sm && (
              <span style={{ fontWeight: 600, fontSize: 16, color: '#1f1f1f' }}>
                {currentNav === 'categories'
                  ? 'Quản lý danh mục'
                  : currentNav === 'teams'
                    ? 'Nhóm làm việc'
                    : currentNav === 'dashboard'
                      ? 'Tổng quan hệ thống'
                      : 'Không gian làm việc'}
              </span>
            )}
          </Space>

          <Space size={screens.sm ? 'middle' : 'small'} align="center">
            <Button
              icon={<ReloadOutlined />}
              onClick={onReload}
              loading={loading}
              aria-label="Tải lại"
            >
              {screens.sm ? 'Tải lại' : undefined}
            </Button>

            {currentNav === 'tasks' && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={onCreateTask}
                aria-label="Thêm công việc"
              >
                {screens.sm ? 'Thêm công việc' : undefined}
              </Button>
            )}

            {user ? (
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <Avatar style={{ backgroundColor: '#1677ff' }}>
                    {user.name
                      ? user.name.charAt(0).toUpperCase()
                      : user.email.charAt(0).toUpperCase()}
                  </Avatar>
                  {screens.sm && (
                    <Text strong style={{ maxWidth: 140, margin: 0, lineHeight: '32px' }} ellipsis>
                      {user.name || user.email}
                    </Text>
                  )}
                </div>
              </Dropdown>
            ) : (
              <Button icon={<LoginOutlined />} onClick={onOpenAuth}>
                {screens.sm ? 'Đăng nhập' : undefined}
              </Button>
            )}
          </Space>
        </Header>

        <Content
          style={{
            background: '#f5f7fa',
            padding: screens.md ? 24 : '16px 12px',
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
        </Content>
      </Layout>

      {isMobile && currentNav === 'tasks' && (
        <Button
          type="primary"
          shape="circle"
          icon={<PlusOutlined style={{ fontSize: 20 }} />}
          onClick={onCreateTask}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 20,
            width: 52,
            height: 52,
            boxShadow: '0 4px 16px rgba(22, 119, 255, 0.45)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Thêm công việc"
        />
      )}
    </Layout>
  );
}
