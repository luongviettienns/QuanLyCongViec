import type {
  ScopeFilter,
  TaskFilterPatch,
  TaskFilterState,
  TaskViewMode,
  TeamFilterValue,
} from '../types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';

const VIEW_MODE_STORAGE_KEY = 'taskflow.tasksViewMode';

export function createDefaultTaskFilters(): TaskFilterState {
  return {
    searchText: '',
    statusFilter: 'ALL',
    categoryFilter: 'ALL',
    priorityFilter: 'ALL',
    teamFilter: 'ALL',
    assigneeFilter: 'ALL',
    scopeFilter: 'all',
    deadlineFilter: 'ALL',
    sortBy: 'default',
  };
}

export function applyFilterPatch(current: TaskFilterState, patch: TaskFilterPatch): TaskFilterState {
  const next: TaskFilterState = { ...current, ...patch };
  if (patch.teamFilter !== undefined && patch.teamFilter !== current.teamFilter) {
    if (patch.categoryFilter === undefined) {
      next.categoryFilter = 'ALL';
    }
    if (patch.assigneeFilter === undefined) {
      next.assigneeFilter = 'ALL';
    }
  }
  return next;
}

export function computeIsFiltering(filters: TaskFilterState): boolean {
  return (
    filters.searchText.trim().length > 0 ||
    filters.statusFilter !== 'ALL' ||
    filters.categoryFilter !== 'ALL' ||
    filters.priorityFilter !== 'ALL' ||
    filters.scopeFilter !== 'all' ||
    filters.assigneeFilter !== 'ALL' ||
    filters.deadlineFilter !== 'ALL' ||
    filters.sortBy !== 'default'
  );
}

export function countActiveFilters(filters: TaskFilterState): number {
  let count = 0;
  if (filters.statusFilter !== 'ALL') count += 1;
  if (filters.categoryFilter !== 'ALL') count += 1;
  if (filters.priorityFilter !== 'ALL') count += 1;
  if (filters.assigneeFilter !== 'ALL') count += 1;
  if (filters.deadlineFilter !== 'ALL') count += 1;
  if (filters.sortBy !== 'default') count += 1;
  return count;
}

/**
 * Counts active secondary dropdown filters for the current TaskToolbar view mode.
 */
export function countActiveToolbarFilters(
  filters: TaskFilterState,
  isTrash: boolean,
): number {
  if (isTrash) {
    let count = 0;
    if (filters.categoryFilter !== 'ALL') count += 1;
    if (filters.priorityFilter !== 'ALL') count += 1;
    if (filters.assigneeFilter !== 'ALL') count += 1;
    return count;
  }
  return countActiveFilters(filters);
}

/**
 * Checks whether any search, scope, team, or secondary filter is currently applied.
 */
export function hasAnyToolbarFilter(
  filters: TaskFilterState,
  isTrash: boolean,
): boolean {
  return (
    filters.searchText.trim().length > 0 ||
    filters.teamFilter !== 'ALL' ||
    (!isTrash && filters.scopeFilter !== 'all') ||
    countActiveToolbarFilters(filters, isTrash) > 0
  );
}

/**
 * Appends a positive item count in parentheses (e.g. "Thùng rác (3)").
 */
export function formatCountLabel(baseLabel: string, count?: number): string {
  if (!count || count <= 0) {
    return baseLabel;
  }
  return `${baseLabel} (${count})`;
}

/**
 * Determines whether the quick pending-invites pill should appear on the toolbar.
 */
export function shouldShowPendingInvitesShortcut(
  isTrash: boolean,
  scopeFilter: ScopeFilter,
  pendingInvitesCount?: number,
): boolean {
  return !isTrash && scopeFilter !== 'pending_invites' && (pendingInvitesCount ?? 0) > 0;
}

export function loadSavedViewMode(): Exclude<TaskViewMode, 'trash'> {
  if (typeof window === 'undefined') return 'both';
  const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return saved === 'kanban' ||
    saved === 'table' ||
    saved === 'both' ||
    saved === 'calendar'
    ? saved
    : 'both';
}

export function resolveTasksRouteViewMode(
  mode: TaskViewMode,
): Exclude<TaskViewMode, 'calendar'> {
  return mode === 'calendar' ? 'both' : mode;
}

