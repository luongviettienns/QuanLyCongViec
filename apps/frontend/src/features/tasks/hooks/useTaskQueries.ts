import { useState, useRef, useCallback, useMemo } from 'react';
import { message } from 'antd';
import type { Task, TrashTask, TaskFilterState } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';
import { getTasks, getTrashTasks } from '../api/tasks.api';
import { getCategories } from '../../categories/api/categories.api';
import { getTeams } from '../../teams/api/teams.api';
import { getFriendlyErrorMessage } from '../../../shared/api';
import {
  getTaskQueryMessageKey,
  shouldClearTaskListOnError,
  shouldIgnoreTaskApiError,
} from '../utils/task-error.utils';

function buildTaskQueryParams(filters: TaskFilterState) {
  return {
    search: filters.searchText,
    status: filters.statusFilter === 'ALL' ? undefined : filters.statusFilter,
    categoryId: filters.categoryFilter === 'ALL' ? undefined : filters.categoryFilter,
    priority: filters.priorityFilter === 'ALL' ? undefined : filters.priorityFilter,
    teamId: filters.teamFilter === 'ALL' ? undefined : filters.teamFilter,
    assigneeId: filters.assigneeFilter === 'ALL' ? undefined : filters.assigneeFilter,
    scope: filters.scopeFilter === 'all' ? undefined : filters.scopeFilter,
    deadlineFilter: filters.deadlineFilter === 'ALL' ? undefined : filters.deadlineFilter,
    sortBy: filters.sortBy === 'default' ? undefined : filters.sortBy,
  };
}

