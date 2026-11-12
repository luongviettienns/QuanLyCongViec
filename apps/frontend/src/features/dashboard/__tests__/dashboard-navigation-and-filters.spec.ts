import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../../teams/types/team.types.ts';
import {
  DASHBOARD_STAT_CARD_PATCHES,
  buildDashboardNavigationPatch,
  resolveDashboardCreateTaskTeamId,
  buildDashboardStatsParams,
} from '../utils/dashboard-navigation.utils.ts';

describe('Dashboard Navigation & Context Filters Integration', () => {
  describe('Stat Cards Click Patches Contract', () => {
    it('generates empty patch for Total card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.total, {});
    });

    it('generates statusFilter TODO for Todo card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.todo, { statusFilter: 'TODO' });
    });

    it('generates statusFilter IN_PROGRESS for In Progress card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.inProgress, { statusFilter: 'IN_PROGRESS' });
    });

    it('generates statusFilter DONE for Done card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.done, { statusFilter: 'DONE' });
    });

    it('generates statusFilter ALL and deadlineFilter overdue for Overdue card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.overdue, {
        statusFilter: 'ALL',
        deadlineFilter: 'overdue',
      });
    });

    it('generates statusFilter ALL and deadlineFilter due_soon for DueSoon card', () => {
      assert.deepEqual(DASHBOARD_STAT_CARD_PATCHES.dueSoon, {
        statusFilter: 'ALL',
        deadlineFilter: 'due_soon',
      });
    });
  });

  describe('buildDashboardNavigationPatch (Context Preservation)', () => {
    it('preserves team and scope when navigating from Total card', () => {
      const patch = buildDashboardNavigationPatch(12, 'my_work', DASHBOARD_STAT_CARD_PATCHES.total);
      assert.deepEqual(patch, {
        teamFilter: 12,
        scopeFilter: 'my_work',
      });
    });

    it('merges status filter while preserving team and scope context', () => {
      const patch = buildDashboardNavigationPatch(5, 'assigned_to_me', DASHBOARD_STAT_CARD_PATCHES.todo);
      assert.deepEqual(patch, {
        teamFilter: 5,
        scopeFilter: 'assigned_to_me',
        statusFilter: 'TODO',
      });
    });

    it('merges deadline filter while preserving team and scope context', () => {
      const patch = buildDashboardNavigationPatch(
        'ALL',
        'collaborating',
        DASHBOARD_STAT_CARD_PATCHES.overdue,
      );
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
