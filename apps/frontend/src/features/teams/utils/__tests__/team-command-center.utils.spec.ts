import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../../../tasks/types/task.types.ts';
import type { TeamMember } from '../../types/team.types.ts';
import {
  computeTeamCommandMetrics,
  computeMemberWorkloads,
  filterTeamTasks,
  type CommandFilterType,
} from '../team-command-center.utils.ts';

const TODAY = '2026-11-16';

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: 1,
    title: 'Test Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    position: 0,
    userId: 100,
    teamId: 1,
    categoryId: null,
    assigneeId: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('team-command-center.utils', () => {
  const sampleTasks: Task[] = [
    makeTask({ id: 1, title: 'Task 1', status: 'IN_PROGRESS', assigneeId: 10, dueDate: '2026-11-20' }), // due soon
    makeTask({ id: 2, title: 'Task 2', status: 'TODO', assigneeId: 10, dueDate: '2026-11-10' }), // overdue
    makeTask({ id: 3, title: 'Task 3', status: 'DONE', assigneeId: 20, dueDate: '2026-11-10' }), // done, not overdue
    makeTask({ id: 4, title: 'Task 4', status: 'TODO', assigneeId: null, dueDate: null }), // unassigned
    makeTask({ id: 5, title: 'Task 5', status: 'IN_PROGRESS', assigneeId: 20, dueDate: '2026-11-16' }), // today (due soon)
  ];

  it('computes accurate team command metrics', () => {
    const metrics = computeTeamCommandMetrics(sampleTasks, TODAY);
    assert.deepEqual(metrics, {
      total: 5,
      inProgress: 2,
      overdue: 1, // task 2
      done: 1,    // task 3
      unassigned: 1, // task 4
      dueSoon: 2, // task 1 (11-20) and task 5 (11-16)
    });
  });

  it('computes member workloads sorted by taskCount descending', () => {
    const members: TeamMember[] = [
      {
        id: 1,
        userId: 10,
        teamId: 1,
        role: 'MEMBER',
        user: { id: 10, name: 'Alice Nguyen', email: 'alice@example.com' },
      },
      {
        id: 2,
        userId: 20,
        teamId: 1,
        role: 'MEMBER',
        user: { id: 20, name: 'Bob Tran', email: 'bob@example.com' },
      },
      {
        id: 3,
        userId: 30,
        teamId: 1,
        role: 'ADMIN',
        user: { id: 30, name: 'Charlie Le', email: 'charlie@example.com' },
      },
    ];

    const workloads = computeMemberWorkloads(members, sampleTasks, TODAY);
    assert.equal(workloads.length, 3);
    assert.equal(workloads[0].userId, 10);
    assert.equal(workloads[0].taskCount, 2);
    assert.equal(workloads[0].overdueCount, 1);
    assert.equal(workloads[1].userId, 20);
    assert.equal(workloads[1].taskCount, 2);
    assert.equal(workloads[1].overdueCount, 0);
    assert.equal(workloads[2].userId, 30);
    assert.equal(workloads[2].taskCount, 0);
  });

  describe('filterTeamTasks', () => {
    it('filters by status / urgency filterType', () => {
      const overdueTasks = filterTeamTasks(sampleTasks, { filterType: 'overdue', todayKey: TODAY });
      assert.equal(overdueTasks.length, 1);
      assert.equal(overdueTasks[0].id, 2);

      const inProgressTasks = filterTeamTasks(sampleTasks, { filterType: 'in_progress', todayKey: TODAY });
      assert.equal(inProgressTasks.length, 2);

      const unassignedTasks = filterTeamTasks(sampleTasks, { filterType: 'unassigned', todayKey: TODAY });
      assert.equal(unassignedTasks.length, 1);
      assert.equal(unassignedTasks[0].id, 4);

      const dueSoonTasks = filterTeamTasks(sampleTasks, { filterType: 'due_soon', todayKey: TODAY });
      assert.equal(dueSoonTasks.length, 2);
    });

    it('filters by assignee and search query', () => {
      const aliceTasks = filterTeamTasks(sampleTasks, { assigneeId: 10, todayKey: TODAY });
      assert.equal(aliceTasks.length, 2);

      const searched = filterTeamTasks(sampleTasks, { searchQuery: 'Task 3', todayKey: TODAY });
      assert.equal(searched.length, 1);
      assert.equal(searched[0].id, 3);
    });
  });
});
