import type {
  Task,
  Category,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskStatus,
  TaskStats,
} from '../types/task.types';
import { getAuthHeaders, notifyUnauthorized } from './auth.api';

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
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseError(response, defaultMessage);
  }

  return response.json();
}

export async function getTasks(
  params?: { search?: string; status?: string; categoryId?: number; priority?: string },
  signal?: AbortSignal,
): Promise<Task[]> {
  const searchParams = new URLSearchParams();
  const cleanSearch = params?.search?.trim();
  if (cleanSearch) {
    searchParams.append('search', cleanSearch);
  }
  if (params?.status && params.status !== 'ALL') {
    searchParams.append('status', params.status);
  }
  if (params?.priority && params.priority !== 'ALL') {
    searchParams.append('priority', params.priority);
  }
  if (params?.categoryId !== undefined) {
    searchParams.append('categoryId', String(params.categoryId));
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/tasks?${queryString}` : '/tasks';
  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Task[]>(response, 'Không thể tải danh sách công việc');
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

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const response = await fetch('/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Task>(response, 'Không thể tạo công việc');
}

export async function updateTask(id: number, payload: UpdateTaskPayload): Promise<Task> {
  const response = await fetch(`/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Task>(response, 'Không thể cập nhật công việc');
}

export async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`/tasks/${id}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseError(response, 'Không thể xoá công việc');
  }
}

export async function reorderTasks(taskIds: number[], status?: TaskStatus): Promise<void> {
  const response = await fetch('/tasks/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ taskIds, status }),
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseError(response, 'Không thể lưu thứ tự công việc');
  }
}

export async function getTaskStats(signal?: AbortSignal): Promise<TaskStats> {
  const response = await fetch('/tasks/stats', {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<TaskStats>(response, 'Không thể tải số liệu thống kê công việc');
}
