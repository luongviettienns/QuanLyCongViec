import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { Task, Category, StatusFilter, TaskStatus } from '../types/task.types';
import {
  getTasks,
  getCategories,
  deleteTask,
  reorderTasks,
} from '../api/tasks.api';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const abortControllerRef = useRef<AbortController | null>(null);
  const isFiltering = searchText.trim() !== '' || statusFilter !== 'ALL';

  const fetchTasks = useCallback(
    async (search = '', status: StatusFilter = 'ALL') => {
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
    [],
  );

  const fetchCategories = useCallback(async () => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Lỗi danh mục:', error);
    }
  }, []);

  useEffect(() => {
    async function init() {
      await Promise.all([fetchCategories(), fetchTasks('', 'ALL')]);
    }

    void init();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCategories, fetchTasks]);

  function handleSearch(value: string) {
    setSearchText(value);
    setLoading(true);
    void fetchTasks(value, statusFilter);
  }

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value);
    setLoading(true);
    void fetchTasks(searchText, value);
  }

  function handleReset() {
    setSearchText('');
    setStatusFilter('ALL');
    setLoading(true);
    void fetchTasks('', 'ALL');
  }

  async function refetch() {
    setLoading(true);
    await Promise.all([fetchTasks(searchText, statusFilter), fetchCategories()]);
  }

  async function handleDelete(id: number) {
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
      message.success('Cập nhật thứ tự công việc thành công');
      await fetchTasks(searchText, statusFilter);
    } catch (error) {
      console.error(error);
      setTasks(previousTasks);
      message.error(error instanceof Error ? error.message : 'Lỗi khi sắp xếp lại');
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
  };
}
