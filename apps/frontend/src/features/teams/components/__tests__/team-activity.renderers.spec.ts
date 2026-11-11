import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_RENDERERS, renderActivityItem } from '../team-activity.renderers.ts';
import type { TeamActivityAction, TeamActivityLog } from '../../types/team.types.ts';

describe('Team Activity Renderers', () => {
  const ALL_ACTIONS: TeamActivityAction[] = [
    'ADD_MEMBER',
    'REMOVE_MEMBER',
    'LEAVE_TEAM',
    'CHANGE_ROLE',
    'TRANSFER_OWNER',
    'TASK_CREATED',
    'TASK_STATUS_CHANGED',
    'TASK_ASSIGNED',
    'TASK_UNASSIGNED',
    'TASK_DELETED',
    'TASK_RESTORED',
    'TASK_RETURNED',
    'TASK_MOVED_OUT',
    'TASK_MOVED_IN',
    'TASK_DEADLINE_CHANGED',
    'TASK_PRIORITY_CHANGED',
    'TASK_UPDATED',
    'SUBTASK_COMPLETED',
    'SUBTASK_REOPENED',
    'COLLABORATOR_INVITED',
    'COLLABORATOR_ACCEPTED',
    'COLLABORATOR_DECLINED',
    'COLLABORATOR_REMOVED',
    'COLLABORATOR_ADDED',
  ];

  it('should have a renderer defined for every TeamActivityAction enum member', () => {
    ALL_ACTIONS.forEach((action) => {
      assert.ok(ACTION_RENDERERS[action], `Missing renderer for action: ${action}`);
      assert.strictEqual(typeof ACTION_RENDERERS[action], 'function');
    });
  });

  it('should render each action without throwing errors even with partial metadata', () => {
    ALL_ACTIONS.forEach((action) => {
      const mockLog: TeamActivityLog = {
        id: 1,
        teamIdSnapshot: 10,
        teamNameSnapshot: 'Test Team',
        teamId: 10,
        actorId: 1,
        targetUserId: 2,
        action,
        oldRole: 'MEMBER',
        newRole: 'ADMIN',
        metadata: {
          taskTitle: 'Feature Implementation',
          subtaskTitle: 'Unit Test',
          oldStatus: 'TODO',
          newStatus: 'IN_PROGRESS',
          oldDueDate: '2026-11-15',
          newDueDate: '2026-11-20',
          oldPriority: 'MEDIUM',
          newPriority: 'HIGH',
          changedFields: ['title', 'description'],
          reason: 'Need rework',
          revokedCollaboratorCount: 2,
        },
        createdAt: new Date().toISOString(),
        actor: { id: 1, name: 'Alice', email: 'alice@example.com' },
        targetUser: { id: 2, name: 'Bob', email: 'bob@example.com' },
      };

      const result = renderActivityItem(mockLog);
      assert.ok(result);
      assert.ok(result.icon);
      assert.ok(result.titleNode);
      assert.ok(result.detailNode);
    });
  });

  it('should fallback gracefully when metadata and actor are undefined/null', () => {
    const minimalLog: TeamActivityLog = {
      id: 99,
      teamIdSnapshot: 1,
      teamNameSnapshot: 'Test',
      teamId: 1,
      actorId: null,
      targetUserId: null,
      action: 'TASK_CREATED',
      oldRole: null,
      newRole: null,
      metadata: null,
      createdAt: 'invalid-date',
      actor: null,
      targetUser: null,
    };

    const result = renderActivityItem(minimalLog);
    assert.ok(result);
    assert.ok(result.icon);
    assert.ok(result.titleNode);
  });
});
