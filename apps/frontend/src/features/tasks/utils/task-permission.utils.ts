import type { Task, TaskStatus } from '../types/task.types';
import type { Team } from '../../teams/types/team.types';
import type { User } from '../../auth/types/auth.types';

export type TaskActorRole = 'OWNER' | 'ADMIN' | 'CREATOR' | 'ASSIGNEE' | 'MEMBER';

export interface TaskPermissions {
  /** Array of active roles the user has for this specific task */
  roles: TaskActorRole[];
  /** Primary role for display */
  primaryRole: TaskActorRole;
  /** Whether the user can edit title, description, dates, priority, category */
  canEditContent: boolean;
  /** Whether the user can change assignee of the task */
  canChangeAssignee: boolean;
  /** Whether the user can delete the task */
  canDelete: boolean;
  /** Whether the user can return this task to the creator */
  canReturnTask: boolean;
  /** Whether the user can change the status in general */
  canChangeStatus: boolean;
  /** Whether the user can pick up and drag the card on the Kanban board */
  canDrag: boolean;
  /** If dragging is disabled, the reason to explain in a tooltip */
  dragDisabledReason?: string;
  /** List of statuses this task can transition to from its current status */
  allowedNextStatuses: TaskStatus[];
  /** Role badge for visual display if appropriate */
  roleBadge?: {
    label: string;
    color: string;
    tooltip?: string;
  };
}

const ASSIGNEE_ALLOWED_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  DONE: [],
};

const ALL_STATUSES: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/**
 * Resolves all actor roles a user has with respect to a task.
 * Perfectly mirrors backend TaskWorkflowPolicy.getActorRoles.
 */
export function getTaskActorRoles(
  user: User | null | undefined,
  task: Task,
  team?: Team | null,
): TaskActorRole[] {
  if (!user) {
    return [];
  }

  const userId = user.id;

  // Personal task (no team)
  if (!task.teamId && !team) {
    if (task.userId === userId) {
      return task.assigneeId === userId
        ? ['OWNER', 'CREATOR', 'ASSIGNEE']
        : ['OWNER', 'CREATOR'];
    }
    if (task.assigneeId === userId) {
      return ['ASSIGNEE'];
    }
    return [];
  }

  // Team task
  const resolvedTeam = team ?? (task.team ? ({ id: task.team.id, ownerId: (task.team as { ownerId?: number }).ownerId ?? -1, members: [] } as unknown as Team) : null);
  
  const isOwner = Boolean(
    resolvedTeam && (resolvedTeam.ownerId === userId || (resolvedTeam.owner && resolvedTeam.owner.id === userId))
  );

  const isMember = Boolean(
    isOwner ||
    resolvedTeam?.members?.some((m) => m.userId === userId) ||
    resolvedTeam?.currentUserRole !== undefined
  );

  if (!isMember) {
    return [];
  }

  const isAdmin = Boolean(
    isOwner ||
    resolvedTeam?.currentUserRole === 'ADMIN' ||
    resolvedTeam?.members?.some((m) => m.userId === userId && m.role === 'ADMIN')
  );

  const roles: TaskActorRole[] = [];
  if (isOwner) {
    roles.push('OWNER');
  }
  if (isAdmin && !isOwner) {
    roles.push('ADMIN');
  }
  if (task.userId === userId) {
    roles.push('CREATOR');
  }
  if (task.assigneeId === userId) {
    roles.push('ASSIGNEE');
  }
  roles.push('MEMBER');

  return roles;
}

/**
 * Checks whether an actor role can transition a task from currentStatus to nextStatus.
 * Perfectly mirrors backend TaskWorkflowPolicy.canRoleTransition.
 */
function canRoleTransition(
  role: TaskActorRole,
  currentStatus: TaskStatus,
  nextStatus: TaskStatus,
): boolean {
  if (role === 'OWNER' || role === 'ADMIN' || role === 'CREATOR') {
    return true;
  }

  if (role === 'ASSIGNEE') {
    if (currentStatus === nextStatus) {
      return currentStatus !== 'DONE';
    }
    return ASSIGNEE_ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus);
  }

  return false;
}

/**
 * Checks whether a user can transition a task from its current status to nextStatus.
 * Perfectly mirrors backend TaskWorkflowPolicy.canTransition.
 */
export function canTransitionTask(
  user: User | null | undefined,
  task: Task,
  nextStatus: TaskStatus,
  team?: Team | null,
): boolean {
  if (!user) {
    return false;
  }

  const roles = getTaskActorRoles(user, task, team);
  if (roles.length === 0) {
    return false;
  }

  return roles.some((role) => canRoleTransition(role, task.status, nextStatus));
}

