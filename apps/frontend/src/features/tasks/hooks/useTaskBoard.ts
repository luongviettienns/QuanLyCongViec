import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { message } from 'antd';
import type { Task, TaskStatus } from '../types/task.types';
import type { Team } from '../../teams/types/team.types';
import type { User } from '../../auth/types/auth.types';
import { updateTaskStatus, reorderTasks } from '../api/tasks.api';
import { UnauthorizedError } from '../../../shared/api';
import { canTransitionTask, canReorderTask } from '../utils/task-permission.utils';

export function useTaskBoard(
  isAuthenticated: boolean,
  tasks: Task[],
  setTasks: Dispatch<SetStateAction<Task[]>>,
  user?: User | null,
  teams?: Team[],
  onSynced?: () => void,
) {
  const handleStatusMove = useCallback(
    async (taskId: number, newStatus: TaskStatus, newPosition?: number) => {
      if (!isAuthenticated) {
        return;
      }
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) {
        return;
      }

      const taskTeam = targetTask.teamId && teams ? teams.find((t) => t.id === targetTask.teamId) : null;
      if (!canTransitionTask(user, targetTask, newStatus, taskTeam)) {
        if (targetTask.status === 'TODO' && newStatus === 'DONE') {
          message.warning('Người thực hiện cần chuyển qua "Đang làm" trước khi Hoàn thành.');
        } else if (targetTask.status === 'DONE') {
          message.warning('Chỉ người tạo hoặc quản trị viên mới có thể mở lại công việc đã hoàn thành.');
        } else {
          message.warning('Bạn không có quyền thay đổi trạng thái công việc này.');
        }
        return;
      }

      // Check reorder privilege: Only users with reorder permission may specify position
      const canReorder = canReorderTask(user, targetTask, taskTeam);
      const positionToSend = canReorder ? newPosition : undefined;

      const previousTasks = [...tasks];

      setTasks((prev) => {
        const remaining = prev.filter((t) => t.id !== taskId);

        // 1. Reindex source column tasks to remove any gaps
        const sourceTasks = remaining
          .filter((t) => t.status === targetTask.status)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((t, idx) => ({ ...t, position: idx }));

        // 2. Prepare destination column tasks with dragged task inserted at targetIdx
        const destTasks = remaining
          .filter((t) => t.status === newStatus)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

        const targetIdx =
          canReorder &&
          newPosition !== undefined &&
          newPosition >= 0 &&
          newPosition <= destTasks.length
            ? newPosition
            : destTasks.length;

        const updatedItem = {
          ...targetTask,
          status: newStatus,
          position: targetIdx,
        };

        destTasks.splice(targetIdx, 0, updatedItem);
        const reindexedDest = destTasks.map((t, idx) => ({ ...t, position: idx }));

        // 3. Other columns (untouched)
        const untouchedTasks = remaining.filter(
          (t) => t.status !== targetTask.status && t.status !== newStatus,
        );

        return [...untouchedTasks, ...sourceTasks, ...reindexedDest];
      });

      try {
        const updated = await updateTaskStatus(taskId, newStatus, positionToSend);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
        onSynced?.();
        message.success('Cập nhật trạng thái thành công');
      } catch (error) {
        setTasks(previousTasks);
        if (
          error instanceof UnauthorizedError ||
          (error instanceof Error && error.name === 'UnauthorizedError')
        ) {
          return;
        }
        message.error(
          error instanceof Error ? error.message : 'Không thể cập nhật trạng thái',
        );
      }
    },
    [isAuthenticated, tasks, setTasks, user, teams, onSynced],
  );

  const handleReorder = useCallback(
    async (taskIds: number[], status?: TaskStatus, teamFilter?: number | 'ALL') => {
      if (!isAuthenticated) {
        return;
      }
      if (teamFilter === 'ALL') {
        const reorderedTasks = tasks.filter((t) => taskIds.includes(t.id));
        const hasTeamTasks = reorderedTasks.some(
          (t) => t.teamId !== null && t.teamId !== undefined,
        );
        if (hasTeamTasks) {
          message.info(
            'Vui lòng chọn một Nhóm cụ thể để sắp xếp thứ tự công việc trong nhóm',
          );
          return;
        }
      }
      const previousTasks = [...tasks];

      setTasks((prev) => {
        const updated = [...prev];
        taskIds.forEach((id, newIndex) => {
          const itemIndex = updated.findIndex((t) => t.id === id);
          if (itemIndex !== -1) {
            updated[itemIndex] = {
              ...updated[itemIndex],
              position: newIndex,
              ...(status ? { status } : {}),
            };
          }
        });
        return updated;
      });

      try {
        await reorderTasks(
          taskIds,
          status,
          teamFilter !== 'ALL' && teamFilter !== undefined ? teamFilter : undefined,
        );
        onSynced?.();
      } catch (error) {
        setTasks(previousTasks);
        if (
          error instanceof UnauthorizedError ||
          (error instanceof Error && error.name === 'UnauthorizedError')
        ) {
          return;
        }
        message.error(
          error instanceof Error ? error.message : 'Không thể lưu vị trí công việc',
        );
      }
    },
    [isAuthenticated, tasks, setTasks, onSynced],
  );

  return {
    handleStatusMove,
    handleReorder,
  };
}
