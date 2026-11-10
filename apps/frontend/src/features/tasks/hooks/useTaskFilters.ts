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
