import type { TaskFilterPatch, TaskFilterState, TaskViewMode } from '../types/task.types.ts';
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

export function loadSavedViewMode(): Exclude<TaskViewMode, 'trash'> {
  if (typeof window === 'undefined') return 'both';
  const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return saved === 'kanban' || saved === 'table' || saved === 'both' ? saved : 'both';
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
  teamFilter: number | 'ALL',
  currentUserId?: number,
): AssigneeOption[] {
  const options: AssigneeOption[] = [
    { value: 'ALL', label: 'Tất cả người phụ trách' },
  ];

  const userMap = new Map<number, string>();

  const targetTeams =
    teamFilter !== 'ALL'
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
