import type { ReactNode } from 'react';
import { Button, Card, Collapse, Result, Space, Typography, type ResultProps } from 'antd';
import {
  ArrowLeftOutlined,
  BugOutlined,
  CheckSquareOutlined,
  CloudSyncOutlined,
  CodeOutlined,
  DisconnectOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  LockOutlined,
  LoginOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { useResponsive } from '../../../shared/hooks';
import { hasCustomCategoryIcon, type ErrorCategory } from './error-pages.utils.ts';

const { Text } = Typography;

export type ErrorNavigationTarget = '/dashboard' | '/tasks' | '/login' | -1;

export interface ErrorPageLayoutProps {
  status: NonNullable<ResultProps['status']>;
  title: ReactNode;
  subTitle?: ReactNode;
  category?: ErrorCategory;
  icon?: ReactNode;
  extra?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  fullScreen?: boolean;
  maxWidth?: number;
}

export function ErrorPageLayout({
  status,
  title,
  subTitle,
  category,
  icon,
  extra,
  badge,
  children,
  fullScreen = false,
  maxWidth = 580,
}: ErrorPageLayoutProps) {
  const screens = useResponsive();
  const resolvedIcon =
    icon !== undefined
      ? icon
      : category && hasCustomCategoryIcon(category)
        ? <ErrorCategoryIcon category={category} />
        : undefined;

  return (
    <div
      style={{
        minHeight: fullScreen ? '100vh' : '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: screens.sm ? 24 : '16px 12px',
        backgroundColor: fullScreen ? '#f5f7fa' : 'transparent',
      }}
    >
      <Card
        variant="outlined"
        style={{
          width: '100%',
          maxWidth,
          borderRadius: 12,
          borderColor: '#f0f0f0',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
        }}
        styles={{
          body: {
            padding: screens.sm ? '32px 28px' : '24px 16px',
          },
        }}
      >
        {badge && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            {badge}
          </div>
        )}

        <Result
          status={status}
          icon={resolvedIcon}
          title={title}
          subTitle={subTitle}
          extra={extra}
          styles={{
            root: { padding: 0 },
            title: { fontWeight: 600 },
            subTitle: { fontSize: 14, lineHeight: 1.6 },
          }}
        />

        {children && <div style={{ marginTop: 20 }}>{children}</div>}
      </Card>
    </div>
  );
}

export interface ErrorCategoryIconProps {
  category: ErrorCategory;
}

export function ErrorCategoryIcon({ category }: ErrorCategoryIconProps) {
  switch (category) {
    case 'offline':
      return <WifiOutlined style={{ color: '#faad14' }} />;
    case 'network':
      return <DisconnectOutlined style={{ color: '#ff4d4f' }} />;
    case 'chunk':
      return <CloudSyncOutlined style={{ color: '#faad14' }} />;
    case 'unauthorized':
      return <LockOutlined style={{ color: '#faad14' }} />;
    case 'unexpected':
      return <BugOutlined style={{ color: '#ff4d4f' }} />;
    default:
      return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />;
  }
}

export interface ErrorTechnicalDetailsProps {
  detail?: string;
  compact?: boolean;
}

export function ErrorTechnicalDetails({ detail, compact = false }: ErrorTechnicalDetailsProps) {
  if (!detail) {
    return null;
  }

  return (
    <Collapse
      size="small"
      ghost={compact}
      defaultActiveKey={[]}
      style={{
        backgroundColor: compact ? 'rgba(255, 255, 255, 0.7)' : '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
        textAlign: 'left',
      }}
      items={[
        {
          key: 'technical-detail',
          label: (
            <Space size={6}>
              <CodeOutlined style={{ color: '#8c8c8c' }} />
              <Text type="secondary" style={{ fontSize: 13 }}>
                Chi tiết kỹ thuật
              </Text>
            </Space>
          ),
          children: (
            <pre
              style={{
                margin: 0,
                padding: compact ? 8 : 12,
                borderRadius: 6,
                backgroundColor: '#f5f7fa',
                border: '1px solid #e5e7eb',
                fontSize: 12,
                lineHeight: 1.5,
                color: '#475569',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: compact ? 140 : 220,
                overflowY: 'auto',
                textAlign: 'left',
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
              }}
            >
              {detail}
            </pre>
          ),
        },
      ]}
    />
  );
}

export interface ErrorNavigationButtonsProps {
  primaryAction?: 'dashboard' | 'login' | 'none';
  showDashboard?: boolean;
  showTasks?: boolean;
  showBack?: boolean;
  showLogin?: boolean;
  dashboardLabel?: string;
  tasksLabel?: string;
  loginLabel?: string;
  backLabel?: string;
  size?: 'small' | 'middle' | 'large';
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
}

interface ActionButtonListProps extends ErrorNavigationButtonsProps {
  onNavigate: (target: ErrorNavigationTarget) => void;
}

function ActionButtonList({
  primaryAction = 'dashboard',
  showDashboard = true,
  showTasks = false,
  showBack = false,
  showLogin = false,
  dashboardLabel = 'Về Dashboard',
  tasksLabel = 'Đến Công việc',
  loginLabel = 'Đăng nhập lại',
  backLabel = 'Quay lại',
  size = 'middle',
  leadingActions,
  trailingActions,
  onNavigate,
}: ActionButtonListProps) {
  return (
    <Space wrap size="small" style={{ justifyContent: 'center' }}>
      {leadingActions}

      {showLogin && (
        <Button
          size={size}
          type={primaryAction === 'login' ? 'primary' : 'default'}
          icon={<LoginOutlined />}
          onClick={() => onNavigate('/login')}
        >
          {loginLabel}
        </Button>
      )}

      {showDashboard && (
        <Button
          size={size}
          type={primaryAction === 'dashboard' ? 'primary' : 'default'}
          icon={<HomeOutlined />}
          onClick={() => onNavigate('/dashboard')}
        >
          {dashboardLabel}
        </Button>
      )}

      {showTasks && (
        <Button
          size={size}
          icon={<CheckSquareOutlined />}
          onClick={() => onNavigate('/tasks')}
        >
          {tasksLabel}
        </Button>
      )}

      {showBack && (
        <Button
          size={size}
          icon={<ArrowLeftOutlined />}
          onClick={() => onNavigate(-1)}
        >
          {backLabel}
        </Button>
      )}

      {trailingActions}
    </Space>
  );
}

function RouterBoundActionButtons(props: ErrorNavigationButtonsProps) {
  const navigate = useNavigate();

  const handleNavigate = (target: ErrorNavigationTarget) => {
    if (typeof target === 'number') {
      void navigate(target);
      return;
    }
    void navigate(target);
  };

  return <ActionButtonList {...props} onNavigate={handleNavigate} />;
}

function WindowBoundActionButtons(props: ErrorNavigationButtonsProps) {
  const handleNavigate = (target: ErrorNavigationTarget) => {
    if (typeof target === 'number') {
      window.history.back();
      return;
    }
    window.location.assign(target);
  };

  return <ActionButtonList {...props} onNavigate={handleNavigate} />;
}

export function ErrorNavigationButtons(props: ErrorNavigationButtonsProps) {
  const inRouter = useInRouterContext();
  return inRouter ? (
    <RouterBoundActionButtons {...props} />
  ) : (
    <WindowBoundActionButtons {...props} />
  );
}
