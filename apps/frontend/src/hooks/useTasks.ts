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

  const loadTasks = useCallback(
    async (search = searchText, status = statusFilter) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const data = await getTasks(
          { search, status: status === 'ALL' ? undefined : status },
          controller.signal,
        );
        setTasks(data);
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
    [searchText, statusFilter],
  );

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await getCategories(signal);
      setCategories(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Lỗi danh mục:', error);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function init() {
      try {
        const [categoriesData, tasksData] = await Promise.all([
          getCategories(controller.signal),
          getTasks(undefined, controller.signal),
        ]);
        if (!ignore) {
          setCategories(categoriesData);
          setTasks(tasksData);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        if (!ignore) {
          console.error('Lỗi khi tải dữ liệu khởi tạo:', error);
          message.error(error instanceof Error ? error.message : 'Lỗi khi tải dữ liệu');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      ignore = true;
      controller.abort();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  function handleSearch(value: string) {
    setSearchText(value);
    void loadTasks(value, statusFilter);
  }

  function handleStatusChange(value: StatusFilter) {
    setStatusFilter(value);
    void loadTasks(searchText, value);
  }

  function handleReset() {
    setSearchText('');
    setStatusFilter('ALL');
    void loadTasks('', 'ALL');
  }

  async function refetch() {
    await Promise.all([loadTasks(searchText, statusFilter), loadCategories()]);
  }

  async function handleDelete(id: number) {
    try {
      await deleteTask(id);
      message.success('Xoá công việc thành công');
      await loadTasks();
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
      await loadTasks();
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
