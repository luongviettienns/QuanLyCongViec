import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { message } from 'antd';
import type { Task, TaskStatus } from '../types/task.types';
import { updateTaskStatus, reorderTasks } from '../api/tasks.api';
import { UnauthorizedError } from '../../../shared/api';

export function useTaskBoard(
  isAuthenticated: boolean,
  tasks: Task[],
  setTasks: Dispatch<SetStateAction<Task[]>>,
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
      const previousTasks = [...tasks];

      setTasks((prev) => {
        const remaining = prev.filter((t) => t.id !== taskId);
        const updatedItem = {
          ...targetTask,
          status: newStatus,
          position: newPosition ?? 0,
        };
        const destTasks = remaining
          .filter((t) => t.status === newStatus)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const targetIdx =
          newPosition !== undefined &&
          newPosition >= 0 &&
          newPosition <= destTasks.length
            ? newPosition
            : destTasks.length;
        destTasks.splice(targetIdx, 0, updatedItem);
        const reindexedDest = destTasks.map((t, idx) => ({ ...t, position: idx }));
        const otherTasks = remaining.filter((t) => t.status !== newStatus);
        return [...otherTasks, ...reindexedDest];
      });

      try {
        const updated = await updateTaskStatus(taskId, newStatus, newPosition);
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)),
        );
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
    [isAuthenticated, tasks, setTasks],
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
    [isAuthenticated, tasks, setTasks],
  );

  return {
    handleStatusMove,
    handleReorder,
  };
}
