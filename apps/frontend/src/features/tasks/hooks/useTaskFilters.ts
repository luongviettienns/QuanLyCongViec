import { useState, useCallback, useMemo } from 'react';
import type { StatusFilter, PriorityFilter, ScopeFilter } from '../types/task.types';

export interface TaskFilterState {
  searchText: string;
  statusFilter: StatusFilter;
  categoryFilter: number | 'ALL';
  priorityFilter: PriorityFilter;
  teamFilter: number | 'ALL';
  scopeFilter: ScopeFilter;
}

export function useTaskFilters() {
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<number | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');
  const [teamFilter, setTeamFilter] = useState<number | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

  /**
   * isFiltering indicates whether the Kanban board is filtered to a partial subset
   * of tasks (by search text, status, category, priority, or non-all scope).
   *
   * Note on teamFilter:
   * teamFilter represents the board's organizational scope/workspace (e.g. personal vs team X),
   * not a subset filter. Selecting a specific team shows all tasks of that team, which is
   * in fact the prerequisite for team reordering (useTaskBoard requires teamFilter !== 'ALL').
   * If teamFilter were included in isFiltering, KanbanBoard would show the "Filtering active"
   * alert and disable same-column reordering for that team.
   */
  const isFiltering = useMemo(
    () =>
      searchText.trim() !== '' ||
      statusFilter !== 'ALL' ||
      categoryFilter !== 'ALL' ||
      priorityFilter !== 'ALL' ||
      scopeFilter !== 'all',
    [searchText, statusFilter, categoryFilter, priorityFilter, scopeFilter],
  );

  const resetFilters = useCallback(() => {
    setSearchText('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setPriorityFilter('ALL');
    setTeamFilter('ALL');
    setScopeFilter('all');
  }, []);

  return {
    searchText,
    statusFilter,
    categoryFilter,
    priorityFilter,
    teamFilter,
    scopeFilter,
    isFiltering,
    setSearchText,
    setStatusFilter,
    setCategoryFilter,
    setPriorityFilter,
    setTeamFilter,
    setScopeFilter,
    resetFilters,
  };
}
