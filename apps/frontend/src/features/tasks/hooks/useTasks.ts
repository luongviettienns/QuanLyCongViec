import { useEffect, useCallback } from 'react';
import type { StatusFilter, PriorityFilter, TaskStatus, ScopeFilter } from '../types/task.types';
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

  const syncCanonicalTasks = useCallback(() => {
    void queries.fetchTasks(
      filters.searchText,
      filters.statusFilter,
      filters.categoryFilter,
      filters.priorityFilter,
      filters.teamFilter,
      filters.scopeFilter,
    );
  }, [
    queries,
    filters.searchText,
    filters.statusFilter,
    filters.categoryFilter,
    filters.priorityFilter,
    filters.teamFilter,
    filters.scopeFilter,
  ]);

  const board = useTaskBoard(
    isAuthenticated,
    queries.tasks,
    queries.setTasks,
    user,
    queries.teams,
    syncCanonicalTasks,
  );

  const {
    tasks,
    categories,
    teams,
    loading,
    setLoading,
    fetchTasks,
    fetchCategories,
    fetchTeams,
    resetState,
  } = queries;

  const {
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
  } = filters;

  const resetAll = useCallback(() => {
    resetState();
    resetFilters();
  }, [resetState, resetFilters]);

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

      setLoading(true);
      await Promise.all([
        fetchCategories(),
        fetchTeams(),
        fetchTasks('', 'ALL', 'ALL', 'ALL', 'ALL', 'all'),
      ]);
    }

    void sync();

    return () => {
      active = false;
    };
  }, [
    enabled,
    isAuthenticated,
    authLoading,
    resetAll,
    fetchCategories,
    fetchTeams,
    fetchTasks,
    setLoading,
  ]);

  const handleSearch = useCallback(
    (value: string) => {
      if (!isAuthenticated) return;
      setSearchText(value);
      setLoading(true);
      void fetchTasks(
        value,
        statusFilter,
        categoryFilter,
        priorityFilter,
        teamFilter,
        scopeFilter,
      );
    },
    [
      isAuthenticated,
      setSearchText,
      setLoading,
      fetchTasks,
      statusFilter,
      categoryFilter,
      priorityFilter,
      teamFilter,
      scopeFilter,
    ],
  );

  const handleStatusChange = useCallback(
    (status: StatusFilter) => {
      if (!isAuthenticated) return;
      setStatusFilter(status);
      setLoading(true);
      void fetchTasks(
        searchText,
        status,
        categoryFilter,
        priorityFilter,
        teamFilter,
        scopeFilter,
      );
    },
    [
      isAuthenticated,
      setStatusFilter,
      setLoading,
      fetchTasks,
      searchText,
      categoryFilter,
      priorityFilter,
      teamFilter,
      scopeFilter,
    ],
  );

  const handleCategoryChange = useCallback(
    (catId: number | 'ALL') => {
      if (!isAuthenticated) return;
      setCategoryFilter(catId);
      setLoading(true);
      void fetchTasks(
        searchText,
        statusFilter,
        catId,
        priorityFilter,
        teamFilter,
        scopeFilter,
      );
    },
    [
      isAuthenticated,
      setCategoryFilter,
      setLoading,
      fetchTasks,
      searchText,
      statusFilter,
      priorityFilter,
      teamFilter,
      scopeFilter,
    ],
  );

  const handlePriorityChange = useCallback(
    (priority: PriorityFilter) => {
      if (!isAuthenticated) return;
      setPriorityFilter(priority);
      setLoading(true);
      void fetchTasks(
        searchText,
        statusFilter,
        categoryFilter,
        priority,
        teamFilter,
        scopeFilter,
      );
    },
    [
      isAuthenticated,
      setPriorityFilter,
      setLoading,
      fetchTasks,
      searchText,
      statusFilter,
      categoryFilter,
      teamFilter,
      scopeFilter,
    ],
  );

  const handleTeamChange = useCallback(
    (tId: number | 'ALL') => {
      if (!isAuthenticated) return;
      setTeamFilter(tId);
      setLoading(true);
      void fetchTasks(
        searchText,
        statusFilter,
        categoryFilter,
        priorityFilter,
        tId,
        scopeFilter,
      );
    },
    [
      isAuthenticated,
      setTeamFilter,
      setLoading,
      fetchTasks,
      searchText,
      statusFilter,
      categoryFilter,
      priorityFilter,
      scopeFilter,
    ],
  );

  const handleScopeChange = useCallback(
    (scope: ScopeFilter) => {
      if (!isAuthenticated) return;
      setScopeFilter(scope);
      setLoading(true);
      void fetchTasks(
        searchText,
        statusFilter,
        categoryFilter,
        priorityFilter,
        teamFilter,
        scope,
      );
    },
    [
      isAuthenticated,
      setScopeFilter,
      setLoading,
      fetchTasks,
      searchText,
      statusFilter,
      categoryFilter,
      priorityFilter,
      teamFilter,
    ],
  );

  const handleReset = useCallback(() => {
    if (!isAuthenticated) return;
    resetFilters();
    setLoading(true);
    void fetchTasks('', 'ALL', 'ALL', 'ALL', 'ALL', 'all');
  }, [isAuthenticated, resetFilters, setLoading, fetchTasks]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      resetAll();
      return;
    }
    setLoading(true);
    await Promise.all([
      fetchTasks(
        searchText,
        statusFilter,
        categoryFilter,
        priorityFilter,
        teamFilter,
        scopeFilter,
      ),
      fetchCategories(),
      fetchTeams(),
    ]);
  }, [
    isAuthenticated,
    resetAll,
    setLoading,
    fetchTasks,
    searchText,
    statusFilter,
    categoryFilter,
    priorityFilter,
    teamFilter,
    scopeFilter,
    fetchCategories,
    fetchTeams,
  ]);

  const handleDelete = useCallback(
    async (id: number) => {
      await mutations.handleDeleteTask(id, async () => {
        setLoading(true);
        await fetchTasks(
          searchText,
          statusFilter,
          categoryFilter,
          priorityFilter,
          teamFilter,
          scopeFilter,
        );
      });
    },
    [
      mutations,
      setLoading,
      fetchTasks,
      searchText,
      statusFilter,
      categoryFilter,
      priorityFilter,
      teamFilter,
      scopeFilter,
    ],
  );

  const handleReorder = useCallback(
    (taskIds: number[], status?: TaskStatus) => {
      return board.handleReorder(taskIds, status, teamFilter);
    },
    [board, teamFilter],
  );

  return {
    tasks,
    categories,
    teams,
    loading,
    searchText,
    statusFilter,
    categoryFilter,
    priorityFilter,
    teamFilter,
    scopeFilter,
    isFiltering,
    setSearchText,
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
    fetchCategories,
    fetchTeams,
  };
}
