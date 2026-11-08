import { useEffect, useCallback } from 'react';
import type { StatusFilter, PriorityFilter, TaskStatus } from '../types/task.types';
import { useAuth } from '../../auth/hooks/useAuth';
import { useTaskFilters } from './useTaskFilters';
import { useTaskQueries } from './useTaskQueries';
import { useTaskMutations } from './useTaskMutations';
import { useTaskBoard } from './useTaskBoard';

export function useTasks(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { user, loading: authLoading } = useAuth();
  const isAuthenticated = Boolean(user);

  const filters = useTaskFilters();
  const queries = useTaskQueries(isAuthenticated);
  const mutations = useTaskMutations(isAuthenticated);
  const board = useTaskBoard(isAuthenticated, queries.tasks, queries.setTasks);

  const resetAll = useCallback(() => {
    queries.resetState();
    filters.resetFilters();
  }, [queries, filters]);

  useEffect(() => {
    if (!enabled || authLoading) {
      return;
    }

    let active = true;

    async function sync() {
      if (!isAuthenticated) {
        await Promise.resolve();
        if (active) {
          resetAll();
        }
        return;
      }

      queries.setLoading(true);
      await Promise.all([
        queries.fetchCategories(),
        queries.fetchTeams(),
        queries.fetchTasks('', 'ALL', 'ALL', 'ALL', 'ALL', 'all'),
      ]);
    }

    void sync();

    return () => {
      active = false;
    };
  }, [enabled, isAuthenticated, authLoading, resetAll, queries]);

  const handleSearch = useCallback(
    (value: string) => {
      if (!isAuthenticated) return;
      filters.setSearchText(value);
      queries.setLoading(true);
      void queries.fetchTasks(
        value,
        filters.statusFilter,
        filters.categoryFilter,
        filters.priorityFilter,
        filters.teamFilter,
        filters.scopeFilter,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handleStatusChange = useCallback(
    (status: StatusFilter) => {
      if (!isAuthenticated) return;
      filters.setStatusFilter(status);
      queries.setLoading(true);
      void queries.fetchTasks(
        filters.searchText,
        status,
        filters.categoryFilter,
        filters.priorityFilter,
        filters.teamFilter,
        filters.scopeFilter,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handleCategoryChange = useCallback(
    (catId: number | 'ALL') => {
      if (!isAuthenticated) return;
      filters.setCategoryFilter(catId);
      queries.setLoading(true);
      void queries.fetchTasks(
        filters.searchText,
        filters.statusFilter,
        catId,
        filters.priorityFilter,
        filters.teamFilter,
        filters.scopeFilter,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handlePriorityChange = useCallback(
    (priority: PriorityFilter) => {
      if (!isAuthenticated) return;
      filters.setPriorityFilter(priority);
      queries.setLoading(true);
      void queries.fetchTasks(
        filters.searchText,
        filters.statusFilter,
        filters.categoryFilter,
        priority,
        filters.teamFilter,
        filters.scopeFilter,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handleTeamChange = useCallback(
    (tId: number | 'ALL') => {
      if (!isAuthenticated) return;
      filters.setTeamFilter(tId);
      queries.setLoading(true);
      void queries.fetchTasks(
        filters.searchText,
        filters.statusFilter,
        filters.categoryFilter,
        filters.priorityFilter,
        tId,
        filters.scopeFilter,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handleScopeChange = useCallback(
    (scope: 'all' | 'created_by_me' | 'assigned_to_me') => {
      if (!isAuthenticated) return;
      filters.setScopeFilter(scope);
      queries.setLoading(true);
      void queries.fetchTasks(
        filters.searchText,
        filters.statusFilter,
        filters.categoryFilter,
        filters.priorityFilter,
        filters.teamFilter,
        scope,
      );
    },
    [isAuthenticated, filters, queries],
  );

  const handleReset = useCallback(() => {
    if (!isAuthenticated) return;
    filters.resetFilters();
    queries.setLoading(true);
    void queries.fetchTasks('', 'ALL', 'ALL', 'ALL', 'ALL', 'all');
  }, [isAuthenticated, filters, queries]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      resetAll();
      return;
    }
    queries.setLoading(true);
    await Promise.all([
      queries.fetchTasks(
        filters.searchText,
        filters.statusFilter,
        filters.categoryFilter,
        filters.priorityFilter,
        filters.teamFilter,
        filters.scopeFilter,
      ),
      queries.fetchCategories(),
      queries.fetchTeams(),
    ]);
  }, [isAuthenticated, resetAll, queries, filters]);

  const handleDelete = useCallback(
    async (id: number) => {
      await mutations.handleDeleteTask(id, async () => {
        queries.setLoading(true);
        await queries.fetchTasks(
          filters.searchText,
          filters.statusFilter,
          filters.categoryFilter,
          filters.priorityFilter,
          filters.teamFilter,
          filters.scopeFilter,
        );
      });
    },
    [mutations, queries, filters],
  );

  const handleReorder = useCallback(
    (taskIds: number[], status?: TaskStatus) => {
      return board.handleReorder(taskIds, status, filters.teamFilter);
    },
    [board, filters.teamFilter],
  );

  return {
    tasks: queries.tasks,
    categories: queries.categories,
    teams: queries.teams,
    loading: queries.loading,
    searchText: filters.searchText,
    statusFilter: filters.statusFilter,
    categoryFilter: filters.categoryFilter,
    priorityFilter: filters.priorityFilter,
    teamFilter: filters.teamFilter,
    scopeFilter: filters.scopeFilter,
    isFiltering: filters.isFiltering,
    setSearchText: filters.setSearchText,
    handleSearch,
    handleStatusChange,
    handleCategoryChange,
    handlePriorityChange,
    handleTeamChange,
    handleScopeChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
    handleStatusMove: board.handleStatusMove,
    resetState: resetAll,
    fetchCategories: queries.fetchCategories,
    fetchTeams: queries.fetchTeams,
  };
}