export function saveViewMode(mode: TaskViewMode): void {
  if (typeof window === 'undefined' || mode === 'trash') return;
  window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

export interface AssigneeOption {
  value: number | 'ALL';
  label: string;
}

export function buildAssigneeOptions(
  teams: Team[],
  teamFilter: TeamFilterValue,
  currentUserId?: number,
): AssigneeOption[] {
  const options: AssigneeOption[] = [
    { value: 'ALL', label: 'Tất cả người phụ trách' },
  ];

  if (teamFilter === 'PERSONAL') {
    if (currentUserId !== undefined) {
      options.push({ value: currentUserId, label: 'Tôi' });
    }
    return options;
  }

  const userMap = new Map<number, string>();

  const targetTeams =
    typeof teamFilter === 'number'
      ? teams.filter((t) => t.id === teamFilter)
      : teams;

  for (const team of targetTeams) {
    if (team.owner) {
      userMap.set(team.owner.id, team.owner.name);
    }
    if (Array.isArray(team.members)) {
      for (const m of team.members) {
        if (m.user) {
          userMap.set(m.user.id, m.user.name);
        }
      }
    }
  }

  // If viewing all teams and currentUserId is not in userMap, add current user
  if (teamFilter === 'ALL' && currentUserId && !userMap.has(currentUserId)) {
    userMap.set(currentUserId, 'Tôi');
  }

  for (const [id, name] of userMap.entries()) {
    const isCurrentUser = currentUserId !== undefined && id === currentUserId;
    const label =
      isCurrentUser && name !== 'Tôi'
        ? `${name} (Tôi)`
        : name;
    options.push({ value: id, label });
  }

  return options;
}

export function filterCategoriesByTeamFilter(
  categories: Category[],
  teamFilter: TeamFilterValue,
): Category[] {
  if (teamFilter === 'PERSONAL') {
    return categories.filter((c) => c.teamId == null);
  }
  if (typeof teamFilter === 'number') {
    return categories.filter((c) => c.teamId === teamFilter);
  }
  return categories;
}

export interface TaskListQueryParams {
  search?: string;
  status?: string;
  categoryId?: number;
  priority?: string;
  teamId?: number;
  personalOnly?: boolean;
  assigneeId?: number;
  scope?: string;
  deadlineFilter?: string;
  sortBy?: string;
}

export function buildTaskQueryParams(filters: TaskFilterState): TaskListQueryParams {
  return {
    search: filters.searchText,
    status: filters.statusFilter === 'ALL' ? undefined : filters.statusFilter,
    categoryId: filters.categoryFilter === 'ALL' ? undefined : filters.categoryFilter,
    priority: filters.priorityFilter === 'ALL' ? undefined : filters.priorityFilter,
    teamId: typeof filters.teamFilter === 'number' ? filters.teamFilter : undefined,
    personalOnly: filters.teamFilter === 'PERSONAL' ? true : undefined,
    assigneeId: filters.assigneeFilter === 'ALL' ? undefined : filters.assigneeFilter,
    scope: filters.scopeFilter === 'all' ? undefined : filters.scopeFilter,
    deadlineFilter: filters.deadlineFilter === 'ALL' ? undefined : filters.deadlineFilter,
    sortBy: filters.sortBy === 'default' ? undefined : filters.sortBy,
  };
}

export function buildTaskListQueryString(params?: TaskListQueryParams): string {
  const searchParams = new URLSearchParams();
  const cleanSearch = params?.search?.trim();
  if (cleanSearch) {
    searchParams.append('search', cleanSearch);
  }
  if (params?.status && params.status !== 'ALL') {
    searchParams.append('status', params.status);
  }
  if (params?.priority && params.priority !== 'ALL') {
    searchParams.append('priority', params.priority);
  }
  if (params?.categoryId !== undefined) {
    searchParams.append('categoryId', String(params.categoryId));
  }
  if (params?.personalOnly) {
    searchParams.append('personalOnly', 'true');
  } else if (params?.teamId !== undefined) {
    searchParams.append('teamId', String(params.teamId));
  }
  if (params?.assigneeId !== undefined) {
    searchParams.append('assigneeId', String(params.assigneeId));
  }
  if (params?.scope) {
    searchParams.append('scope', params.scope);
  }
  if (params?.deadlineFilter && params.deadlineFilter !== 'ALL') {
    searchParams.append('deadlineFilter', params.deadlineFilter);
  }
  if (params?.sortBy && params.sortBy !== 'default') {
    searchParams.append('sortBy', params.sortBy);
  }
  return searchParams.toString();
}
