import {
  AiActionType,
  TaskPriority,
  TaskStatus,
  TeamRole,
  type TeamMember,
} from '@prisma/client';
import type { PrismaService } from '../../../database/prisma.service.js';
import type { TaskWithTeamAndMembers } from '../../tasks/policies/task-policy.service.js';

export type AiProposalErrorCode = 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT';

export interface AiCreateTaskPreview {
  kind: 'CREATE_TASK';
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  team: { id: number; name: string } | null;
  assignee: { id: number; name: string } | null;
  category: { id: number; name: string } | null;
  collaborators: Array<{ id: number; name: string }>;
}

export interface AiUpdateTaskChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface AiUpdateTaskPreview {
  kind: 'UPDATE_TASK';
  taskId: number;
  taskTitle: string;
  changes: AiUpdateTaskChange[];
}

export interface AiDeleteTaskPreview {
  kind: 'DELETE_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string | null;
  subtaskCount: number;
}

export interface AiRestoreTaskPreview {
  kind: 'RESTORE_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string | null;
}

export interface AiReturnTaskPreview {
  kind: 'RETURN_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string;
  reason: string;
}

export interface AiCreateSubtaskPreview {
  kind: 'CREATE_SUBTASK';
  taskId: number;
  taskTitle: string;
  title: string;
  description: string | null;
  assignee: { id: number; name: string } | null;
}

export interface AiUpdateSubtaskPreview {
  kind: 'UPDATE_SUBTASK';
  taskId: number;
  taskTitle: string;
  subtaskId: number;
  subtaskTitle: string;
  changes: AiUpdateTaskChange[];
}

export interface AiDeleteSubtaskPreview {
  kind: 'DELETE_SUBTASK';
  taskId: number;
  taskTitle: string;
  subtaskId: number;
  subtaskTitle: string;
}

export interface AiAddTeamMemberPreview {
  kind: 'ADD_TEAM_MEMBER';
  teamId: number;
  teamName: string;
  targetUser: { id: number; name: string; email: string };
  role: TeamRole;
}

export interface AiUpdateTeamMemberRolePreview {
  kind: 'UPDATE_TEAM_MEMBER_ROLE';
  teamId: number;
  teamName: string;
  memberUser: { id: number; name: string };
  oldRole: TeamRole;
  newRole: TeamRole;
}

export interface AiRemoveTeamMemberPreview {
  kind: 'REMOVE_TEAM_MEMBER';
  teamId: number;
  teamName: string;
  memberUser: { id: number; name: string };
  memberRole: TeamRole;
  isSelfLeaving: boolean;
}

export type AiProposalPreview =
  | AiCreateTaskPreview
  | AiUpdateTaskPreview
  | AiDeleteTaskPreview
  | AiRestoreTaskPreview
  | AiReturnTaskPreview
  | AiCreateSubtaskPreview
  | AiUpdateSubtaskPreview
  | AiDeleteSubtaskPreview
  | AiAddTeamMemberPreview
  | AiUpdateTeamMemberRolePreview
  | AiRemoveTeamMemberPreview;

export type ValidationFailure = {
  ok: false;
  code: AiProposalErrorCode;
  reason: string;
};

export type ValidatedProposalResult<
  TPreview extends AiProposalPreview = AiProposalPreview,
  TActionType extends AiActionType = AiActionType,
> =
  | {
      ok: true;
      actionType: TActionType;
      payload: Record<string, unknown>;
      preview: TPreview;
    }
  | ValidationFailure;

export type TeamWithMembersAndOwner = {
  id: number;
  name: string;
  ownerId: number;
  owner?: { id: number; name: string } | null;
  members: Array<TeamMember & { user?: { id: number; name: string } | null }>;
};

export type LoadedTask = TaskWithTeamAndMembers & {
  team?: TeamWithMembersAndOwner | null;
  category?: { id: number; name: string } | null;
  assignee?: { id: number; name: string; email?: string } | null;
};

export const VALID_TASK_STATUSES = new Set<string>([
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.DONE,
]);

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'Cần làm',
  [TaskStatus.IN_PROGRESS]: 'Đang làm',
  [TaskStatus.DONE]: 'Hoàn thành',
};

/** Constructs a standardized pre-flight validation failure result. */
export function fail(code: AiProposalErrorCode, reason: string): ValidationFailure {
  return { ok: false, code, reason };
}

/** Parses an optional positive integer field (`undefined` or `null` yields `null`). */
export function parseOptionalPositiveInt(
  value: unknown,
  fieldLabel: string,
): { ok: true; value: number | null } | ValidationFailure {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fail('BAD_REQUEST', `${fieldLabel} phải là số nguyên dương`);
  }
  return { ok: true, value };
}

/** Parses a required positive integer field. */
export function parseRequiredPositiveInt(
  value: unknown,
  fieldLabel: string,
): { ok: true; value: number } | ValidationFailure {
  const check = parseOptionalPositiveInt(value, fieldLabel);
  if (!check.ok) return check;
  if (check.value === null) {
    return fail('BAD_REQUEST', `${fieldLabel} phải là số nguyên dương hợp lệ`);
  }
  return { ok: true, value: check.value };
}

/** Resolves a display `{ id, name }` reference from team context or database lookup. */
export async function resolveTeamOrDbUserRef(
  prisma: PrismaService,
  targetUserId: number,
  team?: TeamWithMembersAndOwner | null,
): Promise<{ id: number; name: string }> {
  if (team) {
    if (team.owner && team.owner.id === targetUserId) {
      return { id: team.owner.id, name: team.owner.name };
    }
    const member = team.members.find((m) => m.userId === targetUserId);
    if (member?.user) {
      return { id: member.user.id, name: member.user.name };
    }
  }

  const user = await prisma.user?.findUnique?.({
    where: { id: targetUserId },
    select: { id: true, name: true },
  });
  return {
    id: targetUserId,
    name: user?.name ?? `Người dùng #${targetUserId}`,
  };
}
