import type { ReactNode } from 'react';
import { Alert, Button, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  ErrorCategoryIcon,
  ErrorNavigationButtons,
  ErrorPageLayout,
  ErrorTechnicalDetails,
} from './ErrorPageLayout';
import { getApiErrorDisplay, hasCustomCategoryIcon } from './error-pages.utils.ts';

const { Text } = Typography;

export type ApiErrorFallbackVariant = 'page' | 'inline';

export interface ApiErrorFallbackProps {
  error?: unknown;
  title?: string;
  subTitle?: string;
  onRetry?: () => void;
  retrying?: boolean;
  variant?: ApiErrorFallbackVariant;
  showNavigation?: boolean;
  extraActions?: ReactNode;
}

export function ApiErrorFallback({
  error,
  title,
  subTitle,
  onRetry,
  retrying = false,
  variant = 'page',
  showNavigation,
  extraActions,
}: ApiErrorFallbackProps) {
  const display = getApiErrorDisplay(error);
  const resolvedTitle = title ?? display.title;
  const resolvedSubTitle = subTitle ?? display.subTitle;
  const shouldShowNavigation = showNavigation ?? variant === 'page';

  const retryButton = onRetry ? (
    <Button
      type="primary"
      size={variant === 'inline' ? 'small' : 'middle'}
      icon={<ReloadOutlined />}
      loading={retrying}
      onClick={onRetry}
    >
      Thử lại
    </Button>
  ) : null;

  const actions =
    retryButton || shouldShowNavigation || extraActions ? (
      <ErrorNavigationButtons
        size={variant === 'inline' ? 'small' : 'middle'}
        primaryAction={retryButton ? 'none' : 'dashboard'}
        showDashboard={shouldShowNavigation}
        showTasks={shouldShowNavigation}
        showLogin={shouldShowNavigation && display.category === 'unauthorized'}
        leadingActions={retryButton}
        trailingActions={extraActions}
      />
    ) : null;

  if (variant === 'inline') {
    const alertType = display.status === 'warning' ? 'warning' : 'error';

    return (
      <Alert
        type={alertType}
        showIcon
        icon={
          hasCustomCategoryIcon(display.category) ? (
            <ErrorCategoryIcon category={display.category} />
          ) : undefined
        }
        title={resolvedTitle}
        style={{ borderRadius: 10 }}
        description={
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              {resolvedSubTitle}
            </Text>
            {actions}
            <ErrorTechnicalDetails compact detail={display.technicalDetail} />
          </Space>
        }
      />
    );
  }

  return (
    <ErrorPageLayout
      status={display.status}
      category={display.category}
      title={resolvedTitle}
      subTitle={resolvedSubTitle}
      extra={actions}
    >
      <ErrorTechnicalDetails detail={display.technicalDetail} />
    </ErrorPageLayout>
  );
}

export default ApiErrorFallback;
