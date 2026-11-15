export interface BulkTaskFailure {
  id: number;
  reason: string;
}

export interface BulkTaskResult {
  succeededIds: number[];
  failed: BulkTaskFailure[];
}

/**
 * Executes an operation sequentially across deduplicated task IDs, isolating
 * per-item authorization or validation errors without aborting remaining tasks.
 */
export async function runSequentialTaskBatch(
  taskIds: readonly number[],
  operation: (taskId: number) => Promise<unknown>,
): Promise<BulkTaskResult> {
  const uniqueIds = Array.from(new Set(taskIds));
  const succeededIds: number[] = [];
  const failed: BulkTaskFailure[] = [];

  for (const id of uniqueIds) {
    try {
      await operation(id);
      succeededIds.push(id);
    } catch (error) {
      failed.push({
        id,
        reason: error instanceof Error ? error.message : 'Thao tác thất bại',
      });
    }
  }

  return { succeededIds, failed };
}
