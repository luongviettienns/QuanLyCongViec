import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  computeIsFiltering,
  countActiveFilters,
  countActiveToolbarFilters,
  hasAnyToolbarFilter,
  formatCountLabel,
  shouldShowPendingInvitesShortcut,
  loadSavedViewMode,
  saveViewMode,
  buildAssigneeOptions,
} from '../task-filter.utils.ts';
import type { Team } from '../../../teams/types/team.types.ts';

describe('task-filter.utils', () => {
  it('teamFilter change does not turn on isFiltering and clears team-scoped category/assignee', () => {
    const base = createDefaultTaskFilters();
    const withTeam = applyFilterPatch(base, {
      teamFilter: 5,
      categoryFilter: 12,
      assigneeFilter: 3,
    });
    assert.equal(computeIsFiltering(applyFilterPatch(base, { teamFilter: 5 })), false);

    const switchedTeam = applyFilterPatch(withTeam, { teamFilter: 9 });
    assert.equal(switchedTeam.categoryFilter, 'ALL');
    assert.equal(switchedTeam.assigneeFilter, 'ALL');
  });

  it('activates isFiltering for deadlineFilter, assigneeFilter, sortBy, and counts active filters accurately', () => {
    const base = createDefaultTaskFilters();
    const overdue = applyFilterPatch(base, { deadlineFilter: 'overdue' });
    assert.equal(computeIsFiltering(overdue), true);
    assert.equal(countActiveFilters(overdue), 1);

    const sorted = applyFilterPatch(base, { sortBy: 'due_date_asc', assigneeFilter: 7 });
    assert.equal(computeIsFiltering(sorted), true);
    assert.equal(countActiveFilters(sorted), 2);
  });

  it('handles loadSavedViewMode and saveViewMode safely in non-browser or browser environment', () => {
    // In node environment without window, returns 'both'
    assert.equal(loadSavedViewMode(), 'both');
    saveViewMode('kanban'); // safe no-op

    // Mock window.localStorage
    const store: Record<string, string> = {};
    const mockWindow = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    };
    (globalThis as unknown as { window?: typeof mockWindow }).window = mockWindow;

    try {
      assert.equal(loadSavedViewMode(), 'both');
      saveViewMode('kanban');
      assert.equal(loadSavedViewMode(), 'kanban');
      saveViewMode('table');
      assert.equal(loadSavedViewMode(), 'table');
      // trash mode should not be saved
      saveViewMode('trash');
      assert.equal(loadSavedViewMode(), 'table');
    } finally {
      delete (globalThis as unknown as { window?: typeof mockWindow }).window;
    }
  });

  it('buildAssigneeOptions deduplicates team members and tags current user', () => {
    const teams: Team[] = [
      {
        id: 1,
        name: 'Team 1',
        ownerId: 10,
        owner: { id: 10, name: 'Alice', email: 'alice@test.com' },
        members: [
          {
            id: 101,
            teamId: 1,
            userId: 20,
            role: 'MEMBER',
            joinedAt: '',
            user: { id: 20, name: 'Bob', email: 'bob@test.com' },
          },
        ],
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 2,
        name: 'Team 2',
        ownerId: 20,
        owner: { id: 20, name: 'Bob', email: 'bob@test.com' },
        members: [
          {
            id: 102,
            teamId: 2,
            userId: 30,
            role: 'MEMBER',
            joinedAt: '',
            user: { id: 30, name: 'Charlie', email: 'charlie@test.com' },
          },
        ],
        createdAt: '',
        updatedAt: '',
      },
    ];

    // Across all teams
    const allOptions = buildAssigneeOptions(teams, 'ALL', 20);
    assert.deepEqual(allOptions, [
      { value: 'ALL', label: 'Tất cả người phụ trách' },
      { value: 10, label: 'Alice' },
      { value: 20, label: 'Bob (Tôi)' },
      { value: 30, label: 'Charlie' },
    ]);

    // Filter by Team 1
    const team1Options = buildAssigneeOptions(teams, 1, 20);
    assert.deepEqual(team1Options, [
      { value: 'ALL', label: 'Tất cả người phụ trách' },
      { value: 10, label: 'Alice' },
      { value: 20, label: 'Bob (Tôi)' },
    ]);

    // External user not in any team added to ALL options
    const externalUserOptions = buildAssigneeOptions(teams, 'ALL', 99);
    assert.deepEqual(externalUserOptions, [
      { value: 'ALL', label: 'Tất cả người phụ trách' },
      { value: 10, label: 'Alice' },
      { value: 20, label: 'Bob' },
      { value: 30, label: 'Charlie' },
      { value: 99, label: 'Tôi' },
    ]);
  });

  it('countActiveToolbarFilters and hasAnyToolbarFilter handle active vs trash modes cleanly', () => {
    const base = createDefaultTaskFilters();
    assert.equal(countActiveToolbarFilters(base, false), 0);
    assert.equal(hasAnyToolbarFilter(base, false), false);

    // Status, deadlineFilter, sortBy, and scopeFilter are ignored in trash mode
    const withActiveOnly = applyFilterPatch(base, {
      statusFilter: 'DONE',
      deadlineFilter: 'overdue',
      sortBy: 'due_date_asc',
      scopeFilter: 'pending_invites',
      priorityFilter: 'HIGH',
    });
    assert.equal(countActiveToolbarFilters(withActiveOnly, false), 4);
    assert.equal(hasAnyToolbarFilter(withActiveOnly, false), true);

    // In trash mode only categoryFilter, priorityFilter, assigneeFilter count as secondary filters
    assert.equal(countActiveToolbarFilters(withActiveOnly, true), 1);
    assert.equal(hasAnyToolbarFilter(withActiveOnly, true), true);

    const onlyHiddenTrashFilters = applyFilterPatch(base, {
      statusFilter: 'TODO',
      scopeFilter: 'my_work',
    });
    assert.equal(countActiveToolbarFilters(onlyHiddenTrashFilters, true), 0);
    assert.equal(hasAnyToolbarFilter(onlyHiddenTrashFilters, true), false);
    assert.equal(hasAnyToolbarFilter(applyFilterPatch(base, { teamFilter: 3 }), true), true);
  });

  it('formatCountLabel and shouldShowPendingInvitesShortcut format badges and visibility accurately', () => {
    assert.equal(formatCountLabel('Thùng rác'), 'Thùng rác');
    assert.equal(formatCountLabel('Thùng rác', 0), 'Thùng rác');
    assert.equal(formatCountLabel('Thùng rác', -2), 'Thùng rác');
    assert.equal(formatCountLabel('Thùng rác', 4), 'Thùng rác (4)');
    assert.equal(formatCountLabel('Lời mời chờ', 2), 'Lời mời chờ (2)');

    assert.equal(shouldShowPendingInvitesShortcut(false, 'all', 2), true);
    assert.equal(shouldShowPendingInvitesShortcut(false, 'pending_invites', 2), false);
    assert.equal(shouldShowPendingInvitesShortcut(false, 'all', 0), false);
    assert.equal(shouldShowPendingInvitesShortcut(true, 'all', 5), false);
  });
});
