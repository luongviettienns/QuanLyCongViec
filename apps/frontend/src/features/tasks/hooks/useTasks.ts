import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  TaskStatus,
  TaskViewMode,
  TaskFilterState,
  TaskFilterPatch,
} from '../types/task.types';
import { useAuth } from '../../auth/hooks/useAuth';
import { useRealtimeReconnect } from '../../realtime';
import { useTaskFilters } from './useTaskFilters';
import { useTaskQueries } from './useTaskQueries';
import { useTaskMutations } from './useTaskMutations';
import { useTaskBoard } from './useTaskBoard';
import {
  createDefaultTaskFilters,
  applyFilterPatch,
  loadSavedViewMode,
  saveViewMode,
} from '../utils/task-filter.utils';

export function useTasks(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { user, loading: authLoading } = useAuth();
  const isAuthenticated = Boolean(user);

  const {
    filters,
    isFiltering,
    updateFilters,
    resetFilters,
  } = useTaskFilters();

  const filtersRef = useRef<TaskFilterState>(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const [viewMode, setViewModeState] = useState<TaskViewMode>(loadSavedViewMode);

  const queries = useTaskQueries(isAuthenticated);
  const mutations = useTaskMutations(isAuthenticated);

  const {
    tasks,
    setTasks,
    trashTasks,
    trashLoading,
    setTrashLoading,
    categories,
    teams,
    loading,
    setLoading,
    fetchTasks,
    fetchTrashTasks,
    fetchCategories,
    fetchTeams,
    resetState: resetQueriesState,
  } = queries;

  const syncCanonicalTasks = useCallback(() => {
    void fetchTasks(filtersRef.current);
  }, [fetchTasks]);

  const board = useTaskBoard(
    isAuthenticated,
    tasks,
    setTasks,
    user,
    teams,
    syncCanonicalTasks,
  );

  const resetAll = useCallback(() => {
    resetQueriesState();
    resetFilters();
    filtersRef.current = createDefaultTaskFilters();
  }, [resetQueriesState, resetFilters]);

  const setViewMode = useCallback(
    (nextMode: TaskViewMode) => {
      setViewModeState(nextMode);
      if (nextMode !== 'trash') {
        saveViewMode(nextMode);
      } else {
        setTrashLoading(true);
        void fetchTrashTasks(filtersRef.current);
      }
    },
    [fetchTrashTasks, setTrashLoading],
  );

  const applyFilters = useCallback(
    (patch: TaskFilterPatch) => {
      const next = applyFilterPatch(filtersRef.current, patch);
      filtersRef.current = next;
      updateFilters(patch);
      if (!isAuthenticated) return;
      if (viewMode === 'trash') {
        setTrashLoading(true);
        void fetchTrashTasks(next);
      } else {
        setLoading(true);
        void fetchTasks(next);
      }
    },
    [
      isAuthenticated,
      updateFilters,
      viewMode,
      fetchTrashTasks,
      fetchTasks,
      setLoading,
      setTrashLoading,
    ],
  );

  const handleReset = useCallback(() => {
    if (!isAuthenticated) return;
    const next = createDefaultTaskFilters();
    filtersRef.current = next;
    resetFilters();
    if (viewMode === 'trash') {
      setTrashLoading(true);
      void fetchTrashTasks(next);
    } else {
      setLoading(true);
      void fetchTasks(next);
    }
  }, [
    isAuthenticated,
    resetFilters,
    viewMode,
    fetchTrashTasks,
    fetchTasks,
    setLoading,
    setTrashLoading,
  ]);

  const refetch = useCallback(async () => {
    if (!isAuthenticated) {
      resetAll();
      return;
    }
    if (viewMode === 'trash') {
      setTrashLoading(true);
      await Promise.all([
        fetchTrashTasks(filtersRef.current),
        fetchCategories(),
        fetchTeams(),
      ]);
    } else {
      setLoading(true);
      await Promise.all([
        fetchTasks(filtersRef.current),
        fetchCategories(),
        fetchTeams(),
      ]);
    }
  }, [
    isAuthenticated,
    resetAll,
    viewMode,
    fetchTrashTasks,
    fetchTasks,
    fetchCategories,
    fetchTeams,
    setLoading,
    setTrashLoading,
  ]);

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
        fetchTasks(filtersRef.current),
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

  useRealtimeReconnect(() => {
    if (enabled && isAuthenticated) {
      void refetch();
    }
  });

  const handleDelete = useCallback(
    async (id: number) => {
      await mutations.handleDeleteTask(id, async () => {
        if (viewMode === 'trash') {
          setTrashLoading(true);
          await fetchTrashTasks(filtersRef.current);
        } else {
          setLoading(true);
          await fetchTasks(filtersRef.current);
        }
      });
    },
    [mutations, viewMode, fetchTrashTasks, fetchTasks, setLoading, setTrashLoading],
  );

  const handleRestore = useCallback(
    async (id: number) => {
      await mutations.handleRestoreTask(id, async () => {
        setTrashLoading(true);
        setLoading(true);
        await Promise.all([
          fetchTrashTasks(filtersRef.current),
          fetchTasks(filtersRef.current),
        ]);
      });
    },
    [mutations, fetchTrashTasks, fetchTasks, setLoading, setTrashLoading],
  );

  const handlePermanentDelete = useCallback(
    async (id: number) => {
      await mutations.handlePermanentDeleteTask(id, async () => {
        setTrashLoading(true);
        await fetchTrashTasks(filtersRef.current);
      });
    },
    [mutations, fetchTrashTasks, setTrashLoading],
  );

  const handleReorder = useCallback(
    (taskIds: number[], status?: TaskStatus) => {
      return board.handleReorder(taskIds, status, filtersRef.current.teamFilter);
    },
    [board],
  );

  return {
    tasks,
    trashTasks,
    trashLoading,
    categories,
    teams,
    loading,
    filters,
    isFiltering,
    viewMode,
    setViewMode,
    applyFilters,
    handleReset,
    refetch,
    handleDelete,
    handleRestore,
    handlePermanentDelete,
    handleReorder,
    handleStatusMove: board.handleStatusMove,
    resetState: resetAll,
    fetchCategories,
    fetchTeams,
  };
}
