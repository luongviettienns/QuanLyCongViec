import type {
  Task,
  CreateTaskPayload,
  UpdateTaskPayload,
  UpdateTaskContentPayload,
  TaskStatus,
  TaskStats,
} from '../types/task.types';
import {
  getAuthHeaders,
  handleApiResponse,
  handleVoidApiResponse,
} from '../../../shared/api';

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
  const url = queryString ? `/api/tasks?${queryString}` : '/api/tasks';
  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Task[]>(response, 'Không thể tải danh sách công việc');
}

export async function getTaskById(id: number, signal?: AbortSignal): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}`, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<Task>(response, `Không thể tải thông tin công việc #${id}`);
}

export async function createTask(payload: CreateTaskPayload): Promise<Task> {
  const response = await fetch('/api/tasks', {
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
  const response = await fetch(`/api/tasks/${id}`, {
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
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<Task>(response, 'Không thể cập nhật nội dung công việc');
}

export async function updateTaskStatus(id: number, status: TaskStatus, position?: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ status, ...(position !== undefined ? { position } : {}) }),
  });

  return handleApiResponse<Task>(response, 'Không thể cập nhật trạng thái công việc');
}

export async function updateTaskAssignee(id: number, assigneeId: number | null): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/assignee`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ assigneeId }),
  });

  return handleApiResponse<Task>(response, 'Không thể thay đổi người thực hiện công việc');
}

export async function returnTask(id: number, reason: string): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/return`, {
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
  const response = await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  await handleVoidApiResponse(response, 'Không thể xoá công việc');
}

export async function reorderTasks(taskIds: number[], status?: TaskStatus, teamId?: number): Promise<void> {
  const response = await fetch('/api/tasks/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ taskIds, status, teamId }),
  });

  await handleVoidApiResponse(response, 'Không thể lưu thứ tự công việc');
}

export async function moveTaskTeam(
  id: number,
  teamId: number | null,
  assigneeId?: number | null,
): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/team`, {
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
  const url = queryString ? `/api/tasks/stats?${queryString}` : '/api/tasks/stats';
  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<TaskStats>(response, 'Không thể tải số liệu thống kê công việc');
}
