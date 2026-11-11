import type { Subtask } from '../types/task.types';

/**
 * Replaces a single subtask with the canonical server representation (including `completedBy` / `completedAt`).
 */
export function mergeServerSubtask(subtasks: Subtask[], updated: Subtask): Subtask[] {
  return subtasks.map((item) => (item.id === updated.id ? { ...item, ...updated } : item));
}

/**
 * Ensures stale background fetches started before a newer local mutation never overwrite newer state.
 */
export function shouldAcceptRemoteSubtaskFetch(
  fetchStartedSeq: number,
  latestMutationSeq: number,
): boolean {
  return fetchStartedSeq >= latestMutationSeq;
}

export type SubtaskEditConflictState = 'deleted' | 'conflict' | 'safe_sync' | 'unchanged';

/**
 * Compares the subtask currently open in an edit modal against freshly fetched subtasks
 * to avoid silently wiping unsaved edits on concurrent remote updates.
 */
export function detectSubtaskEditConflict(params: {
  editingSubtask: Subtask;
  latestSubtasks: Subtask[];
  draftTitle: string;
  draftDescription: string;
  draftAssigneeId: number | undefined;
}): SubtaskEditConflictState {
  const { editingSubtask, latestSubtasks, draftTitle, draftDescription, draftAssigneeId } = params;
  const remote = latestSubtasks.find((s) => s.id === editingSubtask.id);

  if (!remote) {
    return 'deleted';
  }

  const remoteChanged =
    remote.updatedAt !== editingSubtask.updatedAt ||
    remote.title !== editingSubtask.title ||
    (remote.description ?? '') !== (editingSubtask.description ?? '') ||
    (remote.assigneeId ?? undefined) !== (editingSubtask.assigneeId ?? undefined);

  if (!remoteChanged) {
    return 'unchanged';
  }

  const hasLocalDraftChanges =
    draftTitle !== editingSubtask.title ||
    draftDescription !== (editingSubtask.description ?? '') ||
    draftAssigneeId !== (editingSubtask.assigneeId ?? undefined);

  return hasLocalDraftChanges ? 'conflict' : 'safe_sync';
}
