import { ErrorNavigationButtons, ErrorPageLayout } from './ErrorPageLayout';
import { classifyRuntimeError } from './error-pages.utils.ts';

export interface ForbiddenPageProps {
  fullScreen?: boolean;
}

export default function ForbiddenPage({ fullScreen = false }: ForbiddenPageProps) {
  const display = classifyRuntimeError({ status: 403 });

  return (
    <ErrorPageLayout
      fullScreen={fullScreen}
      status={display.status}
      title={display.title}
      subTitle={display.subTitle}
      extra={
        <ErrorNavigationButtons
          primaryAction="dashboard"
          showDashboard
          showTasks
          showBack
        />
      }
    />
  );
}
