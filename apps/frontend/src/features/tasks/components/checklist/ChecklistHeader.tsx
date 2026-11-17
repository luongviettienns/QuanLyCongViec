import { Progress, Space, Tag, Typography } from 'antd';
import {
  CheckOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ChecklistProgress, ChecklistSaveState } from '../../utils/checklist.utils';

const { Text } = Typography;

export interface ChecklistHeaderProps {
  progress: ChecklistProgress;
  saveState: ChecklistSaveState;
  saveErrorMessage?: string | null;
  compact?: boolean;
}

export function ChecklistHeader({
  progress,
  saveState,
  saveErrorMessage,
  compact = false,
}: ChecklistHeaderProps) {
  const isAllDone = progress.total > 0 && progress.done === progress.total;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <Space size={8} align="center">
          <Text strong style={{ fontSize: compact ? 13 : 14, color: '#1f1f1f' }}>
            Checklist
          </Text>
          {progress.total > 0 && (
            <Tag
              color={isAllDone ? 'success' : 'default'}
              style={{
                margin: 0,
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                lineHeight: '18px',
                padding: '0 7px',
              }}
            >
              {progress.done}/{progress.total}
            </Tag>
          )}
        </Space>

        <div aria-live="polite" style={{ minHeight: 18, display: 'flex', alignItems: 'center' }}>
          {saveState === 'saving' && (
            <Space size={4}>
              <LoadingOutlined style={{ fontSize: 12, color: '#1677ff' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đang lưu...
              </Text>
            </Space>
          )}
          {saveState === 'saved' && (
            <Space size={4}>
              <CheckOutlined style={{ fontSize: 12, color: '#52c41a' }} />
              <Text style={{ fontSize: 12, color: '#52c41a' }}>Đã lưu</Text>
            </Space>
          )}
          {saveState === 'error' && (
            <Space size={4}>
              <ExclamationCircleOutlined style={{ fontSize: 12, color: '#ff4d4f' }} />
              <Text type="danger" style={{ fontSize: 12 }}>
                {saveErrorMessage || 'Lưu thất bại'}
              </Text>
            </Space>
          )}
        </div>
      </div>

      {progress.total > 0 && (
        <Progress
          percent={progress.percent}
          size={['100%', 4]}
          showInfo={false}
          strokeColor={isAllDone ? '#52c41a' : '#1677ff'}
          railColor="#f0f0f0"
          style={{ margin: 0, lineHeight: 1 }}
        />
      )}
    </div>
  );
}
