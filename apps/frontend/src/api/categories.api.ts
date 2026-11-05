import type {
  Category,
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '../types/task.types';
import { getAuthHeaders, notifyUnauthorized, UnauthorizedError } from './auth.api';

async function parseError(response: Response, defaultMessage: string): Promise<Error> {
  try {
    const errorData = await response.json();
    const errorMsg =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData?.message)
          ? errorData.message.join(', ')
          : defaultMessage;
    return new Error(errorMsg);
  } catch {
    return new Error(defaultMessage);
  }
}

async function handleApiResponse<T>(response: Response, defaultMessage: string): Promise<T> {
  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseError(response, defaultMessage);
  }

  return response.json();
}

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
