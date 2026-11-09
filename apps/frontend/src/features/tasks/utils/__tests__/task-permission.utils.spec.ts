import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionTask,
  canReorderTask,
  getTaskPermissions,
} from '../task-permission.utils.ts';
import type { Task } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';

describe('Task Permission Utils', () => {
  const currentUser: User = {
    id: 10,
    email: 'user10@example.com',
    name: 'User 10',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const otherUser: User = {
    id: 99,
    email: 'user99@example.com',
    name: 'User 99',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const outsiderUser: User = {
    id: 999,
    email: 'outsider@example.com',
    name: 'Outsider',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockTeam: Team = {
    id: 1,
    name: 'Engineering',
    ownerId: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: 1,
        teamId: 1,
        userId: 100,
        role: 'ADMIN',
        joinedAt: new Date().toISOString(),
        user: { id: 100, name: 'Owner', email: 'owner@example.com' },
      },
      {
        id: 2,
        teamId: 1,
        userId: 200,
        role: 'ADMIN',
        joinedAt: new Date().toISOString(),
        user: { id: 200, name: 'Admin', email: 'admin@example.com' },
      },
      {
        id: 3,
        teamId: 1,
        userId: 10,
        role: 'MEMBER',
        joinedAt: new Date().toISOString(),
        user: { id: 10, name: 'User 10', email: 'user10@example.com' },
      },
      {
        id: 4,
        teamId: 1,
        userId: 99,
        role: 'MEMBER',
        joinedAt: new Date().toISOString(),
        user: { id: 99, name: 'User 99', email: 'user99@example.com' },
      },
    ],
  };

  describe('Personal Tasks', () => {
    const personalTask: Task = {
      id: 1,
      userId: 10,
      title: 'My personal task',
      status: 'TODO',
    };

    it('creator has full permissions: can reorder, edit, delete, and transition to any status', () => {
      const perms = getTaskPermissions(currentUser, personalTask);
      assert.equal(perms.canEditContent, true);
      assert.equal(perms.canDelete, true);
      assert.equal(perms.canReorder, true);
      assert.equal(canReorderTask(currentUser, personalTask), true);
      assert.equal(perms.canDrag, true);
      assert.equal(canTransitionTask(currentUser, personalTask, 'IN_PROGRESS'), true);
      assert.equal(canTransitionTask(currentUser, personalTask, 'DONE'), true);
    });

    it('other user has no permissions on personal task: cannot drag, reorder or edit', () => {
      const perms = getTaskPermissions(otherUser, personalTask);
      assert.equal(perms.canEditContent, false);
      assert.equal(perms.canDelete, false);
      assert.equal(perms.canReorder, false);
      assert.equal(canReorderTask(otherUser, personalTask), false);
      assert.equal(perms.canDrag, false);
      assert.match(perms.dragDisabledReason || '', /không có quyền/);
    });
  });

  describe('Team Tasks: Assignee Role', () => {
    it('Assignee on TODO cannot reorder team board, but CAN drag/transition to IN_PROGRESS', () => {
      const task: Task = {
        id: 2,
        title: 'Task 2',
        userId: 99, // created by someone else
        assigneeId: 10, // assigned to currentUser
        teamId: 1,
        status: 'TODO',
      };

      const perms = getTaskPermissions(currentUser, task, mockTeam);
      assert.equal(perms.canReorder, false); // Team board priority is managed by Owner/Admin
      assert.equal(perms.canDrag, true); // But can drag because they can transition to IN_PROGRESS
      assert.equal(canTransitionTask(currentUser, task, 'IN_PROGRESS', mockTeam), true);
      assert.equal(canTransitionTask(currentUser, task, 'DONE', mockTeam), false);
      assert.deepEqual(perms.allowedNextStatuses, ['IN_PROGRESS']);
    });

    it('Assignee on IN_PROGRESS cannot reorder team board, but CAN drag/transition to DONE', () => {
      const task: Task = {
        id: 3,
        title: 'Task 3',
        userId: 99,
        assigneeId: 10,
        teamId: 1,
        status: 'IN_PROGRESS',
      };

      const perms = getTaskPermissions(currentUser, task, mockTeam);
      assert.equal(perms.canReorder, false);
      assert.equal(perms.canDrag, true);
      assert.equal(canTransitionTask(currentUser, task, 'DONE', mockTeam), true);
      assert.equal(canTransitionTask(currentUser, task, 'TODO', mockTeam), false);
      assert.deepEqual(perms.allowedNextStatuses, ['DONE']);
    });

    it('Assignee on DONE cannot reorder, cannot reopen, and cannot drag', () => {
      const task: Task = {
        id: 4,
        title: 'Task 4',
        userId: 99,
        assigneeId: 10,
        teamId: 1,
        status: 'DONE',
      };

      const perms = getTaskPermissions(currentUser, task, mockTeam);
      assert.equal(perms.canReorder, false);
      assert.equal(perms.canDrag, false);
      assert.equal(canTransitionTask(currentUser, task, 'TODO', mockTeam), false);
      assert.equal(canTransitionTask(currentUser, task, 'IN_PROGRESS', mockTeam), false);
      assert.equal(perms.canChangeStatus, false);
      assert.deepEqual(perms.allowedNextStatuses, []);
      assert.equal(perms.canEditContent, false);
      assert.equal(perms.canChangeAssignee, false);
    });
  });

  describe('Team Tasks: Regular Member (Neither Creator nor Assignee)', () => {
    it('Regular Member CANNOT reorder team board, CANNOT transition, edit, or delete', () => {
      const task: Task = {
        id: 5,
        title: 'Task 5',
        userId: 99,
        assigneeId: 99,
        teamId: 1,
        status: 'TODO',
      };

      const perms = getTaskPermissions(currentUser, task, mockTeam);
      assert.equal(perms.canReorder, false);
      assert.equal(perms.canDrag, false);
      assert.equal(perms.canChangeStatus, false);
      assert.deepEqual(perms.allowedNextStatuses, []);
      assert.equal(canTransitionTask(currentUser, task, 'IN_PROGRESS', mockTeam), false);
      assert.equal(canTransitionTask(currentUser, task, 'DONE', mockTeam), false);
      assert.equal(perms.canEditContent, false);
      assert.equal(perms.canDelete, false);
    });
  });

  describe('Team Tasks: Outsider (Non-member)', () => {
    it('Outsider has no permissions: cannot reorder, cannot drag, cannot transition', () => {
      const task: Task = {
        id: 8,
        title: 'Task 8',
        userId: 99,
        assigneeId: 99,
        teamId: 1,
        status: 'TODO',
      };

      const perms = getTaskPermissions(outsiderUser, task, mockTeam);
      assert.equal(perms.canReorder, false);
      assert.equal(perms.canDrag, false);
      assert.equal(perms.canChangeStatus, false);
      assert.equal(perms.canEditContent, false);
      assert.equal(perms.canDelete, false);
      assert.match(perms.dragDisabledReason || '', /không có quyền/);
    });
  });

  describe('Team Tasks: Creator Role', () => {
    it('Creator in team CAN transition task and reopen DONE, but cannot reorder unless Admin/Owner', () => {
      const task: Task = {
        id: 6,
        title: 'Task 6',
        userId: 10, // currentUser is creator
        assigneeId: 99, // assigned to someone else
        teamId: 1,
        status: 'DONE',
      };

      const perms = getTaskPermissions(currentUser, task, mockTeam);
      assert.equal(perms.canDrag, true); // can drag because allowedNextStatuses > 0 (can reopen)
      assert.equal(perms.canReorder, false); // regular member creator cannot reorder team board
      assert.equal(perms.canDelete, true);
      assert.equal(canTransitionTask(currentUser, task, 'IN_PROGRESS', mockTeam), true);
      assert.equal(canTransitionTask(currentUser, task, 'TODO', mockTeam), true);
      // Editing content on DONE is locked until reopened:
      assert.equal(perms.canEditContent, false);
    });
  });

  describe('Team Tasks: Team Admin & Owner', () => {
    const adminUser: User = { ...currentUser, id: 200 };
    const ownerUser: User = { ...currentUser, id: 100 };

    it('Admin and Owner CAN reorder team board, delete, and reopen DONE tasks', () => {
      const task: Task = {
        id: 7,
        title: 'Task 7',
        userId: 99,
        assigneeId: 99,
        teamId: 1,
        status: 'DONE',
      };

      const adminPerms = getTaskPermissions(adminUser, task, mockTeam);
      assert.equal(adminPerms.canDrag, true);
      assert.equal(adminPerms.canReorder, true);
      assert.equal(adminPerms.canDelete, true);
      assert.equal(canTransitionTask(adminUser, task, 'IN_PROGRESS', mockTeam), true);

      const ownerPerms = getTaskPermissions(ownerUser, task, mockTeam);
      assert.equal(ownerPerms.canDrag, true);
      assert.equal(ownerPerms.canReorder, true);
      assert.equal(ownerPerms.canDelete, true);
      assert.equal(canTransitionTask(ownerUser, task, 'TODO', mockTeam), true);
    });
  });
});
