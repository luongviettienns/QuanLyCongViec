import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  computeIsFiltering,
  countActiveFilters,
  loadSavedViewMode,
  saveViewMode,
} from '../task-filter.utils.ts';

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
});
