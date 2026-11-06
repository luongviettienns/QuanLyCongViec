import type { Dayjs } from 'dayjs';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type StatusFilter = 'ALL' | TaskStatus;

export type PriorityFilter = 'ALL' | TaskPriority;

export type TeamRole = 'ADMIN' | 'MEMBER';

export interface Category {
  id: number;
  name: string;
  color: string;
}

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

export interface Task {
  id: number;
  userId?: number;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  categoryId?: number | null;
  category?: Category | null;
  teamId?: number | null;
  team?: { id: number; name: string } | null;
  assigneeId?: number | null;
  assignee?: TeamMemberUser | null;
  position?: number;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface TaskFormValues {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  categoryId?: number | null;
  teamId?: number | null;
  assigneeId?: number | null;
  startDate?: Dayjs | null;
  dueDate?: Dayjs | null;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  categoryId?: number | null;
  teamId?: number | null;
  assigneeId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  categoryId?: number | null;
  teamId?: number | null;
  assigneeId?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
}

export interface UpdateTaskContentPayload {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  categoryId?: number | null;
}

export interface ReturnTaskPayload {
  reason: string;
}

export interface TransferOwnershipPayload {
  newOwnerId: number;
}

export interface CreateCategoryPayload {
  name: string;
  color?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  color?: string;
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

export interface TaskPriorityStats {
  low: number;
  medium: number;
  high: number;
}

export interface TaskDeadlinePoint {
  date: string;
  count: number;
}

export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  dueSoon: number;
  completionRate: number;
  byPriority: TaskPriorityStats;
  upcomingDeadlines: TaskDeadlinePoint[];
}
