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
import {
  isAbortError,
  isForbiddenError,
  isNotFoundError,
  isUnauthorizedError,
  getFriendlyErrorMessage,
} from '../../../shared/api';

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
  const [error, setError] = useState<unknown>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastContextRef = useRef<{
    teamId: number | null | undefined;
    scope: 'all' | 'personal' | 'team' | undefined;
  } | null>(null);

  const fetchCategories = useCallback(
    async (overrideParams?: CategoryQueryParams) => {
      if (!user) {
        lastContextRef.current = null;
        setCategories([]);
        setError(null);
        setLoading(false);
        return;
      }

      const effectiveTeamId =
        overrideParams?.teamId !== undefined ? overrideParams.teamId : teamId;
      const effectiveScope =
        overrideParams?.scope !== undefined ? overrideParams.scope : scope;

      const contextChanged =
        lastContextRef.current !== null &&
        (lastContextRef.current.teamId !== effectiveTeamId ||
          lastContextRef.current.scope !== effectiveScope);
      lastContextRef.current = {
        teamId: effectiveTeamId,
        scope: effectiveScope,
      };
      if (contextChanged) {
        setCategories([]);
        setError(null);
      }

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
        if (!controller.signal.aborted && abortControllerRef.current === controller) {
          setCategories(data);
          setError(null);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted || isAbortError(err) || isUnauthorizedError(err)) {
          return;
        }
        if (abortControllerRef.current === controller) {
          if (isForbiddenError(err) || isNotFoundError(err)) {
            setCategories([]);
          }
          setError(err);
        }
      } finally {
        if (!controller.signal.aborted && abortControllerRef.current === controller) {
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
        lastContextRef.current = null;
        setCategories([]);
        setError(null);
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
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) {
        return false;
      }
      message.error(getFriendlyErrorMessage(err, 'Không thể tạo danh mục'));
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
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) {
        return false;
      }
      message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật danh mục'));
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
      message.success(res.message || 'Đã xoá danh mục');
      return true;
    } catch (err: unknown) {
      if (isAbortError(err) || isUnauthorizedError(err)) {
        return false;
      }
      message.error(getFriendlyErrorMessage(err, 'Không thể xoá danh mục'));
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    categories,
    loading,
    error,
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
