import type { Dayjs } from 'dayjs';
import type { Category } from '../../categories/types/category.types';
import type { TeamMemberUser } from '../../teams/types/team.types';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type CollaboratorStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

export interface TaskCollaborator {
  id: number;
  taskId: number;
  userId: number;
  status: CollaboratorStatus;
  invitedById: number;
  invitedAt: string;
  respondedAt?: string | null;
  user?: { id: number; name: string; email: string };
  invitedBy?: { id: number; name: string; email: string };
}

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  position: number;
  assigneeId?: number | null;
  createdById: number;
  completedById?: number | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: number; name: string; email: string } | null;
  createdBy?: { id: number; name: string; email: string };
  completedBy?: { id: number; name: string; email: string } | null;
}

export type StatusFilter = 'ALL' | TaskStatus;

export type PriorityFilter = 'ALL' | TaskPriority;

export type DeadlineFilter = 'ALL' | 'overdue' | 'due_soon' | 'today' | 'no_due_date';

export type TaskSortBy = 'default' | 'due_date_asc' | 'due_date_desc' | 'priority_desc';

export type TaskViewMode = 'both' | 'kanban' | 'table' | 'trash';

export type ScopeFilter =
  | 'all'
  | 'my_work'
  | 'assigned_to_me'
  | 'collaborating'
  | 'subtasks_assigned_to_me'
  | 'created_by_me'
  | 'pending_invites';

export const TASK_STATUS_CONFIG: Record<TaskStatus, { color: string; label: string }> = {
  TODO: { color: 'orange', label: 'Cần làm' },
  IN_PROGRESS: { color: 'blue', label: 'Đang làm' },
  DONE: { color: 'green', label: 'Hoàn thành' },
};

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  HIGH: { color: 'red', label: 'Cao' },
  MEDIUM: { color: 'orange', label: 'Trung bình' },
  LOW: { color: 'blue', label: 'Thấp' },
};

export interface TaskFilterState {
  searchText: string;
  statusFilter: StatusFilter;
  categoryFilter: number | 'ALL';
  priorityFilter: PriorityFilter;
  teamFilter: number | 'ALL';
  assigneeFilter: number | 'ALL';
  scopeFilter: ScopeFilter;
  deadlineFilter: DeadlineFilter;
  sortBy: TaskSortBy;
}

export type TaskFilterPatch = Partial<TaskFilterState>;

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
  team?: { id: number; name: string; ownerId?: number } | null;
  assigneeId?: number | null;
  assignee?: TeamMemberUser | null;
  position?: number;
  startDate?: string | null;
  dueDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
  collaborators?: TaskCollaborator[];
  subtasks?: Subtask[];
}

export interface TrashTask extends Task {
  deletedAt?: string | null;
  deletedById?: number | null;
  deletedBy?: TeamMemberUser | null;
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
  description?: string | null;
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
