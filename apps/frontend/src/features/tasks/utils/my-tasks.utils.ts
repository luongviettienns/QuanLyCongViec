import type {
  Subtask,
  Task,
  TaskFilterPatch,
  TaskPriority,
  TaskStatus,
} from '../types/task.types.ts';
import type { TaskPermissions } from './task-permission.utils.ts';

export type MyTaskRoleKind = 'personal' | 'assignee' | 'collaborator' | 'subtask_only';

export type MyTaskRoleFilter =
  | 'all'
  | 'personal'
  | 'assignee'
  | 'collaborator'
  | 'has_my_subtasks';

export type MyTaskStatusTab = 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE';

export type MyTaskDeadlineCardKey = 'overdue' | 'today' | 'upcoming';

export type MyTaskSortKey = 'smart_deadline' | 'due_date_asc' | 'priority_desc' | 'updated_desc';

export interface MyTaskClassification {
  roleKind: MyTaskRoleKind;
  isPersonal: boolean;
  isMainAssignee: boolean;
  isCollaborator: boolean;
  mySubtasks: Subtask[];
  myPendingSubtasks: Subtask[];
}

export interface MyTasksStatsSummary {
  overdue: number;
  today: number;
  upcoming: number;
  all: number;
  todo: number;
  inProgress: number;
  done: number;
}

export interface MyTasksFilterState {
  searchText: string;
  statusTab: MyTaskStatusTab;
  deadlineCard: MyTaskDeadlineCardKey | null;
  roleFilter: MyTaskRoleFilter;
  sortBy: MyTaskSortKey;
}

export interface MyTasksNavigationPreset {
  statusTab: MyTaskStatusTab;
  deadlineCard: MyTaskDeadlineCardKey | null;
}

export interface DashboardNavigationTarget {
  viewMode: 'my_tasks' | 'table';
  preset: MyTasksNavigationPreset | null;
}

export interface QuickStatusAction {
  targetStatus: TaskStatus;
  label: string;
}

const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** Returns the current YYYY-MM-DD calendar date in Asia/Ho_Chi_Minh timezone. */
export function getVietnamTodayKey(referenceDate: Date = new Date()): string {
  return VN_DATE_FORMATTER.format(referenceDate);
}

/**
 * Computes integer calendar day delta (dueDate - todayVN).
 * Returns null if dueDateStr is absent or malformed.
 */
export function getVietnamDateDiffDays(
  dueDateStr?: string | null,
  referenceDate: Date = new Date(),
): number | null {
  if (!dueDateStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDateStr);
  if (!match) return null;

  const dueUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const [ty, tm, td] = getVietnamTodayKey(referenceDate).split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((dueUtc - todayUtc) / 86400000);
}

/** Classifies a task's primary role for the current user and extracts assigned subtasks. */
export function classifyMyTaskRole(task: Task, currentUserId?: number): MyTaskClassification {
  const isPersonal = !task.teamId;
  const isMainAssignee = currentUserId !== undefined && task.assigneeId === currentUserId;
  const isCollaborator = Boolean(
    currentUserId !== undefined &&
      task.collaborators?.some((c) => c.userId === currentUserId && c.status === 'ACCEPTED'),
  );
  const mySubtasks =
    currentUserId !== undefined
      ? (task.subtasks ?? []).filter((st) => st.assigneeId === currentUserId)
      : [];
  const myPendingSubtasks = mySubtasks.filter((st) => st.status !== 'DONE');

  let roleKind: MyTaskRoleKind = 'subtask_only';
  if (isPersonal) {
    roleKind = 'personal';
  } else if (isMainAssignee) {
    roleKind = 'assignee';
  } else if (isCollaborator) {
    roleKind = 'collaborator';
  }

  return {
    roleKind,
    isPersonal,
    isMainAssignee,
    isCollaborator,
    mySubtasks,
    myPendingSubtasks,
  };
}

/** Computes mutually exclusive deadline stat cards (excluding DONE) and status group counts. */
export function computeMyTasksStats(
  tasks: Task[],
  referenceDate: Date = new Date(),
): MyTasksStatsSummary {
  let overdue = 0;
  let today = 0;
  let upcoming = 0;
  let todo = 0;
  let inProgress = 0;
  let done = 0;

  for (const task of tasks) {
    if (task.status === 'TODO') {
      todo += 1;
    } else if (task.status === 'IN_PROGRESS') {
      inProgress += 1;
    } else if (task.status === 'DONE') {
      done += 1;
    }

    if (task.status === 'DONE') {
      continue;
    }

    const diffDays = getVietnamDateDiffDays(task.dueDate, referenceDate);
    if (diffDays === null) {
      continue;
    }
    if (diffDays < 0) {
      overdue += 1;
    } else if (diffDays === 0) {
      today += 1;
    } else if (diffDays <= 7) {
      upcoming += 1;
    }
  }

  return {
    overdue,
    today,
    upcoming,
    all: tasks.length,
    todo,
    inProgress,
    done,
  };
}

