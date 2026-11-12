import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TASK_STATUS_CONFIG } from '../../types/task.types.ts';
import type { Task, TaskStatus } from '../../types/task.types.ts';
import { getTaskPermissions } from '../../utils/task-permission.utils.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';

describe('TaskFormModal Refactor & Logic Integration', () => {
  describe('Status Options Mapping with TASK_STATUS_CONFIG', () => {
    it('maps all statuses using TASK_STATUS_CONFIG Vietnamese labels', () => {
      const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
      const statusOptions = statuses.map((status) => ({
        value: status,
        label: TASK_STATUS_CONFIG[status].label,
      }));

      assert.deepEqual(statusOptions, [
        { value: 'TODO', label: 'Cần làm' },
        { value: 'IN_PROGRESS', label: 'Đang làm' },
        { value: 'DONE', label: 'Hoàn thành' },
      ]);
    });
  });

  describe('Save Button Disabled Logic (Form.useWatch status)', () => {
    function computeIsSaveDisabled(params: {
      task: Task | null;
      canEditContent: boolean;
      canEditStatus: boolean;
      watchedStatus: TaskStatus | undefined;
    }): boolean {
      const { task, canEditContent, canEditStatus, watchedStatus } = params;
      return Boolean(
        task && !canEditContent && canEditStatus && watchedStatus === task.status,
      );
    }

    const mockTask: Task = {
      id: 1,
      title: 'Review PR',
      status: 'TODO',
    };

    it('disables Save when user can only edit status and status has not changed', () => {
      const isSaveDisabled = computeIsSaveDisabled({
        task: mockTask,
        canEditContent: false,
        canEditStatus: true,
        watchedStatus: 'TODO',
      });
      assert.equal(isSaveDisabled, true);
    });

    it('enables Save when user changes status to IN_PROGRESS', () => {
      const isSaveDisabled = computeIsSaveDisabled({
        task: mockTask,
        canEditContent: false,
        canEditStatus: true,
        watchedStatus: 'IN_PROGRESS',
      });
      assert.equal(isSaveDisabled, false);
    });

    it('enables Save when user has full canEditContent permission', () => {
      const isSaveDisabled = computeIsSaveDisabled({
        task: mockTask,
        canEditContent: true,
        canEditStatus: true,
        watchedStatus: 'TODO',
      });
      assert.equal(isSaveDisabled, false);
    });

    it('enables Save in create mode (!task)', () => {
      const isSaveDisabled = computeIsSaveDisabled({
        task: null,
        canEditContent: true,
        canEditStatus: true,
        watchedStatus: 'TODO',
      });
      assert.equal(isSaveDisabled, false);
    });
  });

  describe('Create vs Edit Initial TeamId Resolution', () => {
    function resolveInitialTeamId(
      task: Task | null,
      defaultTeamId?: number | null,
    ): number | null {
      if (!task) {
        return defaultTeamId ?? null;
      }
      return task.teamId ?? null;
    }

    it('prefills defaultTeamId when opening in create mode (!task)', () => {
      const resolved = resolveInitialTeamId(null, 42);
      assert.equal(resolved, 42);
    });

    it('prefills null in create mode when defaultTeamId is undefined or null', () => {
      assert.equal(resolveInitialTeamId(null, undefined), null);
      assert.equal(resolveInitialTeamId(null, null), null);
    });

    it('preserves existing task teamId in edit mode and ignores defaultTeamId', () => {
      const task: Task = {
        id: 99,
        title: 'Task in Team 10',
        status: 'TODO',
        teamId: 10,
      };
      const resolved = resolveInitialTeamId(task, 999);
      assert.equal(resolved, 10);
    });
  });

  describe('canReturnTask Permission Evaluation for TaskReturnAction', () => {
    const userAssignee: User = { id: 2, email: 'assignee@example.com', name: 'Assignee User' };
    const userCreator: User = { id: 1, email: 'creator@example.com', name: 'Creator User' };
    const team: Team = {
      id: 5,
      name: 'Engineering',
      ownerId: 99,
      members: [
        { id: 1, teamId: 5, userId: 1, role: 'MEMBER' },
        { id: 2, teamId: 5, userId: 2, role: 'MEMBER' },
      ],
    };

    it('allows assignee (who is not creator) to return a team task in TODO', () => {
      const task: Task = {
        id: 100,
        title: 'Assigned task',
        status: 'TODO',
        teamId: 5,
        userId: 1, // created by user 1
        assigneeId: 2, // assigned to user 2
      };

      const perms = getTaskPermissions(userAssignee, task, team);
      assert.equal(perms.canReturnTask, true);
    });

    it('denies creator from returning their own created task', () => {
      const task: Task = {
        id: 100,
        title: 'Self-assigned or created task',
        status: 'TODO',
        teamId: 5,
        userId: 1,
        assigneeId: 1,
      };

      const perms = getTaskPermissions(userCreator, task, team);
      assert.equal(perms.canReturnTask, false);
    });

    it('denies return on DONE task even for assignee', () => {
      const task: Task = {
        id: 100,
        title: 'Completed task',
        status: 'DONE',
        teamId: 5,
        userId: 1,
        assigneeId: 2,
      };

      const perms = getTaskPermissions(userAssignee, task, team);
      assert.equal(perms.canReturnTask, false);
    });

    it('denies return on personal tasks without a team', () => {
      const task: Task = {
        id: 101,
        title: 'Personal task',
        status: 'TODO',
        userId: 1,
        assigneeId: 2,
      };

      const perms = getTaskPermissions(userAssignee, task, null);
      assert.equal(perms.canReturnTask, false);
    });
  });

  describe('TaskReturnAction Reason Validation', () => {
    function validateReturnReason(reason: string): string | null {
      const trimmed = reason.trim();
      if (!trimmed || trimmed.length === 0) {
        return 'Vui lòng nhập lý do trả lại công việc';
      }
      if (trimmed.length < 3) {
        return 'Lý do phải có ít nhất 3 ký tự';
      }
      if (trimmed.length > 500) {
        return 'Lý do không được vượt quá 500 ký tự';
      }
      return null;
    }

    it('rejects empty or whitespace-only reason', () => {
      assert.equal(validateReturnReason(''), 'Vui lòng nhập lý do trả lại công việc');
      assert.equal(validateReturnReason('   '), 'Vui lòng nhập lý do trả lại công việc');
    });

    it('rejects reason shorter than 3 characters', () => {
      assert.equal(validateReturnReason('ab'), 'Lý do phải có ít nhất 3 ký tự');
      assert.equal(validateReturnReason('  x  '), 'Lý do phải có ít nhất 3 ký tự');
    });

    it('rejects reason longer than 500 characters', () => {
      const longReason = 'a'.repeat(501);
      assert.equal(validateReturnReason(longReason), 'Lý do không được vượt quá 500 ký tự');
    });

    it('accepts valid reason between 3 and 500 characters', () => {
      assert.equal(
        validateReturnReason('Tôi không đủ thẩm quyền xử lý đầu việc này'),
        null,
      );
    });
  });
});
