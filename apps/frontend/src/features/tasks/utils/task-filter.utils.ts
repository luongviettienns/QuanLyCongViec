import type { TaskFilterPatch, TaskFilterState, TaskViewMode } from '../types/task.types.ts';

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
