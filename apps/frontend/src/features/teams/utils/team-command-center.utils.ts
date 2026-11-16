import type { Task, TaskPriority } from '../../tasks/types/task.types.ts';
import type { TeamMember } from '../types/team.types.ts';
import {
  toDateKey,
  addDaysToDateKey,
  diffDateKeys,
  getVietnamTodayKey,
} from '../../tasks/utils/calendar-date.utils.ts';

export type CommandFilterType =
  | 'all'
  | 'in_progress'
  | 'overdue'
  | 'done'
  | 'unassigned'
  | 'due_soon';

export interface TeamCommandMetrics {
  total: number;
  inProgress: number;
  overdue: number;
  done: number;
  unassigned: number;
  dueSoon: number;
}

export interface MemberWorkload {
  userId: number;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: string;
  taskCount: number;
  overdueCount: number;
  inProgressCount: number;
  doneCount: number;
}

export function isTaskOverdue(task: Task, todayKey: string): boolean {
  if (task.status === 'DONE' || !task.dueDate) return false;
  const dueKey = toDateKey(task.dueDate);
  return Boolean(dueKey && dueKey < todayKey);
}

export function isTaskDueSoon(task: Task, todayKey: string): boolean {
  if (task.status === 'DONE' || !task.dueDate) return false;
  const dueKey = toDateKey(task.dueDate);
  if (!dueKey) return false;
  const horizonKey = addDaysToDateKey(todayKey, 7);
  return dueKey >= todayKey && dueKey <= horizonKey;
}

export function computeTeamCommandMetrics(
  tasks: Task[],
  todayKey: string = getVietnamTodayKey(),
): TeamCommandMetrics {
  let total = 0;
  let inProgress = 0;
  let overdue = 0;
  let done = 0;
  let unassigned = 0;
  let dueSoon = 0;

  for (const task of tasks) {
    if (task.deletedAt) continue;
    total += 1;

    if (task.status === 'DONE') {
      done += 1;
    } else {
      if (task.status === 'IN_PROGRESS') {
        inProgress += 1;
      }
      if (!task.assigneeId) {
        unassigned += 1;
      }
      if (isTaskOverdue(task, todayKey)) {
        overdue += 1;
      } else if (isTaskDueSoon(task, todayKey)) {
        dueSoon += 1;
      }
    }
  }

  return {
    total,
    inProgress,
    overdue,
    done,
    unassigned,
    dueSoon,
  };
}

export function computeMemberWorkloads(
  members: TeamMember[],
  tasks: Task[],
  todayKey: string = getVietnamTodayKey(),
): MemberWorkload[] {
  const workloads: MemberWorkload[] = members.map((member) => ({
    userId: member.userId,
    name: member.user?.name || `Thành viên #${member.userId}`,
    email: member.user?.email || '',
    avatarUrl: member.user?.avatarUrl || null,
    role: member.role,
    taskCount: 0,
    overdueCount: 0,
    inProgressCount: 0,
    doneCount: 0,
  }));

  const workloadMap = new Map<number, MemberWorkload>();
  for (const wl of workloads) {
    workloadMap.set(wl.userId, wl);
  }

  for (const task of tasks) {
    if (task.deletedAt || !task.assigneeId) continue;
    const target = workloadMap.get(task.assigneeId);
    if (!target) continue;

    target.taskCount += 1;
    if (task.status === 'DONE') {
      target.doneCount += 1;
    } else {
      if (task.status === 'IN_PROGRESS') {
        target.inProgressCount += 1;
      }
      if (isTaskOverdue(task, todayKey)) {
        target.overdueCount += 1;
      }
    }
  }

  // Sort by taskCount descending, then overdueCount descending
  return workloads.sort((a, b) => {
    if (b.taskCount !== a.taskCount) return b.taskCount - a.taskCount;
    return b.overdueCount - a.overdueCount;
  });
}

export interface FilterTeamTasksOptions {
  filterType?: CommandFilterType;
  assigneeId?: number | null;
  priority?: TaskPriority | 'ALL';
  searchQuery?: string;
  todayKey?: string;
}

export function filterTeamTasks(
  tasks: Task[],
  options: FilterTeamTasksOptions,
): Task[] {
  const {
    filterType = 'all',
    assigneeId,
    priority,
    searchQuery,
    todayKey = getVietnamTodayKey(),
  } = options;

  const normalizedQuery = searchQuery?.trim().toLowerCase();

  return tasks.filter((task) => {
    if (task.deletedAt) return false;

    // Filter by type
    if (filterType === 'in_progress' && task.status !== 'IN_PROGRESS') {
      return false;
    }
    if (filterType === 'done' && task.status !== 'DONE') {
      return false;
    }
    if (filterType === 'overdue' && !isTaskOverdue(task, todayKey)) {
      return false;
    }
    if (filterType === 'due_soon' && !isTaskDueSoon(task, todayKey)) {
      return false;
    }
    if (filterType === 'unassigned' && (task.assigneeId !== null && task.assigneeId !== undefined)) {
      return false;
    }

    // Filter by assignee
    if (assigneeId !== undefined) {
      if (assigneeId === null) {
        if (task.assigneeId !== null && task.assigneeId !== undefined) return false;
      } else if (task.assigneeId !== assigneeId) {
        return false;
      }
    }

    // Filter by priority
    if (priority && priority !== 'ALL' && task.priority !== priority) {
      return false;
    }

    // Filter by search query
    if (normalizedQuery) {
      const matchTitle = task.title.toLowerCase().includes(normalizedQuery);
      const matchDesc = task.description?.toLowerCase().includes(normalizedQuery);
      const matchAssignee = task.assignee?.name.toLowerCase().includes(normalizedQuery);
      if (!matchTitle && !matchDesc && !matchAssignee) {
        return false;
      }
    }

    return true;
  });
}
