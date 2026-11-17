import { useState, useRef } from 'react';
import { Avatar, Button, Input, Popover, Tooltip, Typography, type InputRef } from 'antd';
import { PlusOutlined, UserAddOutlined } from '@ant-design/icons';
import {
  validateChecklistTitle,
  type ChecklistAssigneeOption,
} from '../../utils/checklist.utils';
import { ChecklistAssigneeMenu } from './ChecklistAssigneeMenu';

const { Text } = Typography;

export interface ChecklistAddInputProps {
  compact?: boolean;
  adding: boolean;
  eligibleAssignees: ChecklistAssigneeOption[];
  onAdd: (title: string, assigneeId: number | null) => Promise<boolean>;
}

export function ChecklistAddInput({
  compact = false,
  adding,
  eligibleAssignees,
  onAdd,
}: ChecklistAddInputProps) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const inputRef = useRef<InputRef | null>(null);

  const selectedAssignee = assigneeId
    ? eligibleAssignees.find((opt) => opt.value === assigneeId)
    : undefined;

  const handleSubmit = async () => {
    if (adding) return;
    const validation = validateChecklistTitle(title);
    if (!validation.valid) {
      if (title.trim().length > 0) {
        setErrorText(validation.errorMessage);
      } else {
        setErrorText('Vui lòng nhập tiêu đề đầu việc');
      }
      return;
    }

    setErrorText(null);
    const created = await onAdd(validation.title, assigneeId);
    if (created) {
      setTitle('');
      setAssigneeId(null);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: compact ? '3px 6px' : '4px 8px',
          borderRadius: 6,
          border: `1px dashed ${errorText ? '#ff4d4f' : '#d9d9d9'}`,
          backgroundColor: '#fafafa',
        }}
      >
        <PlusOutlined style={{ color: '#8c8c8c', fontSize: 12, flexShrink: 0 }} />
        <Input
          ref={inputRef}
          variant="borderless"
          size={compact ? 'small' : 'middle'}
          placeholder="Thêm đầu việc..."
          value={title}
          maxLength={255}
          disabled={adding}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errorText) setErrorText(null);
          }}
          onPressEnter={() => void handleSubmit()}
          style={{ padding: '2px 0', flex: 1, fontSize: compact ? 13 : 13.5 }}
        />

        {eligibleAssignees.length > 0 && (
          <Popover
            open={assigneePopoverOpen}
            onOpenChange={setAssigneePopoverOpen}
            trigger="click"
            placement="topRight"
            content={
              <ChecklistAssigneeMenu
                selectedAssigneeId={assigneeId}
                eligibleAssignees={eligibleAssignees}
                onSelect={(nextAssigneeId) => {
                  setAssigneeId(nextAssigneeId);
                  setAssigneePopoverOpen(false);
                }}
              />
            }
          >
            <Tooltip
              title={
                selectedAssignee
                  ? `Giao cho: ${selectedAssignee.name}`
                  : 'Chọn người thực hiện (tùy chọn)'
              }
            >
              <Button
                type="text"
                size="small"
                aria-label="Chọn người thực hiện đầu việc mới"
                style={{ padding: '0 4px', height: 24, display: 'inline-flex', alignItems: 'center' }}
              >
                {selectedAssignee ? (
                  <Avatar size={20} style={{ backgroundColor: '#722ed1', fontSize: 11 }}>
                    {selectedAssignee.name.charAt(0).toUpperCase()}
                  </Avatar>
                ) : (
                  <UserAddOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />
                )}
              </Button>
            </Tooltip>
          </Popover>
        )}

        {(title.trim().length > 0 || adding) && (
          <Button
            type="primary"
            size="small"
            loading={adding}
            onClick={() => void handleSubmit()}
          >
            {compact ? <PlusOutlined /> : 'Thêm'}
          </Button>
        )}
      </div>

      {errorText && (
        <Text type="danger" style={{ fontSize: 11, paddingLeft: 4 }}>
          {errorText}
        </Text>
      )}
    </div>
  );
}
