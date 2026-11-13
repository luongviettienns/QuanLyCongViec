import { useCallback } from 'react';
import { message } from 'antd';
import {
  deleteTask,
  restoreTask,
  permanentDeleteTask,
  bulkDeleteTasks,
  bulkUpdateTaskStatus,
  bulkRestoreTasks,
  bulkPermanentDeleteTasks,
  emptyTaskTrash,
} from '../api/tasks.api';
import type { BulkTaskResult, TaskStatus } from '../types/task.types';
import { getFriendlyErrorMessage } from '../../../shared/api';
import { shouldIgnoreTaskApiError } from '../utils/task-error.utils';

export function useTaskMutations(isAuthenticated: boolean) {
  const handleDeleteTask = useCallback(
    async (id: number, onSuccess?: () => Promise<void> | void): Promise<boolean> => {
      if (!isAuthenticated) {
        return false;
      }
      try {
        await deleteTask(id);
        message.success('Xoá công việc thành công');
        if (onSuccess) {
          await onSuccess();
        }
        return true;
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return false;
        }
        message.error(getFriendlyErrorMessage(error, 'Xoá công việc thất bại'));
        return false;
      }
    },
    [isAuthenticated],
  );

  const handleRestoreTask = useCallback(
    async (id: number, onSuccess?: () => Promise<void> | void) => {
      if (!isAuthenticated) {
        return;
      }
      try {
        await restoreTask(id);
        message.success('Khôi phục công việc thành công');
        if (onSuccess) {
          await onSuccess();
        }
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return;
        }
        message.error(getFriendlyErrorMessage(error, 'Khôi phục công việc thất bại'));
      }
    },
    [isAuthenticated],
  );

  const handlePermanentDeleteTask = useCallback(
    async (id: number, onSuccess?: () => Promise<void> | void) => {
      if (!isAuthenticated) {
        return;
      }
      try {
        await permanentDeleteTask(id);
        message.success('Đã xoá vĩnh viễn công việc');
        if (onSuccess) {
          await onSuccess();
        }
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return;
        }
        message.error(
          getFriendlyErrorMessage(error, 'Xoá vĩnh viễn công việc thất bại'),
        );
      }
    },
    [isAuthenticated],
  );

  const runBulkTaskMutation = useCallback(
    async (
      action: () => Promise<BulkTaskResult>,
      options: {
        verb: string;
        emptyMessage?: string;
        fallbackError: string;
        onSuccess?: () => Promise<void> | void;
      },
    ): Promise<BulkTaskResult | null> => {
      if (!isAuthenticated) {
        return null;
      }
      try {
        const result = await action();
        if (result.succeededIds.length > 0) {
          message.success(`Đã ${options.verb} ${result.succeededIds.length} công việc`);
        } else if (result.failed.length === 0 && options.emptyMessage) {
          message.info(options.emptyMessage);
        }
        if (result.failed.length > 0) {
          message.warning(
            `${result.failed.length} công việc không thể ${options.verb}: ${result.failed[0]?.reason ?? 'Không đủ quyền hoặc dữ liệu không hợp lệ'}`,
          );
        }
        if (options.onSuccess) {
          await options.onSuccess();
        }
        return result;
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return null;
        }
        message.error(getFriendlyErrorMessage(error, options.fallbackError));
        return null;
      }
    },
    [isAuthenticated],
  );

  const handleBulkDeleteTasks = useCallback(
    (taskIds: number[], onSuccess?: () => Promise<void> | void) =>
      runBulkTaskMutation(() => bulkDeleteTasks(taskIds), {
        verb: 'xoá',
        fallbackError: 'Xoá hàng loạt thất bại',
        onSuccess,
      }),
    [runBulkTaskMutation],
  );

  const handleBulkUpdateTaskStatus = useCallback(
    (taskIds: number[], status: TaskStatus, onSuccess?: () => Promise<void> | void) =>
      runBulkTaskMutation(() => bulkUpdateTaskStatus(taskIds, status), {
        verb: 'cập nhật trạng thái',
        fallbackError: 'Cập nhật trạng thái hàng loạt thất bại',
        onSuccess,
      }),
    [runBulkTaskMutation],
  );

  const handleBulkRestoreTasks = useCallback(
    (taskIds: number[], onSuccess?: () => Promise<void> | void) =>
      runBulkTaskMutation(() => bulkRestoreTasks(taskIds), {
        verb: 'khôi phục',
        fallbackError: 'Khôi phục hàng loạt thất bại',
        onSuccess,
      }),
    [runBulkTaskMutation],
  );

  const handleBulkPermanentDeleteTasks = useCallback(
    (taskIds: number[], onSuccess?: () => Promise<void> | void) =>
      runBulkTaskMutation(() => bulkPermanentDeleteTasks(taskIds), {
        verb: 'xoá vĩnh viễn',
        fallbackError: 'Xoá vĩnh viễn hàng loạt thất bại',
        onSuccess,
      }),
    [runBulkTaskMutation],
  );

  const handleEmptyTrash = useCallback(
    (teamId?: number, onSuccess?: () => Promise<void> | void) =>
      runBulkTaskMutation(() => emptyTaskTrash(teamId), {
        verb: 'xoá vĩnh viễn',
        emptyMessage: 'Không có công việc nào trong thùng rác thuộc quyền dọn dẹp',
        fallbackError: 'Dọn sạch thùng rác thất bại',
        onSuccess,
      }),
    [runBulkTaskMutation],
  );

  return {
    handleDeleteTask,
    handleRestoreTask,
    handlePermanentDeleteTask,
    handleBulkDeleteTasks,
    handleBulkUpdateTaskStatus,
    handleBulkRestoreTasks,
    handleBulkPermanentDeleteTasks,
    handleEmptyTrash,
  };
}
