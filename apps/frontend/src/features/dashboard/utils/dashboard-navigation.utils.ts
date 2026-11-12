import type { TaskFilterPatch, ScopeFilter } from '../../tasks/types/task.types.ts';

export const DASHBOARD_STAT_CARD_PATCHES: Record<
  'total' | 'todo' | 'inProgress' | 'done' | 'overdue' | 'dueSoon',
  TaskFilterPatch
> = {
  total: {},
  todo: { statusFilter: 'TODO' },
  inProgress: { statusFilter: 'IN_PROGRESS' },
  done: { statusFilter: 'DONE' },
  overdue: { statusFilter: 'ALL', deadlineFilter: 'overdue' },
  dueSoon: { statusFilter: 'ALL', deadlineFilter: 'due_soon' },
};

/**
 * Builds task navigation filter patch preserving active dashboard team and scope context.
 */
export function buildDashboardNavigationPatch(
  teamFilter: number | 'ALL',
  scopeFilter: ScopeFilter,
  cardPatch: TaskFilterPatch = {},
): TaskFilterPatch {
  return {
    teamFilter,
    scopeFilter,
    ...cardPatch,
  };
}

/**
 * Resolves the default team ID when opening the create task modal from Dashboard.
 */
export function resolveDashboardCreateTaskTeamId(teamFilter: number | 'ALL'): number | null {
  return teamFilter !== 'ALL' ? teamFilter : null;
}

/**
 * Builds API query parameters for fetching dashboard task statistics.
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
