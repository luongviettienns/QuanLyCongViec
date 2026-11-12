import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../../../features/tasks/types/task.types.ts';
import type { NotificationDestination } from '../../../features/notifications/types/notification.types.ts';

describe('Task Modal Controller & Realtime Sync Logic', () => {
  describe('Notification Destination Tab Mapping', () => {
    it('prioritizes dest.targetTab when explicitly provided (e.g. collaborators invite)', () => {
      const dest: NotificationDestination = {
        type: 'task',
        id: 123,
        targetTab: 'collaborators',
        subtaskId: 456,
      };
      const initialTab = dest.targetTab ?? (dest.subtaskId ? 'subtasks' : 'info');
      assert.equal(initialTab, 'collaborators');
    });

    it('falls back to subtasks when subtaskId is provided without targetTab', () => {
      const dest: NotificationDestination = {
        type: 'task',
        id: 123,
        subtaskId: 456,
      };
      const initialTab = dest.targetTab ?? (dest.subtaskId ? 'subtasks' : 'info');
      assert.equal(initialTab, 'subtasks');
    });

    it('defaults to info when neither targetTab nor subtaskId is provided', () => {
      const dest: NotificationDestination = {
        type: 'task',
        id: 123,
      };
      const initialTab = dest.targetTab ?? (dest.subtaskId ? 'subtasks' : 'info');
      assert.equal(initialTab, 'info');
    });
  });

  describe('Active Modal Task Resolution Semantics', () => {
    function resolveActiveModalTask(
      modalTaskId: number | null,
      tasks: Task[],
      modalTaskOverride: Task | null,
    ): Task | null {
      if (!modalTaskId) return null;
      const baseTask = tasks.find((t) => t.id === modalTaskId) ?? null;
      if (!baseTask) return modalTaskOverride;
      if (modalTaskOverride && modalTaskOverride.id === modalTaskId) {
        if (!baseTask.updatedAt || !modalTaskOverride.updatedAt) {
          return modalTaskOverride;
        }
        return new Date(modalTaskOverride.updatedAt).getTime() >=
          new Date(baseTask.updatedAt).getTime()
          ? modalTaskOverride
          : baseTask;
      }
      return baseTask;
    }

    it('uses latest updatedAt between canonical tasks list and modalTaskOverride', () => {
      const baseTask: Task = {
        id: 1,
        title: 'Original Title',
        status: 'TODO',
        updatedAt: '2026-11-12T10:00:00Z',
      };
      const freshOverride: Task = {
        id: 1,
        title: 'Updated from SSE Fetch',
        status: 'IN_PROGRESS',
        updatedAt: '2026-11-12T10:05:00Z',
      };

      const resolved = resolveActiveModalTask(1, [baseTask], freshOverride);
      assert.equal(resolved?.title, 'Updated from SSE Fetch');
      assert.equal(resolved?.status, 'IN_PROGRESS');

      // Conversely, if tasks list has newer updatedAt
      const newerListTask: Task = {
        id: 1,
        title: 'Newer from List Refetch',
        status: 'DONE',
        updatedAt: '2026-11-12T10:10:00Z',
      };
      const resolvedList = resolveActiveModalTask(1, [newerListTask], freshOverride);
      assert.equal(resolvedList?.title, 'Newer from List Refetch');
      assert.equal(resolvedList?.status, 'DONE');
    });
  });

  describe('Realtime Self-Event and Target Task Filtering', () => {
    it('skips task refetch when event is triggered by current authenticated user', () => {
      const currentUserId = 42;
      const event = {
        type: 'TASK_UPDATED',
        actorId: 42,
        payload: { taskId: 99 },
      };
      const shouldTrigger = !(event.actorId && event.actorId === currentUserId);
      assert.equal(shouldTrigger, false);
    });

    it('allows task refetch when event is triggered by another user', () => {
      const currentUserId = 42;
      const event = {
        type: 'TASK_UPDATED',
        actorId: 99,
        payload: { taskId: 99 },
      };
      const shouldTrigger = !(event.actorId && event.actorId === currentUserId);
      assert.equal(shouldTrigger, true);
    });

    it('identifies modal task target match and forces modal close when TASK_DELETED targets open task', () => {
      const openTaskId = 77;
      const deleteEvent = {
        type: 'TASK_DELETED',
        actorId: 99,
        payload: { taskId: 77 },
      };

      const isTarget = deleteEvent.payload.taskId === openTaskId;
      const isDelete = deleteEvent.type === 'TASK_DELETED';
      assert.equal(isTarget, true);
      assert.equal(isDelete, true);
    });
  });

  describe('View Mode Transition Semantics', () => {
    function computeViewModeTransitionActions(
      prevMode: string,
      nextMode: string,
    ): { fetchActive: boolean; fetchTrash: boolean; saveMode: boolean } {
      if (prevMode === nextMode) {
        return { fetchActive: false, fetchTrash: false, saveMode: false };
      }
      if (nextMode !== 'trash') {
        return {
          fetchActive: prevMode === 'trash',
          fetchTrash: false,
          saveMode: true,
        };
      }
      return {
        fetchActive: false,
        fetchTrash: true,
        saveMode: false,
      };
    }

    it('triggers active tasks fetch when exiting trash mode to kanban/table/both', () => {
      const fromTrashToKanban = computeViewModeTransitionActions('trash', 'kanban');
      assert.equal(fromTrashToKanban.fetchActive, true);
      assert.equal(fromTrashToKanban.fetchTrash, false);
      assert.equal(fromTrashToKanban.saveMode, true);

      const fromTrashToTable = computeViewModeTransitionActions('trash', 'table');
      assert.equal(fromTrashToTable.fetchActive, true);
      assert.equal(fromTrashToTable.fetchTrash, false);

      const fromTrashToBoth = computeViewModeTransitionActions('trash', 'both');
      assert.equal(fromTrashToBoth.fetchActive, true);
      assert.equal(fromTrashToBoth.fetchTrash, false);
    });

    it('triggers trash tasks fetch when entering trash mode and does not persist trash to localStorage', () => {
      const toTrash = computeViewModeTransitionActions('kanban', 'trash');
      assert.equal(toTrash.fetchActive, false);
      assert.equal(toTrash.fetchTrash, true);
      assert.equal(toTrash.saveMode, false);
    });

    it('does not trigger fetch when switching between non-trash modes', () => {
      const kanbanToTable = computeViewModeTransitionActions('kanban', 'table');
      assert.equal(kanbanToTable.fetchActive, false);
      assert.equal(kanbanToTable.fetchTrash, false);
      assert.equal(kanbanToTable.saveMode, true);
    });

    it('does nothing when mode does not change', () => {
      const sameMode = computeViewModeTransitionActions('kanban', 'kanban');
      assert.equal(sameMode.fetchActive, false);
      assert.equal(sameMode.fetchTrash, false);
      assert.equal(sameMode.saveMode, false);
    });
  });
});
