import { useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Space, Avatar, Typography, Dropdown, type MenuProps } from 'antd';
import {
  CheckSquareOutlined,
  ReloadOutlined,
  PlusOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  LogoutOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: ReactNode;
  onReload: () => void;
  onCreateTask: () => void;
  onOpenAuth: () => void;
  loading?: boolean;
}

export default function AppLayout({
  children,
  onReload,
  onCreateTask,
  onOpenAuth,
  loading = false,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();

  const menuItems = [
    {
      key: 'tasks',
      icon: <CheckSquareOutlined />,
      label: 'Công việc',
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
        onReload();
      },
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
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
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '0' : '0 20px',
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
          {!collapsed && (
            <span style={{ fontWeight: 700, fontSize: 17, color: '#1677ff', letterSpacing: -0.3 }}>
              TaskFlow
            </span>
          )}
        </div>

        <div style={{ flex: 1, padding: '12px 0' }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['tasks']}
            selectedKeys={['tasks']}
            items={menuItems}
            style={{ borderRight: 0 }}
          />
        </div>

        <div
          style={{
            padding: collapsed ? '16px 8px' : '16px 20px',
            borderTop: '1px solid #f0f0f0',
            textAlign: collapsed ? 'center' : 'left',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            {collapsed ? 'v1.0' : 'TaskFlow v1.0.0'}
          </Text>
        </div>
      </Sider>

      <Layout>
        <Header
          style={{
            height: 64,
            padding: '0 24px',
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
          <Space size="middle">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <span style={{ fontWeight: 600, fontSize: 16, color: '#1f1f1f' }}>
              Không gian làm việc
            </span>
          </Space>

          <Space size="middle">
            <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>
              Tải lại
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateTask}>
              Thêm công việc
            </Button>

            {user ? (
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar style={{ backgroundColor: '#1677ff' }}>
                    {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
                  </Avatar>
                  <Text strong style={{ maxWidth: 140 }} ellipsis>
                    {user.name || user.email}
                  </Text>
                </Space>
              </Dropdown>
            ) : (
              <Button icon={<LoginOutlined />} onClick={onOpenAuth}>
                Đăng nhập
              </Button>
            )}
          </Space>
        </Header>

        <Content
          style={{
            background: '#f5f7fa',
            padding: 24,
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
