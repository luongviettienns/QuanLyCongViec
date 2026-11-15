import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Space } from 'antd';
import { HomeOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import {
  ErrorInlineAlert,
  ErrorNavigationButtons,
  ErrorPageLayout,
  ErrorTechnicalDetails,
} from './ErrorPageLayout';
import { classifyRuntimeError } from './error-pages.utils.ts';

export type ErrorBoundaryVariant = 'fullscreen' | 'page' | 'inline';

export interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
  fallbackTitle?: string;
  fallbackSubTitle?: string;
  variant?: ErrorBoundaryVariant;
  showHomeAction?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public handleReload = () => {
    window.location.reload();
  };

  public handleGoDashboard = () => {
    window.location.assign('/dashboard');
  };

  public override render() {
    if (this.state.hasError) {
      const variant = this.props.variant ?? 'fullscreen';
      const showHomeAction = this.props.showHomeAction ?? variant !== 'inline';
      const display = classifyRuntimeError(this.state.error, {
        fallbackTitle: this.props.fallbackTitle,
        fallbackSubTitle: this.props.fallbackSubTitle,
      });
      const isChunkError = display.category === 'chunk';

      if (variant === 'inline') {
        const retryButton = (
          <Button
            size="small"
            type="primary"
            icon={<SyncOutlined />}
            onClick={this.handleReset}
          >
            Thử lại
          </Button>
        );

        return (
          <ErrorInlineAlert
            status={display.status}
            category={display.category}
            title={display.title}
            subTitle={display.subTitle}
            technicalDetail={display.technicalDetail}
            actions={
              <ErrorNavigationButtons
                size="small"
                primaryAction="none"
                showDashboard={showHomeAction}
                leadingActions={retryButton}
              />
            }
          />
        );
      }

      const leadingActions = (
        <>
          <Button
            type={isChunkError ? 'default' : 'primary'}
            icon={<SyncOutlined />}
            onClick={this.handleReset}
          >
            Thử lại
          </Button>
          <Button
            type={isChunkError ? 'primary' : 'default'}
            icon={<ReloadOutlined />}
            onClick={this.handleReload}
          >
            Tải lại ứng dụng
          </Button>
        </>
      );

      return (
        <ErrorPageLayout
          fullScreen={variant === 'fullscreen'}
          status={display.status}
          category={display.category}
          title={display.title}
          subTitle={display.subTitle}
          extra={
            variant === 'fullscreen' ? (
              <Space wrap size="small" style={{ justifyContent: 'center' }}>
                {leadingActions}
                {showHomeAction && (
                  <Button icon={<HomeOutlined />} onClick={this.handleGoDashboard}>
                    Về Dashboard
                  </Button>
                )}
              </Space>
            ) : (
              <ErrorNavigationButtons
                primaryAction="none"
                showDashboard={showHomeAction}
                leadingActions={leadingActions}
              />
            )
          }
        >
          <ErrorTechnicalDetails
            detail={display.technicalDetail ?? 'Không có thông tin kỹ thuật bổ sung.'}
          />
        </ErrorPageLayout>
      );
    }

    return this.props.children;
  }
}
