import { Tag, Typography } from 'antd';
import { CompassOutlined } from '@ant-design/icons';
import { useInRouterContext, useLocation } from 'react-router-dom';
import { ErrorNavigationButtons, ErrorPageLayout } from './ErrorPageLayout';
import { classifyRuntimeError } from './error-pages.utils.ts';

const { Text } = Typography;

export interface NotFoundPageProps {
  fullScreen?: boolean;
}

function UnrecognizedPathBadge() {
  const location = useLocation();
  const fullPath = `${location.pathname}${location.search}`;

  if (!location.pathname || location.pathname === '/404') {
    return null;
  }

  return (
    <Tag
      icon={<CompassOutlined />}
      color="default"
      style={{
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        padding: '4px 10px',
        borderRadius: 999,
      }}
    >
      Đường dẫn: <Text code>{fullPath}</Text>
    </Tag>
  );
}

export default function NotFoundPage({ fullScreen = false }: NotFoundPageProps) {
  const inRouter = useInRouterContext();
  const display = classifyRuntimeError({ status: 404 });

  return (
    <ErrorPageLayout
      fullScreen={fullScreen}
      status={display.status}
      title={display.title}
      subTitle={display.subTitle}
      badge={inRouter ? <UnrecognizedPathBadge /> : null}
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
