import { Avatar, Button, Space } from 'antd';
import type { ChecklistAssigneeOption } from '../../utils/checklist.utils';

export interface ChecklistAssigneeMenuProps {
  selectedAssigneeId: number | null | undefined;
  eligibleAssignees: ChecklistAssigneeOption[];
  onSelect: (assigneeId: number | null) => void;
}

export function ChecklistAssigneeMenu({
  selectedAssigneeId,
  eligibleAssignees,
  onSelect,
}: ChecklistAssigneeMenuProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 190 }}>
      <Button
        type="text"
        size="small"
        style={{ justifyContent: 'flex-start' }}
        disabled={!selectedAssigneeId}
        onClick={() => onSelect(null)}
      >
        Chưa phân công
      </Button>
      {eligibleAssignees.map((opt) => {
        const isSelected = selectedAssigneeId === opt.value;
        return (
          <Button
            key={opt.value}
            type={isSelected ? 'primary' : 'text'}
            ghost={isSelected}
            size="small"
            style={{ justifyContent: 'flex-start' }}
            onClick={() => onSelect(opt.value)}
          >
            <Space size={6}>
              <Avatar size={18} style={{ backgroundColor: '#1677ff', fontSize: 10 }}>
                {opt.name.charAt(0).toUpperCase()}
              </Avatar>
              <span>{opt.name}</span>
            </Space>
          </Button>
        );
      })}
    </div>
  );
}
