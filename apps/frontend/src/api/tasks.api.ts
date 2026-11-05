import type {
  Task,
  Category,
  CreateTaskPayload,
  UpdateTaskPayload,
  UpdateTaskContentPayload,
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
  params?: {
    search?: string;
    status?: string;
    categoryId?: number;
    priority?: string;
    teamId?: number;
    assigneeId?: number;
    scope?: string;
  },
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
  if (params?.teamId !== undefined) {
    searchParams.append('teamId', String(params.teamId));
  }
  if (params?.assigneeId !== undefined) {
    searchParams.append('assigneeId', String(params.assigneeId));
  }
  if (params?.scope) {
    searchParams.append('scope', params.scope);
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

export async function updateTaskContent(id: number, payload: UpdateTaskContentPayload): Promise<Task> {
  const response = await fetch(`/tasks/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Task>(response, 'Không thể cập nhật nội dung công việc');
}

export async function updateTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  const response = await fetch(`/tasks/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ status }),
  });

  return handleApiResponse<Task>(response, 'Không thể cập nhật trạng thái công việc');
}

export async function updateTaskAssignee(id: number, assigneeId: number | null): Promise<Task> {
  const response = await fetch(`/tasks/${id}/assignee`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ assigneeId }),
  });

  return handleApiResponse<Task>(response, 'Không thể thay đổi người thực hiện công việc');
}

export async function returnTask(id: number, reason?: string): Promise<Task> {
  const response = await fetch(`/tasks/${id}/return`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ reason }),
  });

  return handleApiResponse<Task>(response, 'Không thể trả lại công việc');
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

export async function reorderTasks(taskIds: number[], status?: TaskStatus, teamId?: number): Promise<void> {
  const response = await fetch('/tasks/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ taskIds, status, teamId }),
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseError(response, 'Không thể lưu thứ tự công việc');
  }
}

export async function moveTaskTeam(
  id: number,
  teamId: number | null,
  assigneeId?: number | null,
): Promise<Task> {
  const response = await fetch(`/tasks/${id}/team`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ teamId, assigneeId }),
  });

  return handleApiResponse<Task>(response, 'Không thể chuyển nhóm cho công việc');
}

export async function getTaskStats(
  paramsOrSignal?: { teamId?: number; scope?: string } | AbortSignal,
  maybeSignal?: AbortSignal,
): Promise<TaskStats> {
  const isSignal = paramsOrSignal instanceof AbortSignal;
  const params = isSignal ? undefined : paramsOrSignal;
  const signal = isSignal ? paramsOrSignal : maybeSignal;

  const searchParams = new URLSearchParams();
  if (params?.teamId !== undefined) {
    searchParams.append('teamId', String(params.teamId));
  }
  if (params?.scope) {
    searchParams.append('scope', params.scope);
  }
  const queryString = searchParams.toString();
  const url = queryString ? `/tasks/stats?${queryString}` : '/tasks/stats';
  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<TaskStats>(response, 'Không thể tải số liệu thống kê công việc');
}
