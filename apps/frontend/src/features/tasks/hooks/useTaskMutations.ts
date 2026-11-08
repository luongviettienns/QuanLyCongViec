import { useCallback } from 'react';
import { message } from 'antd';
import { deleteTask } from '../api/tasks.api';
import { UnauthorizedError } from '../../auth/api/auth.api';

export function useTaskMutations(isAuthenticated: boolean) {
  const handleDeleteTask = useCallback(
    async (id: number, onSuccess?: () => Promise<void> | void) => {
      if (!isAuthenticated) {
        return;
      }
      try {
        await deleteTask(id);
        message.success('Xoá công việc thành công');
        if (onSuccess) {
          await onSuccess();
        }
      } catch (error) {
        if (
          error instanceof UnauthorizedError ||
          (error instanceof Error && error.name === 'UnauthorizedError')
        ) {
          return;
        }
        message.error(
          error instanceof Error ? error.message : 'Xoá công việc thất bại',
        );
      }
    },
    [isAuthenticated],
  );

  return {
    handleDeleteTask,
  };
}
