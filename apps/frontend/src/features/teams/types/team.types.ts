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
  | 'TRANSFER_OWNER';

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
  } | null;
  createdAt: string;
  actor?: TeamMemberUser | null;
  targetUser?: TeamMemberUser | null;
}