export function createDefaultMyTasksFilterState(
  preset?: MyTasksNavigationPreset | null,
): MyTasksFilterState {
  const statusTab: MyTaskStatusTab = preset?.statusTab ?? 'ALL';
  const deadlineCard: MyTaskDeadlineCardKey | null =
    statusTab === 'DONE' ? null : (preset?.deadlineCard ?? null);
  return {
    searchText: '',
    statusTab,
    deadlineCard,
    roleFilter: 'all',
    sortBy: 'smart_deadline',
  };
}

/** Toggles a deadline stat card; resets statusTab from DONE to ALL so counts never deadlock to 0. */
export function toggleMyTasksDeadlineCard(
  state: MyTasksFilterState,
  card: MyTaskDeadlineCardKey,
): MyTasksFilterState {
  if (state.deadlineCard === card) {
    return { ...state, deadlineCard: null };
  }
  return {
    ...state,
    deadlineCard: card,
    statusTab: state.statusTab === 'DONE' ? 'ALL' : state.statusTab,
  };
}

/** Switches status tab; clears deadlineCard when entering DONE to avoid empty intersection. */
export function selectMyTasksStatusTab(
  state: MyTasksFilterState,
  tab: MyTaskStatusTab,
): MyTasksFilterState {
  return {
    ...state,
    statusTab: tab,
    deadlineCard: tab === 'DONE' ? null : state.deadlineCard,
  };
}

function getPriorityRank(priority?: TaskPriority): number {
  return priority ? (PRIORITY_RANK[priority] ?? 2) : 2;
}

function parseTimestamp(iso?: string): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

function compareDueDateAsc(aDiff: number | null, bDiff: number | null): number {
  if (aDiff === null && bDiff === null) return 0;
  if (aDiff === null) return 1;
  if (bDiff === null) return -1;
  return aDiff - bDiff;
}

/** Filters and sorts My Tasks in memory while keeping stat-card totals intact. */
export function filterAndSortMyTasks(
  tasks: Task[],
  state: MyTasksFilterState,
  currentUserId?: number,
  referenceDate: Date = new Date(),
): Task[] {
  const keyword = state.searchText.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    if (state.statusTab !== 'ALL' && task.status !== state.statusTab) {
      return false;
    }

    if (state.deadlineCard !== null) {
      if (task.status === 'DONE') return false;
      const diffDays = getVietnamDateDiffDays(task.dueDate, referenceDate);
      if (diffDays === null) return false;
      if (state.deadlineCard === 'overdue' && diffDays >= 0) return false;
      if (state.deadlineCard === 'today' && diffDays !== 0) return false;
      if (state.deadlineCard === 'upcoming' && (diffDays < 1 || diffDays > 7)) return false;
    }

    const classification = classifyMyTaskRole(task, currentUserId);
    if (state.roleFilter !== 'all') {
      if (state.roleFilter === 'has_my_subtasks') {
        if (classification.mySubtasks.length === 0) return false;
      } else if (classification.roleKind !== state.roleFilter) {
        return false;
      }
    }

    if (keyword.length > 0) {
      const titleMatch = task.title.toLowerCase().includes(keyword);
      const teamMatch = Boolean(task.team?.name.toLowerCase().includes(keyword));
      const subtaskMatch = classification.mySubtasks.some((st) =>
        st.title.toLowerCase().includes(keyword),
      );
      if (!titleMatch && !teamMatch && !subtaskMatch) {
        return false;
      }
    }

    return true;
  });

  const decorated = filtered.map((task) => ({
    task,
    diffDays: getVietnamDateDiffDays(task.dueDate, referenceDate),
    priorityRank: getPriorityRank(task.priority),
    updatedMs: parseTimestamp(task.updatedAt ?? task.createdAt),
  }));

  decorated.sort((a, b) => {
    switch (state.sortBy) {
      case 'due_date_asc': {
        const dueCmp = compareDueDateAsc(a.diffDays, b.diffDays);
        if (dueCmp !== 0) return dueCmp;
        const priCmp = b.priorityRank - a.priorityRank;
        if (priCmp !== 0) return priCmp;
        return b.updatedMs - a.updatedMs;
      }
      case 'priority_desc': {
        const priCmp = b.priorityRank - a.priorityRank;
        if (priCmp !== 0) return priCmp;
        const dueCmp = compareDueDateAsc(a.diffDays, b.diffDays);
        if (dueCmp !== 0) return dueCmp;
        return b.updatedMs - a.updatedMs;
      }
      case 'updated_desc': {
        return b.updatedMs - a.updatedMs;
      }
      case 'smart_deadline':
      default: {
        const aDone = a.task.status === 'DONE' ? 1 : 0;
        const bDone = b.task.status === 'DONE' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const dueCmp = compareDueDateAsc(a.diffDays, b.diffDays);
        if (dueCmp !== 0) return dueCmp;
        const priCmp = b.priorityRank - a.priorityRank;
        if (priCmp !== 0) return priCmp;
        return b.updatedMs - a.updatedMs;
      }
    }
  });

  return decorated.map((item) => item.task);
}

