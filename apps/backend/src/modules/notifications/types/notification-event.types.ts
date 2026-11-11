import type { TaskStatus, TeamRole } from '@prisma/client';

export interface TaskAssignedEvent {
  type: 'TASK_ASSIGNED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  assigneeId: number;
  teamId?: number | null;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskUnassignedEvent {
  type: 'TASK_UNASSIGNED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  previousAssigneeId: number;
  teamId?: number | null;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskStatusChangedEvent {
  type: 'TASK_STATUS_CHANGED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  teamId?: number | null;
  creatorId: number;
  assigneeId?: number | null;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskCompletedEvent {
  type: 'TASK_COMPLETED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  creatorId: number;
  assigneeId?: number | null;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskReturnedEvent {
  type: 'TASK_RETURNED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  creatorId: number;
  reason: string;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskDeadlineChangedEvent {
  type: 'TASK_DEADLINE_CHANGED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  newDueDate: string | null;
  teamId?: number | null;
  assigneeId?: number | null;
  creatorId: number;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskDeadlineSoonEvent {
  type: 'TASK_DEADLINE_SOON';
  actorId: number;
  taskId: number;
  taskTitle: string;
  dueDate: string;
  assigneeId?: number | null;
  creatorId: number;
  teamId?: number | null;
  timestamp?: number;
}

export interface TaskOverdueEvent {
  type: 'TASK_OVERDUE';
  actorId: number;
  taskId: number;
  taskTitle: string;
  dueDate: string;
  assigneeId?: number | null;
  creatorId: number;
  teamId?: number | null;
  timestamp?: number;
}

export interface TaskDeletedEvent {
  type: 'TASK_DELETED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  assigneeId?: number | null;
  creatorId: number;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskMovedTeamEvent {
  type: 'TASK_MOVED_TEAM';
  actorId: number;
  taskId: number;
  taskTitle: string;
  targetTeamId: number;
  targetTeamName: string;
  assigneeId?: number | null;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TeamMemberAddedEvent {
  type: 'TEAM_MEMBER_ADDED';
  actorId: number;
  teamId: number;
  teamName: string;
  newMemberId: number;
  role: TeamRole;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TeamMemberRemovedEvent {
  type: 'TEAM_MEMBER_REMOVED';
  actorId: number;
  teamId: number;
  teamName: string;
  removedUserId: number;
  isSelfLeave: boolean;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TeamRoleChangedEvent {
  type: 'TEAM_ROLE_CHANGED';
  actorId: number;
  teamId: number;
  teamName: string;
  targetUserId: number;
  newRole: TeamRole;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TeamOwnershipTransferredEvent {
  type: 'TEAM_OWNERSHIP_TRANSFERRED';
  actorId: number;
  teamId: number;
  teamName: string;
  newOwnerId: number;
  previousOwnerId: number;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TeamDeletedEvent {
  type: 'TEAM_DELETED';
  actorId: number;
  teamId: number;
  teamName: string;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskCollaboratorInvitedEvent {
  type: 'TASK_COLLABORATOR_INVITED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId: number;
  invitedUserId: number;
  invitedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskCollaboratorAcceptedEvent {
  type: 'TASK_COLLABORATOR_ACCEPTED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId: number;
  invitedById: number;
  assigneeId?: number | null;
  respondedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskCollaboratorDeclinedEvent {
  type: 'TASK_COLLABORATOR_DECLINED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId: number;
  invitedById: number;
  assigneeId?: number | null;
  respondedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface TaskCollaboratorRemovedEvent {
  type: 'TASK_COLLABORATOR_REMOVED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId: number;
  removedUserId: number;
  isSelfLeave: boolean;
  assigneeId?: number | null;
  removedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface SubtaskAssignedEvent {
  type: 'SUBTASK_ASSIGNED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  subtaskId: number;
  subtaskTitle: string;
  subtaskAssigneeId: number;
  isReassigned?: boolean;
  previousAssigneeId?: number | null;
  assignedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface SubtaskUnassignedEvent {
  type: 'SUBTASK_UNASSIGNED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  subtaskId: number;
  subtaskTitle: string;
  previousAssigneeId: number;
  reassignedToUserId?: number | null;
  unassignedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface SubtaskStatusChangedEvent {
  type: 'SUBTASK_STATUS_CHANGED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  subtaskId: number;
  subtaskTitle: string;
  oldStatus: TaskStatus;
  newStatus: TaskStatus;
  creatorId: number;
  assigneeId?: number | null;
  subtaskAssigneeId?: number | null;
  changedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface SubtaskCompletedEvent {
  type: 'SUBTASK_COMPLETED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  subtaskId: number;
  subtaskTitle: string;
  creatorId: number;
  assigneeId?: number | null;
  subtaskAssigneeId?: number | null;
  completedById: number;
  completedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export interface SubtaskReopenedEvent {
  type: 'SUBTASK_REOPENED';
  actorId: number;
  taskId: number;
  taskTitle: string;
  teamId?: number | null;
  subtaskId: number;
  subtaskTitle: string;
  newStatus: TaskStatus;
  creatorId: number;
  assigneeId?: number | null;
  subtaskAssigneeId?: number | null;
  reopenedAt?: number | string | Date;
  idempotencyKey?: string;
  timestamp?: number;
}

export type DomainNotificationEvent =
  | TaskAssignedEvent
  | TaskUnassignedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskReturnedEvent
  | TaskDeadlineChangedEvent
  | TaskDeadlineSoonEvent
  | TaskOverdueEvent
  | TaskDeletedEvent
  | TaskMovedTeamEvent
  | TeamMemberAddedEvent
  | TeamMemberRemovedEvent
  | TeamRoleChangedEvent
  | TeamOwnershipTransferredEvent
  | TeamDeletedEvent
  | TaskCollaboratorInvitedEvent
  | TaskCollaboratorAcceptedEvent
  | TaskCollaboratorDeclinedEvent
  | TaskCollaboratorRemovedEvent
  | SubtaskAssignedEvent
  | SubtaskUnassignedEvent
  | SubtaskStatusChangedEvent
  | SubtaskCompletedEvent
  | SubtaskReopenedEvent;
