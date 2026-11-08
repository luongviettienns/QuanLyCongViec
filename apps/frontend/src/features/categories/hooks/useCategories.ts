import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../types/category.types';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categories.api';
import { useAuth } from '../../auth/hooks/useAuth';
import { UnauthorizedError } from '../../../shared/api';

export function useCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);

    try {
      const data = await getCategories(controller.signal);
      if (abortControllerRef.current === controller) {
        setCategories(data);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return;
      }
      message.error(
        error instanceof Error ? error.message : 'Không thể tải danh mục',
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    async function sync() {
      await Promise.resolve();
      if (!active) return;

      if (!user) {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setCategories([]);
        setLoading(false);
        return;
      }

      await fetchCategories();
    }

    void sync();

    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [user, fetchCategories]);

  async function handleCreate(payload: CreateCategoryPayload): Promise<boolean> {
    try {
      setLoading(true);
      const newCategory = await createCategory(payload);
      setCategories((prev) => [...prev, newCategory]);
      message.success(`Đã thêm danh mục "${newCategory.name}"`);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return false;
      }
      message.error(
        error instanceof Error ? error.message : 'Không thể tạo danh mục',
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(
    id: number,
    payload: UpdateCategoryPayload,
  ): Promise<boolean> {
    try {
      setLoading(true);
      const updated = await updateCategory(id, payload);
      setCategories((prev) =>
        prev.map((cat) => (cat.id === id ? updated : cat)),
      );
      message.success(`Đã cập nhật danh mục "${updated.name}"`);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return false;
      }
      message.error(
        error instanceof Error ? error.message : 'Không thể cập nhật danh mục',
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number): Promise<boolean> {
    try {
      setLoading(true);
      const res = await deleteCategory(id);
      setCategories((prev) => prev.filter((cat) => cat.id !== id));
      message.success(res.message || 'Đã xoá danh mục thành công');
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.name === 'UnauthorizedError')) {
        return false;
      }
      message.error(
        error instanceof Error ? error.message : 'Không thể xoá danh mục',
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    categories,
    loading,
    refetch: fetchCategories,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}
