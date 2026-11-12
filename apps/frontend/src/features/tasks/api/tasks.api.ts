import type {
  Task,
  TrashTask,
  TaskCollaborator,
  Subtask,
  CreateTaskPayload,
  UpdateTaskPayload,
  UpdateTaskContentPayload,
  TaskStatus,
  TaskStats,
  BulkTaskResult,
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
    deadlineFilter?: string;
    sortBy?: string;
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
  if (params?.deadlineFilter && params.deadlineFilter !== 'ALL') {
    searchParams.append('deadlineFilter', params.deadlineFilter);
  }
  if (params?.sortBy && params.sortBy !== 'default') {
    searchParams.append('sortBy', params.sortBy);
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

export async function getTrashTasks(
  params?: {
    search?: string;
    status?: string;
    categoryId?: number;
    priority?: string;
    teamId?: number;
    assigneeId?: number;
    scope?: string;
    deadlineFilter?: string;
    sortBy?: string;
  },
  signal?: AbortSignal,
): Promise<TrashTask[]> {
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
  if (params?.deadlineFilter && params.deadlineFilter !== 'ALL') {
    searchParams.append('deadlineFilter', params.deadlineFilter);
  }
  if (params?.sortBy && params.sortBy !== 'default') {
    searchParams.append('sortBy', params.sortBy);
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/tasks/trash?${queryString}` : '/api/tasks/trash';
  const response = await fetch(url, {
    headers: {
      ...getAuthHeaders(),
    },
    signal,
  });

  return handleApiResponse<TrashTask[]>(response, 'Không thể tải danh sách công việc đã xoá');
}

export async function restoreTask(id: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/restore`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<Task>(response, 'Không thể khôi phục công việc');
}

export async function permanentDeleteTask(id: number): Promise<void> {
  const response = await fetch(`/api/tasks/${id}/permanent`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  await handleVoidApiResponse(response, 'Không thể xoá vĩnh viễn công việc');
}

async function runBulkTaskRequest(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  fallbackMessage: string,
): Promise<BulkTaskResult> {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...getAuthHeaders(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  return handleApiResponse<BulkTaskResult>(response, fallbackMessage);
}

export function bulkDeleteTasks(taskIds: number[]): Promise<BulkTaskResult> {
  return runBulkTaskRequest('/api/tasks/bulk-delete', 'POST', { taskIds }, 'Không thể xoá hàng loạt công việc');
}

export function bulkUpdateTaskStatus(taskIds: number[], status: TaskStatus): Promise<BulkTaskResult> {
  return runBulkTaskRequest(
    '/api/tasks/bulk-status',
    'PATCH',
    { taskIds, status },
    'Không thể cập nhật trạng thái hàng loạt',
  );
}

export function bulkRestoreTasks(taskIds: number[]): Promise<BulkTaskResult> {
  return runBulkTaskRequest(
    '/api/tasks/trash/bulk-restore',
    'POST',
    { taskIds },
    'Không thể khôi phục hàng loạt công việc',
  );
}

export function bulkPermanentDeleteTasks(taskIds: number[]): Promise<BulkTaskResult> {
  return runBulkTaskRequest(
    '/api/tasks/trash/bulk-permanent-delete',
    'POST',
    { taskIds },
    'Không thể xoá vĩnh viễn hàng loạt công việc',
  );
}

export function emptyTaskTrash(teamId?: number): Promise<BulkTaskResult> {
  const url = teamId !== undefined ? `/api/tasks/trash/empty?teamId=${teamId}` : '/api/tasks/trash/empty';
  return runBulkTaskRequest(url, 'DELETE', undefined, 'Không thể dọn sạch thùng rác');
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

// ==================== COLLABORATOR APIs ====================

export async function getCollaborators(taskId: number): Promise<TaskCollaborator[]> {
  const response = await fetch(`/api/tasks/${taskId}/collaborators`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<TaskCollaborator[]>(response, 'Không thể tải danh sách người phối hợp');
}

export async function inviteCollaborator(taskId: number, userId: number): Promise<TaskCollaborator> {
  const response = await fetch(`/api/tasks/${taskId}/collaborators`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ userId }),
  });

  return handleApiResponse<TaskCollaborator>(response, 'Không thể gửi lời mời phối hợp');
}

export async function respondCollaborator(taskId: number, action: 'ACCEPT' | 'DECLINE'): Promise<TaskCollaborator> {
  const response = await fetch(`/api/tasks/${taskId}/collaborators/respond`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ action }),
  });

  return handleApiResponse<TaskCollaborator>(response, 'Không thể phản hồi lời mời phối hợp');
}

export async function removeCollaborator(taskId: number, targetUserId: number): Promise<TaskCollaborator> {
  const response = await fetch(`/api/tasks/${taskId}/collaborators/${targetUserId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<TaskCollaborator>(response, 'Không thể xóa người phối hợp');
}

// ==================== SUBTASK APIs ====================

export async function getSubtasks(taskId: number): Promise<Subtask[]> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks`, {
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleApiResponse<Subtask[]>(response, 'Không thể tải danh sách công việc con');
}

export async function createSubtask(
  taskId: number,
  data: { title: string; description?: string; assigneeId?: number | null },
): Promise<Subtask> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  return handleApiResponse<Subtask>(response, 'Không thể tạo công việc con');
}

export async function updateSubtask(
  taskId: number,
  subtaskId: number,
  data: { title?: string; description?: string | null; assigneeId?: number | null; status?: TaskStatus },
): Promise<Subtask> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  return handleApiResponse<Subtask>(response, 'Không thể cập nhật công việc con');
}

export async function updateSubtaskStatus(
  taskId: number,
  subtaskId: number,
  status: TaskStatus,
): Promise<Subtask> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ status }),
  });

  return handleApiResponse<Subtask>(response, 'Không thể cập nhật trạng thái công việc con');
}

export async function deleteSubtask(taskId: number, subtaskId: number): Promise<void> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders(),
    },
  });

  return handleVoidApiResponse(response, 'Không thể xoá công việc con');
}

export async function reorderSubtasks(taskId: number, subtaskIds: number[]): Promise<Subtask[]> {
  const response = await fetch(`/api/tasks/${taskId}/subtasks/reorder`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ subtaskIds }),
  });

  return handleApiResponse<Subtask[]>(response, 'Không thể sắp xếp công việc con');
}