export function useTaskQueries(isAuthenticated: boolean) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trashTasks, setTrashTasks] = useState<TrashTask[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [trashLoading, setTrashLoading] = useState(false);
  const [tasksError, setTasksError] = useState<unknown>(null);
  const [trashError, setTrashError] = useState<unknown>(null);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const trashAbortControllerRef = useRef<AbortController | null>(null);
  const categoriesAbortControllerRef = useRef<AbortController | null>(null);
  const teamsAbortControllerRef = useRef<AbortController | null>(null);
  const badgesAbortControllerRef = useRef<AbortController | null>(null);

  const abortActiveQueries = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (trashAbortControllerRef.current) {
      trashAbortControllerRef.current.abort();
      trashAbortControllerRef.current = null;
    }
    if (categoriesAbortControllerRef.current) {
      categoriesAbortControllerRef.current.abort();
      categoriesAbortControllerRef.current = null;
    }
    if (teamsAbortControllerRef.current) {
      teamsAbortControllerRef.current.abort();
      teamsAbortControllerRef.current = null;
    }
    if (badgesAbortControllerRef.current) {
      badgesAbortControllerRef.current.abort();
      badgesAbortControllerRef.current = null;
    }
    setLoading(false);
    setTrashLoading(false);
  }, []);

  const resetState = useCallback(() => {
    abortActiveQueries();
    setTasks([]);
    setTrashTasks([]);
    setCategories([]);
    setTeams([]);
    setTasksError(null);
    setTrashError(null);
    setPendingInvitesCount(0);
    setTrashCount(0);
  }, [abortActiveQueries]);

  const fetchTasks = useCallback(
    async (filters: TaskFilterState, token?: string | null) => {
      void token;
      if (!isAuthenticated) {
        setTasks([]);
        setTasksError(null);
        setLoading(false);
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const data = await getTasks(buildTaskQueryParams(filters), controller.signal);
        if (abortControllerRef.current === controller) {
          setTasks(data);
          setTasksError(null);
        }
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return;
        }
        if (abortControllerRef.current !== controller) {
          return;
        }
        if (shouldClearTaskListOnError(error)) {
          setTasks([]);
        }
        setTasksError(error);
        void message.error({
          key: getTaskQueryMessageKey(error, 'tasks-fetch-error'),
          content: getFriendlyErrorMessage(error, 'Lỗi khi tải dữ liệu'),
        });
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
        setTrashError(null);
        setTrashLoading(false);
        return;
      }

      if (trashAbortControllerRef.current) {
        trashAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      trashAbortControllerRef.current = controller;

      try {
        const data = await getTrashTasks(buildTaskQueryParams(filters), controller.signal);
        if (trashAbortControllerRef.current === controller) {
          setTrashTasks(data);
          setTrashError(null);
        }
      } catch (error) {
        if (shouldIgnoreTaskApiError(error)) {
          return;
        }
        if (trashAbortControllerRef.current !== controller) {
          return;
        }
        if (shouldClearTaskListOnError(error)) {
          setTrashTasks([]);
        }
        setTrashError(error);
        void message.error({
          key: getTaskQueryMessageKey(error, 'tasks-trash-error'),
          content: getFriendlyErrorMessage(error, 'Lỗi khi tải danh sách công việc đã xoá'),
        });
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

    if (categoriesAbortControllerRef.current) {
      categoriesAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    categoriesAbortControllerRef.current = controller;

    try {
      const data = await getCategories({ scope: 'all' }, controller.signal);
      if (categoriesAbortControllerRef.current === controller) {
        setCategories(data);
      }
    } catch (error) {
      if (shouldIgnoreTaskApiError(error)) {
        return;
      }
      if (categoriesAbortControllerRef.current === controller) {
        void message.error({
          key: getTaskQueryMessageKey(error, 'tasks-categories-error'),
          content: getFriendlyErrorMessage(error, 'Lỗi khi tải danh mục'),
        });
      }
    }
  }, [isAuthenticated]);

  const fetchTeams = useCallback(async () => {
    if (!isAuthenticated) {
      setTeams([]);
      return;
    }

    if (teamsAbortControllerRef.current) {
      teamsAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    teamsAbortControllerRef.current = controller;

    try {
      const data = await getTeams(controller.signal);
      if (teamsAbortControllerRef.current === controller) {
        setTeams(data);
      }
    } catch (error) {
      if (shouldIgnoreTaskApiError(error)) {
        return;
      }
      if (teamsAbortControllerRef.current === controller) {
        void message.error({
          key: getTaskQueryMessageKey(error, 'tasks-teams-error'),
          content: getFriendlyErrorMessage(error, 'Không thể tải danh sách nhóm'),
        });
      }
    }
  }, [isAuthenticated]);

  const fetchTaskBadges = useCallback(async () => {
    if (!isAuthenticated) {
      setPendingInvitesCount(0);
      setTrashCount(0);
      return;
    }

    if (badgesAbortControllerRef.current) {
      badgesAbortControllerRef.current.abort();
    }

    const controller = new AbortController();
    badgesAbortControllerRef.current = controller;

    const [invitesResult, trashResult] = await Promise.allSettled([
      getTasks({ scope: 'pending_invites' }, controller.signal),
      getTrashTasks(undefined, controller.signal),
    ]);

    if (badgesAbortControllerRef.current !== controller) {
      return;
    }

    if (invitesResult.status === 'fulfilled') {
      setPendingInvitesCount(invitesResult.value.length);
    } else if (!shouldIgnoreTaskApiError(invitesResult.reason)) {
      console.warn(
        'Không thể cập nhật số lượng lời mời chờ:',
        getFriendlyErrorMessage(invitesResult.reason, 'Không thể tải lời mời chờ'),
      );
    }

    if (trashResult.status === 'fulfilled') {
      setTrashCount(trashResult.value.length);
    } else if (!shouldIgnoreTaskApiError(trashResult.reason)) {
      console.warn(
        'Không thể cập nhật số lượng thùng rác:',
        getFriendlyErrorMessage(trashResult.reason, 'Không thể tải số lượng thùng rác'),
      );
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
      tasksError,
      trashError,
      pendingInvitesCount,
      trashCount,
      fetchTasks,
      fetchTrashTasks,
      fetchCategories,
      fetchTeams,
      fetchTaskBadges,
      abortActiveQueries,
      resetState,
    }),
    [
      tasks,
      trashTasks,
      categories,
      teams,
      loading,
      trashLoading,
      tasksError,
      trashError,
      pendingInvitesCount,
      trashCount,
      fetchTasks,
      fetchTrashTasks,
      fetchCategories,
      fetchTeams,
      fetchTaskBadges,
      abortActiveQueries,
      resetState,
    ],
  );
}
