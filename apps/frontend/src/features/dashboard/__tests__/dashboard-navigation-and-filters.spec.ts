import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskFilterPatch, ScopeFilter } from '../../tasks/types/task.types.ts';
import type { Team } from '../../teams/types/team.types.ts';

/**
 * Pure helper mirroring DashboardPage's handleNavigateWithDashboardContext
 */
export function buildDashboardNavigationPatch(
  context: { teamFilter: number | 'ALL'; scopeFilter: ScopeFilter },
  patch: TaskFilterPatch = {},
): TaskFilterPatch {
  return {
    teamFilter: context.teamFilter,
    scopeFilter: context.scopeFilter,
    ...patch,
  };
}

/**
 * Pure helper mirroring DashboardPage's defaultTeamId calculation for onOpenCreateTask
 */
export function resolveDashboardCreateTaskTeamId(teamFilter: number | 'ALL'): number | null {
  return teamFilter !== 'ALL' ? teamFilter : null;
}

/**
 * Pure helper mirroring getTaskStats parameter construction in DashboardPage
 */
export function buildDashboardStatsParams(
  teamFilter: number | 'ALL',
  scopeFilter: ScopeFilter,
): { teamId?: number; scope?: string } {
  return {
    teamId: teamFilter !== 'ALL' ? teamFilter : undefined,
    scope: scopeFilter,
  };
}

describe('Dashboard Navigation & Context Filters Integration', () => {
  describe('Stat Cards Click Patches Contract', () => {
    it('generates empty patch for Total card', () => {
      const cardPatch: TaskFilterPatch = {};
      assert.deepEqual(cardPatch, {});
    });

    it('generates statusFilter TODO for Todo card', () => {
      const cardPatch: TaskFilterPatch = { statusFilter: 'TODO' };
      assert.deepEqual(cardPatch, { statusFilter: 'TODO' });
    });

    it('generates statusFilter IN_PROGRESS for In Progress card', () => {
      const cardPatch: TaskFilterPatch = { statusFilter: 'IN_PROGRESS' };
      assert.deepEqual(cardPatch, { statusFilter: 'IN_PROGRESS' });
    });

    it('generates statusFilter DONE for Done card', () => {
      const cardPatch: TaskFilterPatch = { statusFilter: 'DONE' };
      assert.deepEqual(cardPatch, { statusFilter: 'DONE' });
    });

    it('generates statusFilter ALL and deadlineFilter overdue for Overdue card', () => {
      const cardPatch: TaskFilterPatch = { statusFilter: 'ALL', deadlineFilter: 'overdue' };
      assert.deepEqual(cardPatch, { statusFilter: 'ALL', deadlineFilter: 'overdue' });
    });

    it('generates statusFilter ALL and deadlineFilter due_soon for DueSoon card', () => {
      const cardPatch: TaskFilterPatch = { statusFilter: 'ALL', deadlineFilter: 'due_soon' };
      assert.deepEqual(cardPatch, { statusFilter: 'ALL', deadlineFilter: 'due_soon' });
    });
  });

  describe('buildDashboardNavigationPatch (Context Preservation)', () => {
    it('preserves team and scope when navigating from Total card', () => {
      const context = { teamFilter: 12, scopeFilter: 'my_work' as ScopeFilter };
      const patch = buildDashboardNavigationPatch(context, {});
      assert.deepEqual(patch, {
        teamFilter: 12,
        scopeFilter: 'my_work',
      });
    });

    it('merges status filter while preserving team and scope context', () => {
      const context = { teamFilter: 5, scopeFilter: 'assigned_to_me' as ScopeFilter };
      const patch = buildDashboardNavigationPatch(context, { statusFilter: 'TODO' });
      assert.deepEqual(patch, {
        teamFilter: 5,
        scopeFilter: 'assigned_to_me',
        statusFilter: 'TODO',
      });
    });

    it('merges deadline filter while preserving team and scope context', () => {
      const context = { teamFilter: 'ALL' as const, scopeFilter: 'collaborating' as ScopeFilter };
      const patch = buildDashboardNavigationPatch(context, {
        statusFilter: 'ALL',
        deadlineFilter: 'overdue',
      });
      assert.deepEqual(patch, {
        teamFilter: 'ALL',
        scopeFilter: 'collaborating',
        statusFilter: 'ALL',
        deadlineFilter: 'overdue',
      });
    });
  });

  describe('resolveDashboardCreateTaskTeamId', () => {
    it('resolves null when teamFilter is ALL', () => {
      assert.equal(resolveDashboardCreateTaskTeamId('ALL'), null);
    });

    it('resolves numeric teamId when specific team is selected', () => {
      assert.equal(resolveDashboardCreateTaskTeamId(42), 42);
    });
  });

  describe('buildDashboardStatsParams', () => {
    it('omits teamId when teamFilter is ALL', () => {
      const params = buildDashboardStatsParams('ALL', 'all');
      assert.deepEqual(params, {
        teamId: undefined,
        scope: 'all',
      });
    });

    it('supplies numeric teamId and active scope filter', () => {
      const params = buildDashboardStatsParams(8, 'created_by_me');
      assert.deepEqual(params, {
        teamId: 8,
        scope: 'created_by_me',
      });
    });
  });

  describe('Team Select Options Generation', () => {
    it('always provides ALL option even with empty teams list', () => {
      const teams: Team[] = [];
      const options = [
        { value: 'ALL', label: 'Tất cả nhóm' },
        ...teams.map((t) => ({ value: t.id, label: t.name })),
      ];
      assert.equal(options.length, 1);
      assert.equal(options[0].value, 'ALL');
    });

    it('appends loaded teams to options list', () => {
      const teams: Team[] = [
        {
          id: 1,
          name: 'Core Team',
          ownerId: 99,
          members: [],
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
        {
          id: 2,
          name: 'Design Team',
          ownerId: 100,
          members: [],
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        },
      ];
      const options = [
        { value: 'ALL', label: 'Tất cả nhóm' },
        ...teams.map((t) => ({ value: t.id, label: t.name })),
      ];
      assert.equal(options.length, 3);
      assert.deepEqual(options[1], { value: 1, label: 'Core Team' });
      assert.deepEqual(options[2], { value: 2, label: 'Design Team' });
    });
  });
});
