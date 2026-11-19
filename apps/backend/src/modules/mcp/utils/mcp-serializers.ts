import { HttpException } from '@nestjs/common';

export function clampLimit(value: number | undefined, defaultValue: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  const intVal = Math.floor(value);
  if (intVal < 1) return 1;
  if (intVal > max) return max;
  return intVal;
}

export function formatDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
}

interface RawUserRef {
  id: number;
  name: string;
  email?: string;
}

interface RawSubtaskLike {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  position?: number;
  assigneeId?: number | null;
  assignee?: RawUserRef | null;
}

interface RawCollaboratorLike {
  userId: number;
  status: string;
  user?: RawUserRef | null;
}

interface RawTaskLike {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  startDate?: Date | string | null;
  dueDate?: Date | string | null;
  teamId?: number | null;
  team?: { id: number; name?: string | null } | null;
  assigneeId?: number | null;
  assignee?: RawUserRef | null;
  categoryId?: number | null;
  category?: { id: number; name: string; color?: string } | null;
  subtasks?: RawSubtaskLike[];
  collaborators?: RawCollaboratorLike[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export function serializeTaskSummary(task: RawTaskLike) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const completedSubtasks = subtasks.filter((s) => s.status === 'DONE').length;

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    startDate: formatDateOnly(task.startDate),
    dueDate: formatDateOnly(task.dueDate),
    team: task.team ? { id: task.team.id, name: task.team.name ?? null } : null,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    category: task.category ? { id: task.category.id, name: task.category.name } : null,
    checklist: {
      completed: completedSubtasks,
      total: subtasks.length,
    },
  };
}

export function serializeTaskDetail(task: RawTaskLike) {
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const collaborators = Array.isArray(task.collaborators) ? task.collaborators : [];

  return {
    ...serializeTaskSummary(task),
    description: task.description ?? null,
    subtasks: subtasks.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? null,
      status: s.status,
      assignee: s.assignee ? { id: s.assignee.id, name: s.assignee.name } : null,
    })),
    collaborators: collaborators.map((c) => ({
      userId: c.userId,
      name: c.user?.name ?? null,
      status: c.status,
    })),
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : (task.createdAt ?? null),
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : (task.updatedAt ?? null),
  };
}

interface RawTeamMemberLike {
  userId: number;
  role: string;
  user?: RawUserRef | null;
}

interface RawTeamLike {
  id: number;
  name: string;
  description?: string | null;
  ownerId: number;
  owner?: RawUserRef | null;
  members?: RawTeamMemberLike[];
  _count?: { members?: number; tasks?: number };
}

function resolveMemberRole(team: RawTeamLike, userId: number): string {
  if (team.ownerId === userId) return 'OWNER';
  const member = team.members?.find((m) => m.userId === userId);
  return member?.role ?? 'MEMBER';
}

export function serializeTeamSummary(team: RawTeamLike, currentUserId: number) {
  return {
    id: team.id,
    name: team.name,
    description: team.description ?? null,
    myRole: resolveMemberRole(team, currentUserId),
    owner: team.owner ? { id: team.owner.id, name: team.owner.name } : null,
    memberCount: team._count?.members ?? team.members?.length ?? 0,
    taskCount: team._count?.tasks ?? 0,
  };
}

export function serializeTeamDetail(team: RawTeamLike, currentUserId: number) {
  const memberMap = new Map<number, { userId: number; name: string | null; role: string }>();
  if (team.owner) {
    memberMap.set(team.owner.id, {
      userId: team.owner.id,
      name: team.owner.name,
      role: 'OWNER',
    });
  }
  for (const m of team.members ?? []) {
    if (memberMap.has(m.userId)) continue;
    memberMap.set(m.userId, {
      userId: m.userId,
      name: m.user?.name ?? null,
      role: m.userId === team.ownerId ? 'OWNER' : m.role,
    });
  }

  return {
    ...serializeTeamSummary(team, currentUserId),
    members: Array.from(memberMap.values()),
  };
}

interface RawNotificationLike {
  id: number;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  taskId?: number | null;
  subtaskId?: number | null;
  teamId?: number | null;
  actor?: RawUserRef | null;
  createdAt?: Date | string;
}

export function serializeNotificationItem(item: RawNotificationLike) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content,
    isRead: item.isRead,
    taskId: item.taskId ?? null,
    subtaskId: item.subtaskId ?? null,
    teamId: item.teamId ?? null,
    actor: item.actor ? { id: item.actor.id, name: item.actor.name } : null,
    createdAt:
      item.createdAt instanceof Date ? item.createdAt.toISOString() : (item.createdAt ?? null),
  };
}

export function formatMcpErrorMessage(
  error: unknown,
  fallbackMessage = 'Không thể thực thi yêu cầu MCP lúc này',
): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string' && response.trim().length > 0) {
      return response.trim();
    }
    if (response && typeof response === 'object' && 'message' in response) {
      const rawMessage = (response as { message?: unknown }).message;
      if (typeof rawMessage === 'string' && rawMessage.trim().length > 0) {
        return rawMessage.trim();
      }
      if (Array.isArray(rawMessage) && rawMessage.length > 0) {
        return rawMessage.map((entry) => String(entry)).join('; ');
      }
    }
    return error.message || 'Yêu cầu không hợp lệ';
  }
  return fallbackMessage;
}
