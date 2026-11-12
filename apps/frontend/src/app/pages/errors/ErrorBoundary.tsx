import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  public handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backgroundColor: '#f5f7fa',
          }}
        >
          <Result
            status="500"
            title="Đã có lỗi xảy ra"
            subTitle={
              this.state.error?.message ||
              'Đã xảy ra sự cố không mong muốn trong quá trình kết xuất giao diện.'
            }
            extra={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleReload}
              >
                Tải lại ứng dụng
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
