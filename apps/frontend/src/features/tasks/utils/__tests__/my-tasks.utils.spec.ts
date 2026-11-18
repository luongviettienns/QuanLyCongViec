import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMyTaskRole,
  getVietnamTodayKey,
  getVietnamDateDiffDays,
  computeMyTasksStats,
  createDefaultMyTasksFilterState,
  toggleMyTasksDeadlineCard,
  selectMyTasksStatusTab,
  filterAndSortMyTasks,
  getQuickStatusAction,
  resolveDashboardNavigationTarget,
  resolveOpenedModalTask,
} from '../my-tasks.utils.ts';
import type { Task } from '../../types/task.types.ts';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    userId: 10,
    title: 'Sample task',
    status: 'TODO',
    priority: 'MEDIUM',
    teamId: null,
    assigneeId: null,
    dueDate: null,
    createdAt: '2026-11-18T02:00:00.000Z',
    updatedAt: '2026-11-18T02:00:00.000Z',
    collaborators: [],
    subtasks: [],
    ...overrides,
  };
}

describe('my-tasks.utils', () => {
  it('classifies personal, assignee, collaborator, and historical subtask_only roles while extracting mySubtasks', () => {
    const personal = makeTask({ id: 1, teamId: null, userId: 10, assigneeId: null });
    assert.equal(classifyMyTaskRole(personal, 10).roleKind, 'personal');

    const assigneeWithSub = makeTask({
      id: 2,
      teamId: 5,
      userId: 99,
      assigneeId: 10,
      subtasks: [
        {
          id: 101,
          taskId: 2,
          title: 'Write docs',
          status: 'TODO',
          position: 0,
          assigneeId: 10,
          createdById: 99,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 102,
          taskId: 2,
          title: 'Done step',
          status: 'DONE',
          position: 1,
          assigneeId: 10,
          createdById: 99,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    const assigneeClass = classifyMyTaskRole(assigneeWithSub, 10);
    assert.equal(assigneeClass.roleKind, 'assignee');
    assert.equal(assigneeClass.mySubtasks.length, 2);
    assert.equal(assigneeClass.myPendingSubtasks.length, 1);

    const collab = makeTask({
      id: 3,
      teamId: 5,
      userId: 99,
      assigneeId: 20,
      collaborators: [
        {
          id: 50,
          taskId: 3,
          userId: 10,
          status: 'ACCEPTED',
          invitedById: 99,
          invitedAt: '',
        },
      ],
    });
    assert.equal(classifyMyTaskRole(collab, 10).roleKind, 'collaborator');

    const historicalSubtaskOnly = makeTask({
      id: 4,
      teamId: 5,
      userId: 99,
      assigneeId: 20,
      subtasks: [
        {
          id: 103,
          taskId: 4,
          title: 'Historical completed subtask',
          status: 'DONE',
          position: 0,
          assigneeId: 10,
          createdById: 99,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
    assert.equal(classifyMyTaskRole(historicalSubtaskOnly, 10).roleKind, 'subtask_only');
  });

  it('computes Vietnam timezone day diffs around midnight UTC and mutually exclusive stat cards excluding DONE', () => {
    // 2026-11-17T17:30:00Z = 2026-11-18 00:30 +07:00
    const refDate = new Date('2026-11-17T17:30:00.000Z');
    assert.equal(getVietnamTodayKey(refDate), '2026-11-18');
    assert.equal(getVietnamDateDiffDays('2026-11-17', refDate), -1);
    assert.equal(getVietnamDateDiffDays('2026-11-18', refDate), 0);
    assert.equal(getVietnamDateDiffDays('2026-11-25', refDate), 7);
    assert.equal(getVietnamDateDiffDays('2026-11-26', refDate), 8);

    const tasks: Task[] = [
      makeTask({ id: 1, status: 'TODO', dueDate: '2026-11-17' }), // overdue
      makeTask({ id: 2, status: 'IN_PROGRESS', dueDate: '2026-11-18' }), // today
      makeTask({ id: 3, status: 'TODO', dueDate: '2026-11-20' }), // upcoming (+2)
      makeTask({ id: 4, status: 'TODO', dueDate: '2026-11-25' }), // upcoming (+7)
      makeTask({ id: 5, status: 'TODO', dueDate: '2026-11-26' }), // beyond 7 days (+8)
      makeTask({ id: 6, status: 'DONE', dueDate: '2026-11-17' }), // DONE excluded from overdue
      makeTask({ id: 7, status: 'DONE', dueDate: '2026-11-18' }), // DONE excluded from today
    ];

    const stats = computeMyTasksStats(tasks, refDate);
    assert.deepEqual(stats, {
      overdue: 1,
      today: 1,
      upcoming: 2,
      all: 7,
      todo: 4,
      inProgress: 1,
      done: 2,
    });
  });

  it('handles stat-card <-> DONE tab auto-switching cleanly without empty deadlocks', () => {
    const base = createDefaultMyTasksFilterState();

    // Selecting overdue from DONE switches statusTab back to ALL
    const inDone = selectMyTasksStatusTab(base, 'DONE');
    const overdueFromDone = toggleMyTasksDeadlineCard(inDone, 'overdue');
    assert.equal(overdueFromDone.deadlineCard, 'overdue');
    assert.equal(overdueFromDone.statusTab, 'ALL');

    // Selecting DONE while overdue is active clears deadlineCard
    const doneFromOverdue = selectMyTasksStatusTab(overdueFromDone, 'DONE');
    assert.equal(doneFromOverdue.statusTab, 'DONE');
    assert.equal(doneFromOverdue.deadlineCard, null);

    // Selecting IN_PROGRESS keeps active deadlineCard (valid intersection)
    const inProgressAndOverdue = selectMyTasksStatusTab(overdueFromDone, 'IN_PROGRESS');
    assert.equal(inProgressAndOverdue.statusTab, 'IN_PROGRESS');
    assert.equal(inProgressAndOverdue.deadlineCard, 'overdue');

    // Toggling the same card turns it off
    const toggledOff = toggleMyTasksDeadlineCard(inProgressAndOverdue, 'overdue');
    assert.equal(toggledOff.deadlineCard, null);
  });

  it('filters by has_my_subtasks across roles, searches title/team/subtask, and sorts accurately', () => {
    const refDate = new Date('2026-11-18T03:00:00.000Z'); // 2026-11-18 10:00 VN
    const tasks: Task[] = [
      makeTask({
        id: 1,
        title: 'Done overdue task',
        status: 'DONE',
        priority: 'HIGH',
        dueDate: '2026-11-15',
        updatedAt: '2026-11-18T01:00:00.000Z',
      }),
      makeTask({
        id: 2,
        title: 'Team API Refactor',
        status: 'TODO',
        priority: 'LOW',
        teamId: 3,
        team: { id: 3, name: 'Backend Core' },
        assigneeId: 10,
        dueDate: '2026-11-17', // overdue
        updatedAt: '2026-11-18T03:00:00.000Z',
        subtasks: [
          {
            id: 201,
            taskId: 2,
            title: 'Migrate Prisma pool',
            status: 'TODO',
            position: 0,
            assigneeId: 10,
            createdById: 99,
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
      makeTask({
        id: 3,
        title: 'Collaborator UI Review',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        teamId: 4,
        team: { id: 4, name: 'Design System' },
        assigneeId: 20,
        dueDate: '2026-11-18', // today
        updatedAt: '2026-11-18T05:00:00.000Z',
        collaborators: [
          {
            id: 301,
            taskId: 3,
            userId: 10,
            status: 'ACCEPTED',
            invitedById: 20,
            invitedAt: '',
          },
        ],
        subtasks: [
          {
            id: 202,
            taskId: 3,
            title: 'Verify mobile drawer',
            status: 'IN_PROGRESS',
            position: 0,
            assigneeId: 10,
            createdById: 20,
            createdAt: '',
            updatedAt: '',
          },
        ],
      }),
      makeTask({
        id: 4,
        title: 'No deadline backlog',
        status: 'TODO',
        priority: 'HIGH',
        dueDate: null,
        updatedAt: '2026-11-18T02:00:00.000Z',
      }),
    ];

    // smart_deadline: unfinished overdue (2) -> today (3) -> no deadline (4) -> DONE (1)
    const defaultSorted = filterAndSortMyTasks(
      tasks,
      createDefaultMyTasksFilterState(),
      10,
      refDate,
    );
    assert.deepEqual(
      defaultSorted.map((t) => t.id),
      [2, 3, 4, 1],
    );

    // has_my_subtasks matches BOTH assignee (id 2) AND collaborator (id 3)
    const withSubtasks = filterAndSortMyTasks(
      tasks,
      { ...createDefaultMyTasksFilterState(), roleFilter: 'has_my_subtasks' },
      10,
      refDate,
    );
    assert.deepEqual(
      withSubtasks.map((t) => t.id),
      [2, 3],
    );

    // Search matches assigned subtask title
    const searchSubtask = filterAndSortMyTasks(
      tasks,
      { ...createDefaultMyTasksFilterState(), searchText: 'prisma pool' },
      10,
      refDate,
    );
    assert.deepEqual(
      searchSubtask.map((t) => t.id),
      [2],
    );

    // priority_desc puts HIGH before LOW, tie-breaking by dueDate asc
    const byPriority = filterAndSortMyTasks(
      tasks,
      { ...createDefaultMyTasksFilterState(), sortBy: 'priority_desc' },
      10,
      refDate,
    );
    assert.deepEqual(
      byPriority.map((t) => t.id),
      [1, 3, 4, 2],
    );
  });

  it('resolves quick status action strictly respecting 3-state workflow permissions', () => {
    const todoTask = makeTask({ status: 'TODO' });
    const inProgressTask = makeTask({ status: 'IN_PROGRESS' });
    const doneTask = makeTask({ status: 'DONE' });

    assert.deepEqual(
      getQuickStatusAction(todoTask, {
        canChangeStatus: true,
        allowedNextStatuses: ['IN_PROGRESS'],
      }),
      { targetStatus: 'IN_PROGRESS', label: 'Bắt đầu' },
    );

    assert.deepEqual(
      getQuickStatusAction(inProgressTask, {
        canChangeStatus: true,
        allowedNextStatuses: ['DONE'],
      }),
      { targetStatus: 'DONE', label: 'Hoàn thành' },
    );

    assert.equal(
      getQuickStatusAction(doneTask, {
        canChangeStatus: true,
        allowedNextStatuses: ['TODO', 'IN_PROGRESS'],
      }),
      null,
    );

    assert.equal(
      getQuickStatusAction(todoTask, {
        canChangeStatus: false,
        allowedNextStatuses: [],
      }),
      null,
    );
  });

  it('routes Dashboard drill-down to my_tasks only when my_work has no teamId and is not due_soon', () => {
    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'my_work',
        deadlineFilter: 'overdue',
      }),
      {
        viewMode: 'my_tasks',
        preset: { statusTab: 'ALL', deadlineCard: 'overdue' },
      },
    );

    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'my_work',
        statusFilter: 'IN_PROGRESS',
      }),
      {
        viewMode: 'my_tasks',
        preset: { statusTab: 'IN_PROGRESS', deadlineCard: null },
      },
    );

    // Specific team falls back to table so team filter is preserved 1-to-1
    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'my_work',
        teamFilter: 5,
      }),
      { viewMode: 'table', preset: null },
    );

    // due_soon (0..6 days including today) falls back to table to match exact Dashboard count
    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'my_work',
        deadlineFilter: 'due_soon',
      }),
      { viewMode: 'table', preset: null },
    );

    // Non-my_work scope goes to table
    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'all',
        statusFilter: 'TODO',
      }),
      { viewMode: 'table', preset: null },
    );

    // statusFilter INCOMPLETE falls back to table cleanly
    assert.deepEqual(
      resolveDashboardNavigationTarget({
        scopeFilter: 'my_work',
        statusFilter: 'INCOMPLETE',
      }),
      { viewMode: 'table', preset: null },
    );
  });

  it('resolveOpenedModalTask preserves fresher openedTask subtasks when canonical listTask has same or older updatedAt', () => {
    const staleListTask = makeTask({
      id: 7,
      title: 'Sync test',
      updatedAt: '2026-11-18T05:00:00.000Z',
      subtasks: [
        {
          id: 1,
          taskId: 7,
          title: 'Sub 1',
          status: 'TODO',
          position: 0,
          createdById: 10,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    const fresherOpenedTask = makeTask({
      id: 7,
      title: 'Sync test',
      updatedAt: '2026-11-18T05:00:00.000Z', // subtask mutation does not bump parent Task.updatedAt
      subtasks: [
        {
          id: 1,
          taskId: 7,
          title: 'Sub 1',
          status: 'DONE',
          position: 0,
          createdById: 10,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });

    const resolved = resolveOpenedModalTask(fresherOpenedTask, staleListTask, null);
    assert.equal(resolved.subtasks?.[0]?.status, 'DONE');

    // Strictly newer canonical listTask wins
    const newerListTask = makeTask({
      id: 7,
      title: 'Renamed on server',
      updatedAt: '2026-11-18T05:05:00.000Z',
      subtasks: fresherOpenedTask.subtasks,
    });
    const resolvedNewer = resolveOpenedModalTask(fresherOpenedTask, newerListTask, null);
    assert.equal(resolvedNewer.title, 'Renamed on server');

    // Newer SSE override wins over both
    const sseOverride = makeTask({
      id: 7,
      title: 'SSE Override Title',
      updatedAt: '2026-11-18T05:06:00.000Z',
    });
    const resolvedOverride = resolveOpenedModalTask(fresherOpenedTask, newerListTask, sseOverride);
    assert.equal(resolvedOverride.title, 'SSE Override Title');
  });
});
