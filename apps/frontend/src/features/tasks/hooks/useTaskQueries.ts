import { useState, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { Task, StatusFilter, PriorityFilter } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';
import { getTasks } from '../api/tasks.api';
import { getCategories } from '../../categories/api/categories.api';
import { getTeams } from '../../teams/api/teams.api';
import { UnauthorizedError } from '../../auth/api/auth.api';

export function useTaskQueries(isAuthenticated: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTasks([]);
    setCategories([]);
    setTeams([]);
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

  const fetchCategories = useCallback(async () => {
    if (!isAuthenticated) {
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

  return {
    tasks,
    setTasks,
    categories,
    teams,
    loading,
    setLoading,
    fetchTasks,
    fetchCategories,
    fetchTeams,
    resetState,
  };
}
