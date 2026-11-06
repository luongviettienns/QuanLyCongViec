import type { Dayjs } from 'dayjs';
import type { Category } from '../../categories/types/category.types';
import type { TeamMemberUser } from '../../teams/types/team.types';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type StatusFilter = 'ALL' | TaskStatus;

export type PriorityFilter = 'ALL' | TaskPriority;

export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  HIGH: { color: 'red', label: 'Cao' },
  MEDIUM: { color: 'orange', label: 'Trung bình' },
  LOW: { color: 'blue', label: 'Thấp' },
};

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
