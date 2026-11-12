export type TeamRole = 'ADMIN' | 'MEMBER';

export interface TeamMemberUser {
  id: number;
  name: string;
  email: string;
}

export interface TeamMember {
  id: number;
  teamId: number;
  userId: number;
  role: TeamRole;
  joinedAt: string;
  user: TeamMemberUser;
}

export interface Team {
  id: number;
  name: string;
  description?: string | null;
  ownerId: number;
  owner?: TeamMemberUser;
  members: TeamMember[];
  currentUserRole?: TeamRole;
  _count?: {
    members: number;
    tasks: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateTeamPayload {
  name: string;
  description?: string;
}

export interface UpdateTeamPayload {
  name?: string;
  description?: string;
}

export interface AddMemberPayload {
  email: string;
  role?: TeamRole;
}

export interface UpdateMemberRolePayload {
  role: TeamRole;
}

export interface TransferOwnershipPayload {
  newOwnerId: number;
}

export type TeamActivityAction =
  | 'ADD_MEMBER'
  | 'REMOVE_MEMBER'
  | 'LEAVE_TEAM'
  | 'CHANGE_ROLE'
  | 'TRANSFER_OWNER'
  | 'TASK_CREATED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_ASSIGNED'
  | 'TASK_UNASSIGNED'
  | 'TASK_DELETED'
  | 'TASK_RESTORED'
  | 'TASK_RETURNED'
  | 'TASK_MOVED_OUT'
  | 'TASK_MOVED_IN'
  | 'TASK_DEADLINE_CHANGED'
  | 'TASK_PRIORITY_CHANGED'
  | 'TASK_UPDATED'
  | 'SUBTASK_COMPLETED'
  | 'SUBTASK_REOPENED'
  | 'COLLABORATOR_INVITED'
  | 'COLLABORATOR_ACCEPTED'
  | 'COLLABORATOR_DECLINED'
  | 'COLLABORATOR_REMOVED'
  | 'COLLABORATOR_ADDED';

export interface TeamActivityActor {
  id: number;
  name: string;
}

export interface TeamActivityLog {
  id: number;
  teamIdSnapshot: number;
  teamNameSnapshot: string;
  teamId: number | null;
  actorId: number | null;
  targetUserId: number | null;
  action: TeamActivityAction;
  oldRole: TeamRole | null;
  newRole: TeamRole | null;
  metadata: {
    unassignedTaskCount?: number;
    affectedSubtaskCount?: number;
    revokedCollaboratorCount?: number;
    previousOwnerId?: number;
    newOwnerId?: number;
    taskId?: number;
    taskTitle?: string;
    oldStatus?: string;
    newStatus?: string;
    previousAssigneeId?: number;
    newAssigneeId?: number | null;
    fromTeamId?: number | null;
    toTeamId?: number | null;
    oldDueDate?: string | null;
    newDueDate?: string | null;
    oldPriority?: string;
    newPriority?: string;
    changedFields?: string[];
    reason?: string;
    subtaskId?: number;
    subtaskTitle?: string;
    priority?: string;
    isSelfLeave?: boolean;
    [key: string]: unknown;
  } | null;
  createdAt: string;
  actor?: TeamMemberUser | null;
  targetUser?: TeamMemberUser | null;
}

export interface PaginatedTeamActivityLogs {
  data: TeamActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  actors?: TeamActivityActor[];
}

export interface GetTeamActivityLogsQuery {
  page?: number;
  limit?: number;
  action?: TeamActivityAction | string;
  actorId?: number;
}
