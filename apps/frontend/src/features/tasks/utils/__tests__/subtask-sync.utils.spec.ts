import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeServerSubtask,
  shouldAcceptRemoteSubtaskFetch,
  detectSubtaskEditConflict,
} from '../subtask-sync.utils.ts';
import type { Subtask } from '../../types/task.types.ts';

function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 10,
    taskId: 5,
    title: 'Thiết kế UI',
    description: 'Chi tiết ban đầu',
    status: 'TODO',
    position: 0,
    assigneeId: 2,
    createdById: 1,
    completedById: null,
    completedBy: null,
    completedAt: null,
    createdAt: '2026-11-11T09:00:00.000Z',
    updatedAt: '2026-11-11T09:00:00.000Z',
    ...overrides,
  };
}

describe('Subtask Sync & Conflict Utils', () => {
  it('merges canonical server subtask response including completedBy & completedAt', () => {
    const initial = [makeSubtask({ id: 10, status: 'IN_PROGRESS' }), makeSubtask({ id: 11 })];
    const serverUpdated = makeSubtask({
      id: 10,
      status: 'DONE',
      completedById: 3,
      completedBy: { id: 3, name: 'Collab C', email: 'c@test.local' },
      completedAt: '2026-11-11T10:15:00.000Z',
    });

    const merged = mergeServerSubtask(initial, serverUpdated);
    assert.equal(merged[0].status, 'DONE');
    assert.equal(merged[0].completedBy?.name, 'Collab C');
    assert.equal(merged[0].completedAt, '2026-11-11T10:15:00.000Z');
  });

  it('rejects stale fetch that started before a newer local mutation completed', () => {
    assert.equal(shouldAcceptRemoteSubtaskFetch(3, 4), false);
    assert.equal(shouldAcceptRemoteSubtaskFetch(4, 4), true);
    assert.equal(shouldAcceptRemoteSubtaskFetch(5, 4), true);
  });

  it('detects remote deletion, dirty-form conflict, and safe background sync', () => {
    const baseSub = makeSubtask({ id: 10, title: 'Old Title', updatedAt: '2026-11-11T09:00:00.000Z' });

    // 1. Subtask deleted remotely while edit modal open
    assert.equal(
      detectSubtaskEditConflict({
        editingSubtask: baseSub,
        latestSubtasks: [makeSubtask({ id: 99 })],
        draftTitle: 'Old Title',
        draftDescription: 'Chi tiết ban đầu',
        draftAssigneeId: 2,
      }),
      'deleted',
    );

    // 2. Remote modified AND user has unsaved local edits -> 'conflict' (do NOT silently wipe draft!)
    const remoteUpdated = makeSubtask({
      id: 10,
      title: 'Title By B',
      updatedAt: '2026-11-11T09:05:00.000Z',
    });
    assert.equal(
      detectSubtaskEditConflict({
        editingSubtask: baseSub,
        latestSubtasks: [remoteUpdated],
        draftTitle: 'Title By A (unsaved)',
        draftDescription: 'Chi tiết ban đầu',
        draftAssigneeId: 2,
      }),
      'conflict',
    );

    // 3. Remote modified while user has NOT edited anything -> 'safe_sync'
    assert.equal(
      detectSubtaskEditConflict({
        editingSubtask: baseSub,
        latestSubtasks: [remoteUpdated],
        draftTitle: 'Old Title',
        draftDescription: 'Chi tiết ban đầu',
        draftAssigneeId: 2,
      }),
      'safe_sync',
    );

    // 4. Remote identical -> 'unchanged'
    assert.equal(
      detectSubtaskEditConflict({
        editingSubtask: baseSub,
        latestSubtasks: [baseSub],
        draftTitle: 'Old Title',
        draftDescription: 'Chi tiết ban đầu',
        draftAssigneeId: 2,
      }),
      'unchanged',
    );
  });
});
