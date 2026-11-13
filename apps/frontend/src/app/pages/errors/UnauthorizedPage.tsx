import { ErrorNavigationButtons, ErrorPageLayout } from './ErrorPageLayout';
import { classifyRuntimeError } from './error-pages.utils.ts';

export interface UnauthorizedPageProps {
  fullScreen?: boolean;
}

export default function UnauthorizedPage({ fullScreen = true }: UnauthorizedPageProps) {
  const display = classifyRuntimeError({ status: 401 });

  return (
    <ErrorPageLayout
      fullScreen={fullScreen}
      status={display.status}
      category={display.category}
      title={display.title}
      subTitle={display.subTitle}
      extra={
        <ErrorNavigationButtons
          primaryAction="login"
          showLogin
          showDashboard
          dashboardLabel="Về trang chủ"
        />
      }
    />
  );
}
