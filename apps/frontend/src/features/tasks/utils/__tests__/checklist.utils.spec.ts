import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getChecklistProgress,
  formatChecklistRatio,
  canUserManageChecklist,
  isUserAssignedCollaboratorOnSubtask,
  getNextChecklistStatusAction,
  getChecklistStatusMenuOptions,
  validateChecklistTitle,
  reorderChecklistArray,
  buildChecklistAssigneeOptions,
  resolveDragReorderIndices,
  shouldApplyTaskScopedResult,
  resolveInlineEditSubmit,
  resolveModalChecklistSubtasks,
} from '../checklist.utils.ts';
import type { Task, Subtask } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';

function makeUser(id: number, name = `User ${id}`): User {
  return { id, name, email: `u${id}@test.local` };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    userId: 10,
    assigneeId: 20,
    teamId: 5,
    title: 'Parent Task',
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 5,
    name: 'Core Team',
    ownerId: 10,
    members: [
      { id: 1, teamId: 5, userId: 20, role: 'MEMBER', joinedAt: '2026-11-01T00:00:00.000Z' },
      { id: 2, teamId: 5, userId: 30, role: 'ADMIN', joinedAt: '2026-11-01T00:00:00.000Z' },
      { id: 3, teamId: 5, userId: 40, role: 'MEMBER', joinedAt: '2026-11-01T00:00:00.000Z' },
    ],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: 100,
    taskId: 1,
    title: 'Subtask item',
    status: 'TODO',
    position: 0,
    assigneeId: null,
    createdById: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Checklist Domain Utils', () => {
  describe('getChecklistProgress & formatChecklistRatio', () => {
    it('returns zeros and null ratio when subtasks list is empty or nullish', () => {
      assert.deepEqual(getChecklistProgress(undefined), {
        total: 0,
        done: 0,
        inProgress: 0,
        todo: 0,
        percent: 0,
      });
      assert.equal(formatChecklistRatio([]), null);
      assert.equal(formatChecklistRatio(null), null);
    });

    it('counts TODO, IN_PROGRESS, DONE and rounds percentage cleanly', () => {
      const progress = getChecklistProgress([
        { status: 'DONE' },
        { status: 'DONE' },
        { status: 'IN_PROGRESS' },
        { status: 'TODO' },
        { status: 'DONE' },
      ]);

      assert.deepEqual(progress, {
        total: 5,
        done: 3,
        inProgress: 1,
        todo: 1,
        percent: 60,
      });
      assert.equal(
        formatChecklistRatio([{ status: 'DONE' }, { status: 'TODO' }, { status: 'DONE' }]),
        '2/3',
      );
    });
  });

  describe('canUserManageChecklist & isUserAssignedCollaboratorOnSubtask', () => {
    it('allows only creator on personal tasks (matching backend TaskPolicyService.canManageSubtask)', () => {
      const personalTask = makeTask({ teamId: null, userId: 10, assigneeId: 20 });
      assert.equal(canUserManageChecklist(makeUser(10), personalTask, null), true);
      assert.equal(canUserManageChecklist(makeUser(20), personalTask, null), false);
      assert.equal(canUserManageChecklist(null, personalTask, null), false);
    });

    it('allows OWNER, ADMIN, CREATOR, and ASSIGNEE on team tasks, but not plain MEMBER', () => {
      const team = makeTeam();
      const teamTask = makeTask({ teamId: 5, userId: 10, assigneeId: 20 });

      assert.equal(canUserManageChecklist(makeUser(10), teamTask, team), true); // owner/creator
      assert.equal(canUserManageChecklist(makeUser(30), teamTask, team), true); // admin
      assert.equal(canUserManageChecklist(makeUser(20), teamTask, team), true); // assignee
      assert.equal(canUserManageChecklist(makeUser(40), teamTask, team), false); // plain member
    });

    it('detects accepted collaborator assigned to specific subtask', () => {
      const task = makeTask({
        collaborators: [
          {
            id: 1,
            taskId: 1,
            userId: 40,
            status: 'ACCEPTED',
            invitedById: 10,
            invitedAt: '2026-11-01T00:00:00.000Z',
          },
          {
            id: 2,
            taskId: 1,
            userId: 41,
            status: 'PENDING',
            invitedById: 10,
            invitedAt: '2026-11-01T00:00:00.000Z',
          },
        ],
      });

      assert.equal(
        isUserAssignedCollaboratorOnSubtask(makeUser(40), task, { assigneeId: 40 }),
        true,
      );
      assert.equal(
        isUserAssignedCollaboratorOnSubtask(makeUser(40), task, { assigneeId: 20 }),
        false,
      );
      assert.equal(
        isUserAssignedCollaboratorOnSubtask(makeUser(41), task, { assigneeId: 41 }),
        false,
      );
    });
  });

  describe('getNextChecklistStatusAction (3-state workflow enforcement)', () => {
    it('advances TODO -> IN_PROGRESS (never TODO -> DONE) for Manager and assigned Collaborator', () => {
      const managerNext = getNextChecklistStatusAction(
        { status: 'TODO' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: false },
      );
      assert.equal(managerNext.nextStatus, 'IN_PROGRESS');
      assert.equal(managerNext.disabled, false);
      assert.equal(managerNext.visualState, 'todo');

      const collabNext = getNextChecklistStatusAction(
        { status: 'TODO' },
        { canManage: false, isAssignedCollaborator: true, isParentDone: false },
      );
      assert.equal(collabNext.nextStatus, 'IN_PROGRESS');
      assert.equal(collabNext.disabled, false);
    });

    it('advances IN_PROGRESS -> DONE for Manager and assigned Collaborator (even if parent task is DONE)', () => {
      const action = getNextChecklistStatusAction(
        { status: 'IN_PROGRESS' },
        { canManage: false, isAssignedCollaborator: true, isParentDone: true },
      );
      assert.equal(action.nextStatus, 'DONE');
      assert.equal(action.disabled, false);
      assert.equal(action.visualState, 'in_progress');
    });

    it('reopens DONE -> IN_PROGRESS for Manager when parent is not DONE, but locks for Collaborator or DONE parent', () => {
      const managerReopen = getNextChecklistStatusAction(
        { status: 'DONE' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: false },
      );
      assert.equal(managerReopen.nextStatus, 'IN_PROGRESS');
      assert.equal(managerReopen.disabled, false);
      assert.equal(managerReopen.visualState, 'done');

      const collabLocked = getNextChecklistStatusAction(
        { status: 'DONE' },
        { canManage: false, isAssignedCollaborator: true, isParentDone: false },
      );
      assert.equal(collabLocked.nextStatus, null);
      assert.equal(collabLocked.disabled, true);
      assert.ok(collabLocked.tooltip.length > 0);

      const parentDoneLocked = getNextChecklistStatusAction(
        { status: 'DONE' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: true },
      );
      assert.equal(parentDoneLocked.nextStatus, null);
      assert.equal(parentDoneLocked.disabled, true);
    });

    it('locks TODO when parent task is DONE or user has no permission', () => {
      const parentDoneTodo = getNextChecklistStatusAction(
        { status: 'TODO' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: true },
      );
      assert.equal(parentDoneTodo.nextStatus, null);
      assert.equal(parentDoneTodo.disabled, true);

      const viewerTodo = getNextChecklistStatusAction(
        { status: 'TODO' },
        { canManage: false, isAssignedCollaborator: false, isParentDone: false },
      );
      assert.equal(viewerTodo.nextStatus, null);
      assert.equal(viewerTodo.disabled, true);
    });
  });

  describe('getChecklistStatusMenuOptions', () => {
    it('disables DONE from TODO for Manager so 3-state backend invariant is never violated', () => {
      const opts = getChecklistStatusMenuOptions(
        { status: 'TODO' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: false },
      );
      const todoOpt = opts.find((o) => o.status === 'TODO');
      const inProgOpt = opts.find((o) => o.status === 'IN_PROGRESS');
      const doneOpt = opts.find((o) => o.status === 'DONE');

      assert.equal(todoOpt?.disabled, true);
      assert.equal(inProgOpt?.disabled, false);
      assert.equal(doneOpt?.disabled, true);
    });

    it('allows Manager to move IN_PROGRESS to TODO or DONE, and reopen DONE to TODO or IN_PROGRESS', () => {
      const inProgOpts = getChecklistStatusMenuOptions(
        { status: 'IN_PROGRESS' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: false },
      );
      assert.equal(inProgOpts.find((o) => o.status === 'TODO')?.disabled, false);
      assert.equal(inProgOpts.find((o) => o.status === 'DONE')?.disabled, false);

      const doneOpts = getChecklistStatusMenuOptions(
        { status: 'DONE' },
        { canManage: true, isAssignedCollaborator: false, isParentDone: false },
      );
      assert.equal(doneOpts.find((o) => o.status === 'TODO')?.disabled, false);
      assert.equal(doneOpts.find((o) => o.status === 'IN_PROGRESS')?.disabled, false);
    });

    it('restricts Collaborator to forward-only transitions', () => {
      const inProgOpts = getChecklistStatusMenuOptions(
        { status: 'IN_PROGRESS' },
        { canManage: false, isAssignedCollaborator: true, isParentDone: false },
      );
      assert.equal(inProgOpts.find((o) => o.status === 'TODO')?.disabled, true);
      assert.equal(inProgOpts.find((o) => o.status === 'DONE')?.disabled, false);
    });
  });

  describe('validateChecklistTitle', () => {
    it('rejects empty, whitespace-only, 1-char, and >255-char titles after trimming', () => {
      assert.equal(validateChecklistTitle('   ').valid, false);
      assert.equal(validateChecklistTitle(' a ').valid, false);
      assert.equal(validateChecklistTitle('a'.repeat(256)).valid, false);
    });

    it('accepts trimmed titles with length 2..255', () => {
      const okMin = validateChecklistTitle('  AB  ');
      assert.equal(okMin.valid, true);
      assert.equal(okMin.title, 'AB');
      assert.equal(okMin.errorMessage, null);

      const okMax = validateChecklistTitle('x'.repeat(255));
      assert.equal(okMax.valid, true);
    });
  });

  describe('reorderChecklistArray', () => {
    it('moves element without mutating original array', () => {
      const original = [
        makeSubtask({ id: 1, title: 'One' }),
        makeSubtask({ id: 2, title: 'Two' }),
        makeSubtask({ id: 3, title: 'Three' }),
      ];
      const moved = reorderChecklistArray(original, 0, 2);

      assert.deepEqual(
        moved.map((item) => item.id),
        [2, 3, 1],
      );
      assert.deepEqual(
        original.map((item) => item.id),
        [1, 2, 3],
      );
    });

    it('returns shallow copy unchanged when indices are equal or out of bounds', () => {
      const original = [makeSubtask({ id: 1 }), makeSubtask({ id: 2 })];
      assert.deepEqual(
        reorderChecklistArray(original, -1, 1).map((i) => i.id),
        [1, 2],
      );
      assert.deepEqual(
        reorderChecklistArray(original, 1, 1).map((i) => i.id),
        [1, 2],
      );
    });
  });

  describe('buildChecklistAssigneeOptions', () => {
    it('collects main assignee and deduplicated ACCEPTED collaborators with short names', () => {
      const task = makeTask({
        assigneeId: 20,
        assignee: { id: 20, name: 'An Nguyễn', email: 'an@test.local' },
        collaborators: [
          {
            id: 1,
            taskId: 1,
            userId: 20,
            status: 'ACCEPTED',
            invitedById: 10,
            invitedAt: '2026-11-01T00:00:00.000Z',
            user: { id: 20, name: 'An Nguyễn', email: 'an@test.local' },
          },
          {
            id: 2,
            taskId: 1,
            userId: 30,
            status: 'ACCEPTED',
            invitedById: 10,
            invitedAt: '2026-11-01T00:00:00.000Z',
            user: { id: 30, name: 'Bình Trần', email: 'binh@test.local' },
          },
          {
            id: 3,
            taskId: 1,
            userId: 40,
            status: 'PENDING',
            invitedById: 10,
            invitedAt: '2026-11-01T00:00:00.000Z',
            user: { id: 40, name: 'Châu Lê', email: 'chau@test.local' },
          },
        ],
      });

      const options = buildChecklistAssigneeOptions(task);
      assert.deepEqual(options, [
        { value: 20, name: 'An Nguyễn', roleTag: 'Phụ trách chính', label: 'An Nguyễn (Phụ trách chính)' },
        { value: 30, name: 'Bình Trần', roleTag: 'Phối hợp', label: 'Bình Trần (Phối hợp)' },
      ]);
    });
  });

  describe('resolveDragReorderIndices & shouldApplyTaskScopedResult', () => {
    it('resolves valid subtask drag source/target indices and ignores invalid or noop drops', () => {
      const items = [makeSubtask({ id: 11 }), makeSubtask({ id: 22 }), makeSubtask({ id: 33 })];
      assert.deepEqual(resolveDragReorderIndices(items, 'subtask-11', 'subtask-33'), {
        fromIndex: 0,
        toIndex: 2,
      });
      assert.equal(resolveDragReorderIndices(items, 'subtask-11', 'subtask-11'), null);
      assert.equal(resolveDragReorderIndices(items, 'task-11', 'subtask-33'), null);
      assert.equal(resolveDragReorderIndices(items, 'subtask-11', 'subtask-999'), null);
    });

    it('rejects stale fetch/mutation callbacks after switching to another task', () => {
      assert.equal(shouldApplyTaskScopedResult(5, 5, true), true);
      assert.equal(shouldApplyTaskScopedResult(5, 6, true), false);
      assert.equal(shouldApplyTaskScopedResult(5, 5, false), false);
    });
  });

  describe('resolveInlineEditSubmit & resolveModalChecklistSubtasks (Review Fixes)', () => {
    it('cancels invalid draft on blur, rejects invalid draft on Enter, and commits valid changed title', () => {
      assert.deepEqual(resolveInlineEditSubmit('   ', 'Old title', true), {
        action: 'cancel',
        title: 'Old title',
        errorMessage: null,
      });
      assert.deepEqual(resolveInlineEditSubmit(' a ', 'Old title', false), {
        action: 'error',
        title: 'a',
        errorMessage: 'Tiêu đề đầu việc phải có ít nhất 2 ký tự',
      });
      assert.deepEqual(resolveInlineEditSubmit('  Old title  ', 'Old title', false), {
        action: 'noop',
        title: 'Old title',
        errorMessage: null,
      });
      assert.deepEqual(resolveInlineEditSubmit('  New title  ', 'Old title', true), {
        action: 'commit',
        title: 'New title',
        errorMessage: null,
      });
    });

    it('uses liveSubtasks only when modal is open and liveSubtasks matches task.id and has fresher sync', () => {
      const staleCache = {
        taskId: 10,
        sourceSubtasksRef: undefined as Subtask[] | undefined,
        subtasks: [makeSubtask({ id: 1, status: 'TODO' })],
      };
      const externalUpdated = [makeSubtask({ id: 1, status: 'DONE' }), makeSubtask({ id: 2, status: 'DONE' })];
      const task = makeTask({ id: 10, subtasks: externalUpdated });

      // Closed modal never holds live cache over task.subtasks
      assert.equal(
        resolveModalChecklistSubtasks(false, task, { ...staleCache, sourceSubtasksRef: externalUpdated }),
        externalUpdated,
      );
      // External prop change invalidates live cache for old sourceSubtasksRef
      assert.equal(
        resolveModalChecklistSubtasks(true, task, staleCache),
        externalUpdated,
      );
      // Matching open modal with same sourceSubtasksRef uses live optimistic subtasks
      const activeLive = {
        taskId: 10,
        sourceSubtasksRef: externalUpdated,
        subtasks: [makeSubtask({ id: 1, status: 'IN_PROGRESS' })],
      };
      assert.equal(
        resolveModalChecklistSubtasks(true, task, activeLive),
        activeLive.subtasks,
      );
    });
  });
});