/**
 * Checks whether a user can reorder a task in its current column.
 */
export function canReorderTask(
  user: User | null | undefined,
  task: Task,
  team?: Team | null,
): boolean {
  return canTransitionTask(user, task, task.status, team);
}

/**
 * Computes all allowed target statuses that the user can move this task to.
 */
export function getAllowedNextStatuses(
  user: User | null | undefined,
  task: Task,
  team?: Team | null,
): TaskStatus[] {
  if (!user) {
    return [];
  }
  return ALL_STATUSES.filter((status) => canTransitionTask(user, task, status, team));
}

/**
 * Evaluates full permissions and UX affordances for a task given the current user and team context.
 */
export function getTaskPermissions(
  user: User | null | undefined,
  task: Task,
  team?: Team | null,
): TaskPermissions {
  if (!user) {
    return {
      roles: [],
      primaryRole: 'MEMBER',
      canEditContent: false,
      canChangeAssignee: false,
      canDelete: false,
      canReturnTask: false,
      canChangeStatus: false,
      canDrag: false,
      dragDisabledReason: 'Vui lòng đăng nhập để thao tác',
      allowedNextStatuses: [],
    };
  }

  const roles = getTaskActorRoles(user, task, team);
  const isOwner = roles.includes('OWNER');
  const isAdmin = roles.includes('ADMIN');
  const isCreator = roles.includes('CREATOR');
  const isAssignee = roles.includes('ASSIGNEE');
  const isManager = isOwner || isAdmin || isCreator;
  const isTeamTask = Boolean(task.teamId || team);

  const allowedNextStatuses = ALL_STATUSES.filter(
    (status) => status !== task.status && canTransitionTask(user, task, status, team),
  );

  const canEditContent = !isTeamTask ? isCreator : isManager;
  const canChangeAssignee = !isTeamTask ? isCreator : isManager;
  const canDelete = !isTeamTask ? isCreator : isManager;
  const canChangeStatus = !isTeamTask ? isCreator : isManager || (isAssignee && task.status !== 'DONE');

  const canReturnTask = Boolean(
    isTeamTask &&
    isAssignee &&
    !isCreator &&
    task.status !== 'DONE' &&
    roles.length > 0,
  );

  // Can this task be dragged on Kanban?
  // Only if the user can move it to another status OR reorder within the same status.
  const canMove = allowedNextStatuses.length > 0;
  const canReorder = canReorderTask(user, task, team);
  const canDrag = canMove || canReorder;

  let dragDisabledReason: string | undefined;
  if (!canDrag) {
    if (roles.length === 0) {
      dragDisabledReason = 'Bạn không có quyền thao tác trên công việc này';
    } else if (task.status === 'DONE' && isAssignee && !isManager) {
      dragDisabledReason = 'Công việc đã hoàn thành. Chỉ người tạo hoặc quản trị viên mới có thể mở lại.';
    } else if (!isManager && !isAssignee) {
      dragDisabledReason = 'Chỉ người tạo, người được giao hoặc quản trị viên mới có thể chuyển trạng thái.';
    } else {
      dragDisabledReason = 'Không thể di chuyển công việc này';
    }
  }

  // Determine primary display badge
  let roleBadge: TaskPermissions['roleBadge'];
  if (isManager && isTeamTask) {
    if (isOwner) {
      roleBadge = { label: 'Chủ sở hữu', color: 'blue', tooltip: 'Bạn là chủ sở hữu của nhóm này' };
    } else if (isAdmin) {
      roleBadge = { label: 'Quản trị', color: 'geekblue', tooltip: 'Bạn là quản trị viên nhóm' };
    } else if (isCreator) {
      roleBadge = { label: 'Người tạo', color: 'cyan', tooltip: 'Bạn là người tạo công việc này' };
    }
  } else if (isAssignee) {
    roleBadge = { label: 'Được giao cho bạn', color: 'purple', tooltip: 'Bạn là người thực hiện công việc này' };
  } else if (!isTeamTask && isCreator) {
    roleBadge = { label: 'Cá nhân', color: 'default' };
  }

  const primaryRole = roles[0] ?? 'MEMBER';

  return {
    roles,
    primaryRole,
    canEditContent,
    canChangeAssignee,
    canDelete,
    canReturnTask,
    canChangeStatus,
    canDrag,
    dragDisabledReason,
    allowedNextStatuses,
    roleBadge,
  };
}
