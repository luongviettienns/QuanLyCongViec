import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../types/category.types';
import { getAuthHeaders, handleApiResponse } from '../../../shared/api';

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const response = await fetch('/categories', {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Category[]>(response, 'Không thể tải danh mục');
}

export async function createCategory(payload: CreateCategoryPayload): Promise<Category> {
  const response = await fetch('/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Category>(response, 'Không thể tạo danh mục');
}

export async function updateCategory(
  id: number,
  payload: UpdateCategoryPayload,
): Promise<Category> {
  const response = await fetch(`/categories/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Category>(response, 'Không thể cập nhật danh mục');
}

export async function deleteCategory(
  id: number,
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`/categories/${id}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<{ success: boolean; message: string }>(
    response,
    'Không thể xoá danh mục',
  );
}
