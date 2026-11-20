import React, { useState } from 'react';
import { Button, Input, Select, Tooltip } from 'antd';
import { PlusOutlined, CalendarOutlined } from '@ant-design/icons';
import type { TaskPriority } from '../../types/task.types';
import { getVietnamTodayKey } from '../../utils/my-tasks.utils';

export interface MyTasksQuickAddProps {
  loading: boolean;
  onQuickCreate: (input: {
    title: string;
    dueDate?: string | null;
    priority?: TaskPriority;
  }) => Promise<boolean>;
}

export const MyTasksQuickAdd: React.FC<MyTasksQuickAddProps> = ({
  loading,
  onQuickCreate,
}) => {
  const [title, setTitle] = useState('');
  const [dueToday, setDueToday] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    if (trimmed.length < 3) {
      setValidationError('Tiêu đề cần ít nhất 3 ký tự');
      return;
    }
    setValidationError(null);
    const ok = await onQuickCreate({
      title: trimmed,
      dueDate: dueToday ? getVietnamTodayKey() : null,
      priority,
    });
    if (ok) {
      setTitle('');
      setDueToday(false);
      setPriority('MEDIUM');
    }
  };

  return (
    <div className="my-tasks-quick-add">
      <Input
        size="large"
        prefix={<PlusOutlined style={{ color: '#8c8c8c' }} />}
        placeholder="Tạo nhanh công việc cá nhân... (nhấn Enter để lưu)"
        value={title}
        disabled={loading}
        maxLength={100}
        status={validationError ? 'error' : undefined}
        onChange={(e) => {
          setTitle(e.target.value);
          if (validationError && e.target.value.trim().length >= 3) {
            setValidationError(null);
          }
        }}
        onPressEnter={() => void handleSubmit()}
        style={{ flex: 1, minWidth: 200 }}
        aria-label="Tạo nhanh công việc cá nhân"
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <Tooltip title={dueToday ? 'Đặt hạn chót: Hôm nay (bấm để bỏ)' : 'Đặt nhanh hạn chót hôm nay'}>
          <Button
            size="large"
            type={dueToday ? 'primary' : 'default'}
            ghost={dueToday}
            icon={<CalendarOutlined />}
            disabled={loading}
            onClick={() => setDueToday((prev) => !prev)}
          >
            Hôm nay
          </Button>
        </Tooltip>

        <Select<TaskPriority>
          size="large"
          value={priority}
          disabled={loading}
          onChange={setPriority}
          style={{ width: 128 }}
          aria-label="Độ ưu tiên khi tạo nhanh"
          options={[
            { value: 'HIGH', label: 'Cao' },
            { value: 'MEDIUM', label: 'Trung bình' },
            { value: 'LOW', label: 'Thấp' },
          ]}
        />

        <Button
          size="large"
          type="primary"
          loading={loading}
          disabled={title.trim().length === 0}
          onClick={() => void handleSubmit()}
        >
          Thêm
        </Button>
      </div>

      {validationError && (
        <div style={{ width: '100%', fontSize: 12, color: '#ff4d4f' }}>
          {validationError}
        </div>
      )}
    </div>
  );
};
