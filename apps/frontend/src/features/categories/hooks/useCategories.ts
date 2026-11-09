import { useState, useEffect, useRef, useCallback } from 'react';
import { message } from 'antd';
import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
  CategoryQueryParams,
} from '../types/category.types';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../api/categories.api';
import { useAuth } from '../../auth/hooks/useAuth';
import { UnauthorizedError } from '../../../shared/api';

export interface UseCategoriesOptions {
  teamId?: number | null;
  scope?: 'all' | 'personal' | 'team';
}

export function useCategories(options?: UseCategoriesOptions) {
  const { user } = useAuth();
  const [teamId, setTeamId] = useState<number | null | undefined>(options?.teamId);
  const [scope, setScope] = useState<'all' | 'personal' | 'team' | undefined>(options?.scope);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchCategories = useCallback(
    async (overrideParams?: CategoryQueryParams) => {
      if (!user) {
        setCategories([]);
        setLoading(false);
        return;
      }

      const effectiveTeamId =
        overrideParams?.teamId !== undefined ? overrideParams.teamId : teamId;
      const effectiveScope =
        overrideParams?.scope !== undefined ? overrideParams.scope : scope;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);

      try {
        const data = await getCategories(
          {
            teamId: effectiveTeamId === null ? undefined : effectiveTeamId,
            scope: effectiveScope,
          },
          controller.signal,
        );
        if (abortControllerRef.current === controller) {
          setCategories(data);
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
          error instanceof Error ? error.message : 'Không thể tải danh mục',
        );
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    },
    [user, teamId, scope],
  );

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
      const effectivePayload: CreateCategoryPayload = {
        ...payload,
        teamId:
          payload.teamId !== undefined
            ? payload.teamId
            : teamId === null
              ? undefined
              : teamId,
      };
      const newCategory = await createCategory(effectivePayload);
      setCategories((prev) => [...prev, newCategory]);
      message.success(`Đã thêm danh mục "${newCategory.name}"`);
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedError ||
        (error instanceof Error && error.name === 'UnauthorizedError')
      ) {
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
      const updatedCategory = await updateCategory(id, payload);
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? updatedCategory : c)),
      );
      message.success(`Đã cập nhật danh mục "${updatedCategory.name}"`);
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedError ||
        (error instanceof Error && error.name === 'UnauthorizedError')
      ) {
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
      setCategories((prev) => prev.filter((c) => c.id !== id));
      message.success(res.message);
      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedError ||
        (error instanceof Error && error.name === 'UnauthorizedError')
      ) {
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
    teamId,
    setTeamId,
    scope,
    setScope,
    fetchCategories,
    handleCreate,
    handleUpdate,
    handleDelete,
  };
}
