import { useState, useRef, useCallback, useMemo } from 'react';
import { message } from 'antd';
import type { Task, TrashTask, TaskFilterState } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';
import { getTasks, getTrashTasks } from '../api/tasks.api';
import { getCategories } from '../../categories/api/categories.api';
import { getTeams } from '../../teams/api/teams.api';
import { UnauthorizedError } from '../../../shared/api';

export function useTaskQueries(isAuthenticated: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trashTasks, setTrashTasks] = useState<TrashTask[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const trashAbortControllerRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (trashAbortControllerRef.current) {
      trashAbortControllerRef.current.abort();
      trashAbortControllerRef.current = null;
    }
    setTasks([]);
    setTrashTasks([]);
    setCategories([]);
    setTeams([]);
    setLoading(false);
    setTrashLoading(false);
  }, []);

  const fetchTasks = useCallback(
    async (filters: TaskFilterState, token?: string | null) => {
      void token;
      if (!isAuthenticated) {
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
            search: filters.searchText,
            status: filters.statusFilter === 'ALL' ? undefined : filters.statusFilter,
            categoryId: filters.categoryFilter === 'ALL' ? undefined : filters.categoryFilter,
            priority: filters.priorityFilter === 'ALL' ? undefined : filters.priorityFilter,
            teamId: filters.teamFilter === 'ALL' ? undefined : filters.teamFilter,
            assigneeId: filters.assigneeFilter === 'ALL' ? undefined : filters.assigneeFilter,
            scope: filters.scopeFilter === 'all' ? undefined : filters.scopeFilter,
            deadlineFilter: filters.deadlineFilter === 'ALL' ? undefined : filters.deadlineFilter,
            sortBy: filters.sortBy === 'default' ? undefined : filters.sortBy,
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
        if (
          error instanceof UnauthorizedError ||
          (error instanceof Error && error.name === 'UnauthorizedError')
        ) {
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
    [isAuthenticated],
  );

  const fetchTrashTasks = useCallback(
    async (filters: TaskFilterState) => {
      if (!isAuthenticated) {
        setTrashTasks([]);
        setTrashLoading(false);
        return;
      }

      if (trashAbortControllerRef.current) {
        trashAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      trashAbortControllerRef.current = controller;

      try {
        const data = await getTrashTasks(
          {
            search: filters.searchText,
            status: filters.statusFilter === 'ALL' ? undefined : filters.statusFilter,
            categoryId: filters.categoryFilter === 'ALL' ? undefined : filters.categoryFilter,
            priority: filters.priorityFilter === 'ALL' ? undefined : filters.priorityFilter,
            teamId: filters.teamFilter === 'ALL' ? undefined : filters.teamFilter,
            assigneeId: filters.assigneeFilter === 'ALL' ? undefined : filters.assigneeFilter,
            scope: filters.scopeFilter === 'all' ? undefined : filters.scopeFilter,
            deadlineFilter: filters.deadlineFilter === 'ALL' ? undefined : filters.deadlineFilter,
            sortBy: filters.sortBy === 'default' ? undefined : filters.sortBy,
          },
          controller.signal,
        );
        if (trashAbortControllerRef.current === controller) {
          setTrashTasks(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (
          error instanceof UnauthorizedError ||
          (error instanceof Error && error.name === 'UnauthorizedError')
        ) {
          return;
        }
        message.error(
          error instanceof Error ? error.message : 'Lỗi khi tải danh sách công việc đã xoá',
        );
      } finally {
        if (trashAbortControllerRef.current === controller) {
          setTrashLoading(false);
        }
      }
    },
    [isAuthenticated],
  );

  const fetchCategories = useCallback(async () => {
    if (!isAuthenticated) {
      setCategories([]);
      return;
    }

    try {
      const data = await getCategories({ scope: 'all' });
      setCategories(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (
        error instanceof UnauthorizedError ||
        (error instanceof Error && error.name === 'UnauthorizedError')
      ) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : 'Lỗi khi tải danh mục',
      );
    }
  }, [isAuthenticated]);

  const fetchTeams = useCallback(async () => {
    if (!isAuthenticated) {
      setTeams([]);
      return;
    }

    try {
      const data = await getTeams();
      setTeams(data);
    } catch {
      return;
    }
  }, [isAuthenticated]);

  return useMemo(
    () => ({
      tasks,
      setTasks,
      trashTasks,
      setTrashTasks,
      categories,
      teams,
      loading,
      setLoading,
      trashLoading,
      setTrashLoading,
      fetchTasks,
      fetchTrashTasks,
      fetchCategories,
      fetchTeams,
      resetState,
    }),
    [
      tasks,
      trashTasks,
      categories,
      teams,
      loading,
      trashLoading,
      fetchTasks,
      fetchTrashTasks,
      fetchCategories,
      fetchTeams,
      resetState,
    ],
  );
}
