import type { ReactNode } from 'react';
import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  ErrorInlineAlert,
  ErrorNavigationButtons,
  ErrorPageLayout,
  ErrorTechnicalDetails,
} from './ErrorPageLayout';
import { getApiErrorDisplay } from './error-pages.utils.ts';

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
  const canRetry = Boolean(onRetry && display.isRetryable);

  const retryButton = canRetry ? (
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
    return (
      <ErrorInlineAlert
        status={display.status}
        category={display.category}
        title={resolvedTitle}
        subTitle={resolvedSubTitle}
        actions={actions}
        technicalDetail={display.technicalDetail}
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
