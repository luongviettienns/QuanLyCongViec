import { ErrorNavigationButtons, ErrorPageLayout } from './ErrorPageLayout';
import { classifyRuntimeError } from './error-pages.utils.ts';

export default function ForbiddenPage() {
  const display = classifyRuntimeError({ status: 403 });

  return (
    <ErrorPageLayout
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
