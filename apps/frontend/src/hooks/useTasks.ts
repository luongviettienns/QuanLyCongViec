import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { Task, Category, StatusFilter, TaskStatus } from '../types/task.types';
import {
  getTasks,
  getCategories,
  deleteTask,
  reorderTasks,
} from '../api/tasks.api';
import { useAuth } from './useAuth';

export function useTasks() {
  const { user, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFiltering = searchText.trim() !== '' || statusFilter !== 'ALL';

  const resetState = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setTasks([]);
    setCategories([]);
    setSearchText('');
    setStatusFilter('ALL');
    setLoading(false);
  }, []);

  const fetchTasks = useCallback(
    async (search = '', status: StatusFilter = 'ALL') => {
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
          { search, status: status === 'ALL' ? undefined : status },
          controller.signal,
        );
        if (abortControllerRef.current === controller) {
          setTasks(data);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        console.error('Lỗi API:', error);
        message.error(error instanceof Error ? error.message : 'Lỗi khi tải dữ liệu');
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
      console.error('Lỗi danh mục:', error);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
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
      await Promise.all([fetchCategories(), fetchTasks('', 'ALL')]);
    }

    void sync();

    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [user, authLoading, resetState, fetchCategories, fetchTasks]);

  function handleSearch(value: string) {
    if (!user) {
      return;
    }
    setSearchText(value);
    setLoading(true);
    void fetchTasks(value, statusFilter);
  }

  function handleStatusChange(value: StatusFilter) {
    if (!user) {
      return;
    }
    setStatusFilter(value);
    setLoading(true);
    void fetchTasks(searchText, value);
  }

  function handleReset() {
    if (!user) {
      resetState();
      return;
    }
    setSearchText('');
    setStatusFilter('ALL');
    setLoading(true);
    void fetchTasks('', 'ALL');
  }

  async function refetch() {
    if (!user) {
      resetState();
      return;
    }
    setLoading(true);
    await Promise.all([fetchTasks(searchText, statusFilter), fetchCategories()]);
  }

  async function handleDelete(id: number) {
    if (!user) {
      return;
    }
    try {
      await deleteTask(id);
      message.success('Xoá công việc thành công');
      setLoading(true);
      await fetchTasks(searchText, statusFilter);
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : 'Xoá công việc thất bại');
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
      await reorderTasks(taskIds, status);
    } catch (error) {
      setTasks(previousTasks);
      message.error(error instanceof Error ? error.message : 'Không thể lưu vị trí công việc');
    }
  }

  return {
    tasks,
    categories,
    loading,
    searchText,
    statusFilter,
    isFiltering,
    setSearchText,
    handleSearch,
    handleStatusChange,
    handleReset,
    refetch,
    handleDelete,
    handleReorder,
    resetState,
  };
}