/** Resolves the single-click forward status transition permitted for a task row. */
export function getQuickStatusAction(
  task: Task,
  perms: Pick<TaskPermissions, 'canChangeStatus' | 'allowedNextStatuses'>,
): QuickStatusAction | null {
  if (!perms.canChangeStatus || perms.allowedNextStatuses.length === 0) {
    return null;
  }
  if (task.status === 'TODO' && perms.allowedNextStatuses.includes('IN_PROGRESS')) {
    return { targetStatus: 'IN_PROGRESS', label: 'Bắt đầu' };
  }
  if (task.status === 'IN_PROGRESS' && perms.allowedNextStatuses.includes('DONE')) {
    return { targetStatus: 'DONE', label: 'Hoàn thành' };
  }
  return null;
}

/**
 * Determines whether a Dashboard drill-down patch should land in My Tasks
 * (1-to-1 count match) or fall back to Table view (specific team / due_soon / other scopes).
 */
export function resolveDashboardNavigationTarget(
  patch: TaskFilterPatch,
): DashboardNavigationTarget {
  const isMyWorkScope = patch.scopeFilter === 'my_work';
  const hasSpecificTeam =
    patch.teamFilter !== undefined && patch.teamFilter !== 'ALL';
  const isDashboardDueSoon = patch.deadlineFilter === 'due_soon';
  const isIncompleteStatus = patch.statusFilter === 'INCOMPLETE';

  if (!isMyWorkScope || hasSpecificTeam || isDashboardDueSoon || isIncompleteStatus) {
    return { viewMode: 'table', preset: null };
  }

  const statusTab: MyTaskStatusTab =
    patch.statusFilter === 'TODO' ||
    patch.statusFilter === 'IN_PROGRESS' ||
    patch.statusFilter === 'DONE'
      ? patch.statusFilter
      : 'ALL';
  const deadlineCard: MyTaskDeadlineCardKey | null =
    patch.deadlineFilter === 'overdue' || patch.deadlineFilter === 'today'
      ? patch.deadlineFilter
      : null;

  return {
    viewMode: 'my_tasks',
    preset: {
      statusTab: deadlineCard ? 'ALL' : statusTab,
      deadlineCard,
    },
  };
}

/**
 * Resolves the freshest Task record for TaskFormModal:
 * - Preserves `openedTask` (e.g. from MyTaskDetailPanel after subtask edits that do not bump Task.updatedAt)
 *   unless canonical `listTask` has a strictly newer `updatedAt`.
 * - Prefers `overrideTask` (SSE refresh) whenever its `updatedAt` is >= the candidate's `updatedAt`.
 */
export function resolveOpenedModalTask(
  openedTask: Task,
  listTask: Task | undefined,
  overrideTask: Task | null,
): Task {
  let base = openedTask;
  if (listTask && listTask.id === openedTask.id) {
    const listMs = parseTimestamp(listTask.updatedAt);
    const openedMs = parseTimestamp(openedTask.updatedAt);
    if (listMs > openedMs) {
      base = listTask;
    }
  }

  if (overrideTask && overrideTask.id === openedTask.id) {
    if (!base.updatedAt || !overrideTask.updatedAt) {
      return overrideTask;
    }
    return parseTimestamp(overrideTask.updatedAt) >= parseTimestamp(base.updatedAt)
      ? overrideTask
      : base;
  }

  return base;
}
