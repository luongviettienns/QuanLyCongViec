import { useState, type ReactNode } from 'react';
import { Layout, Menu, Button, Space, Avatar, Typography } from 'antd';
import {
  CheckSquareOutlined,
  ReloadOutlined,
  PlusOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface AppLayoutProps {
  children: ReactNode;
  onReload: () => void;
  onCreateTask: () => void;
  loading?: boolean;
}

export default function AppLayout({
  children,
  onReload,
  onCreateTask,
  loading = false,
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      key: 'tasks',
      icon: <CheckSquareOutlined />,
      label: 'Công việc',
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
            <Button
              icon={<ReloadOutlined />}
              onClick={onReload}
              loading={loading}
            >
              Tải lại
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreateTask}
            >
              Thêm công việc
            </Button>
            <Avatar
              style={{ backgroundColor: '#1677ff', verticalAlign: 'middle' }}
              icon={<UserOutlined />}
            />
          </Space>
        </Header>

        <Content
          style={{
            background: '#f5f7fa',
            padding: 24,
            minHeight: 'calc(100vh - 64px)',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
