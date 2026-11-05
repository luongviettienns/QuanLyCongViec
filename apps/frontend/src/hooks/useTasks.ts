import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { Task, Category, Team, StatusFilter, PriorityFilter, TaskStatus } from '../types/task.types';
import {
  getTasks,
  getCategories,
  deleteTask,
  reorderTasks,
} from '../api/tasks.api';
import { getTeams } from '../api/teams.api';
import { useAuth } from './useAuth';
import { UnauthorizedError } from '../api/auth.api';

export function useTasks(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<number | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');
  const [teamFilter, setTeamFilter] = useState<number | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'created_by_me' | 'assigned_to_me'>('all');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFiltering =
    searchText.trim() !== '' ||
    statusFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    priorityFilter !== 'ALL' ||
    teamFilter !== 'ALL' ||
    scopeFilter !== 'all';

  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setTasks([]);
    setCategories([]);
    setTeams([]);
    setSearchText('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setPriorityFilter('ALL');
    setTeamFilter('ALL');
    setScopeFilter('all');
    setLoading(false);
  }, []);

  const fetchTasks = useCallback(
    async (
      search = '',
      status: StatusFilter = 'ALL',
      catId: number | 'ALL' = 'ALL',
      priority: PriorityFilter = 'ALL',
      tId: number | 'ALL' = 'ALL',
      scope: 'all' | 'created_by_me' | 'assigned_to_me' = 'all',
    ) => {
      if (!user) {
        setTasks([]);
        setLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const data = await getTasks(
          {
            search,
            status: status === 'ALL' ? undefined : status,
            categoryId: catId === 'ALL' ? undefined : catId,
            priority: priority === 'ALL' ? undefined : priority,
            teamId: tId === 'ALL' ? undefined : tId,
            scope: scope === 'all' ? undefined : scope,
          },
          controller.signal,
        );
        if (abortControllerRef.current === controller) {
          setTasks(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
          return;
        }
        message.error(
          error instanceof Error ? error.message : 'Lỗi khi tải dữ liệu',
        );
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [user],
  );

  const fetchCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      return;
    }

    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : 'Lỗi khi tải danh mục',
      );
    }
  }, [user]);

  const fetchTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      return;
    }

    try {
      const data = await getTeams();
      setTeams(data);
    } catch {
      return;
    }
  }, [user]);

  useEffect(() => {
    if (!enabled || authLoading) {
      return;
    }

    let active = true;

    async function sync() {
      if (!user) {
        await Promise.resolve();
        if (active) {
          resetState();
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, user, authLoading, resetState, fetchCategories, fetchTeams, fetchTasks]);

  function handleSearch(value: string) {
    if (!user) {
      return;
    }
    setSearchText(value);
    setLoading(true);
    void fetchTasks(value, statusFilter, categoryFilter, priorityFilter, teamFilter, scopeFilter);
  }

  function handleStatusChange(status: StatusFilter) {
    if (!user) {
      return;
    }
    setStatusFilter(status);
    setLoading(true);
    void fetchTasks(searchText, status, categoryFilter, priorityFilter, teamFilter, scopeFilter);
  }

  function handleCategoryChange(catId: number | 'ALL') {
    if (!user) {
      return;
    }
    setCategoryFilter(catId);
    setLoading(true);
    void fetchTasks(searchText, statusFilter, catId, priorityFilter, teamFilter, scopeFilter);
  }

  function handlePriorityChange(priority: PriorityFilter) {
    if (!user) {
      return;
    }
    setPriorityFilter(priority);
    setLoading(true);
    void fetchTasks(searchText, statusFilter, categoryFilter, priority, teamFilter, scopeFilter);
  }

  function handleTeamChange(tId: number | 'ALL') {
    if (!user) {
      return;
    }
    setTeamFilter(tId);
    setLoading(true);
    void fetchTasks(searchText, statusFilter, categoryFilter, priorityFilter, tId, scopeFilter);
  }

  function handleScopeChange(scope: 'all' | 'created_by_me' | 'assigned_to_me') {
    if (!user) {
      return;
    }
    setScopeFilter(scope);
    setLoading(true);
    void fetchTasks(searchText, statusFilter, categoryFilter, priorityFilter, teamFilter, scope);
  }

  function handleReset() {
    if (!user) {
      return;
    }
    setSearchText('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
    setPriorityFilter('ALL');
    setTeamFilter('ALL');
    setScopeFilter('all');
    setLoading(true);
    void fetchTasks('', 'ALL', 'ALL', 'ALL', 'ALL', 'all');
  }

  async function refetch() {
    if (!user) {
      resetState();
      return;
    }
    setLoading(true);
    await Promise.all([
      fetchTasks(searchText, statusFilter, categoryFilter, priorityFilter, teamFilter, scopeFilter),
      fetchCategories(),
      fetchTeams(),
    ]);
  }

  async function handleDelete(id: number) {
    if (!user) {
      return;
    }
    try {
      await deleteTask(id);
      message.success('Xoá công việc thành công');
      setLoading(true);
      await fetchTasks(searchText, statusFilter, categoryFilter, priorityFilter, teamFilter, scopeFilter);
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : 'Xoá công việc thất bại',
      );
    }
  }

  async function handleReorder(taskIds: number[], status?: TaskStatus) {
    if (!user) {
      return;
    }
    const previousTasks = [...tasks];

    setTasks((prev) => {
      const updated = [...prev];
      taskIds.forEach((id, newIndex) => {
        const itemIndex = updated.findIndex((t) => t.id === id);
        if (itemIndex !== -1) {
          updated[itemIndex] = {
            ...updated[itemIndex],
            position: newIndex,
            ...(status ? { status } : {}),
          };
        }
      });
      return updated;
    });

    try {
      await reorderTasks(taskIds, status, teamFilter !== 'ALL' ? teamFilter : undefined);
    } catch (error) {
      setTasks(previousTasks);
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : 'Không thể lưu vị trí công việc',
      );
    }
  }

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
    resetState,
    fetchCategories,
    fetchTeams,
  };
}
