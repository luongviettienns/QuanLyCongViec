import { CheckSquareOutlined } from '@ant-design/icons';
import type { Subtask } from '../../types/task.types';
import { getChecklistProgress } from '../../utils/checklist.utils';

export interface ChecklistProgressBadgeProps {
  subtasks?: ReadonlyArray<Pick<Subtask, 'status'>> | null;
}

export function ChecklistProgressBadge({ subtasks }: ChecklistProgressBadgeProps) {
  const progress = getChecklistProgress(subtasks);
  if (progress.total === 0) {
    return null;
  }

  const isAllDone = progress.done === progress.total;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        color: isAllDone ? '#52c41a' : '#595959',
        fontWeight: isAllDone ? 600 : 400,
        lineHeight: 1.4,
      }}
      title={`Checklist: ${progress.done}/${progress.total} hoàn thành`}
    >
      <CheckSquareOutlined />
      <span>
        {progress.done}/{progress.total}
      </span>
    </span>
  );
}
