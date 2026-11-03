import type {
  Task,
  Category,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskStatus,
} from '../types/task.types';

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

export async function getTasks(
  params?: { search?: string; status?: string },
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

  const queryString = searchParams.toString();
  const url = queryString ? `/tasks?${queryString}` : '/tasks';
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw await parseError(response, 'Không thể tải danh sách công việc');
  }

  return response.json();
}

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const response = await fetch('/categories', { signal });

  if (!response.ok) {
    throw await parseError(response, 'Không thể tải danh mục');
  }

  return response.json();
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const response = await fetch('/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Không thể tạo công việc');
  }

  return response.json();
}

export async function updateTask(id: number, payload: UpdateTaskPayload): Promise<Task> {
  const response = await fetch(`/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Không thể cập nhật công việc');
  }

  return response.json();
}

export async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`/tasks/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await parseError(response, 'Không thể xoá công việc');
  }
}

export async function reorderTasks(taskIds: number[], status?: TaskStatus): Promise<void> {
  const response = await fetch('/tasks/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ taskIds, status }),
  });

  if (!response.ok) {
    throw await parseError(response, 'Không thể lưu thứ tự công việc');
  }
}
