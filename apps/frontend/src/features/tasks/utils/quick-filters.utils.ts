import type {
  DeadlineFilter,
  PriorityFilter,
  ScopeFilter,
  StatusFilter,
  TaskFilterPatch,
  TaskFilterState,
  TaskSortBy,
} from '../types/task.types.ts';
import type { Category } from '../../categories/types/category.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import { buildAssigneeOptions } from './task-filter.utils.ts';

export type QuickFilterId =
  | 'my_work'
  | 'today'
  | 'overdue'
  | 'due_soon'
  | 'high_priority'
  | 'incomplete'
  | 'pending_invites';

export type QuickFilterTone = 'blue' | 'orange' | 'red' | 'cyan' | 'volcano' | 'geekblue';

export interface QuickFilterChipItem {
  id: QuickFilterId;
  label: string;
  tone: QuickFilterTone;
  active: boolean;
  count?: number;
}

export interface ActiveFilterChip {
  key:
    | 'search'
    | 'scope'
    | 'team'
    | 'status'
    | 'priority'
    | 'category'
    | 'assignee'
    | 'deadline'
    | 'sortBy';
  label: string;
  clearPatch: TaskFilterPatch;
}

const SCOPE_LABELS: Record<Exclude<ScopeFilter, 'all'>, string> = {
  my_work: 'Công việc của tôi',
  assigned_to_me: 'Tôi phụ trách',
  collaborating: 'Tôi phối hợp',
  subtasks_assigned_to_me: 'Subtask của tôi',
  created_by_me: 'Tôi đã tạo',
  pending_invites: 'Lời mời chờ',
};

const STATUS_LABELS: Record<Exclude<StatusFilter, 'ALL'>, string> = {
  INCOMPLETE: 'Chưa hoàn thành',
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Hoàn thành',
};

const PRIORITY_LABELS: Record<Exclude<PriorityFilter, 'ALL'>, string> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

const DEADLINE_LABELS: Record<Exclude<DeadlineFilter, 'ALL'>, string> = {
  overdue: 'Quá hạn',
  today: 'Hôm nay',
  due_soon: 'Sắp đến hạn',
  no_due_date: 'Chưa đặt hạn',
};

const SORT_LABELS: Record<Exclude<TaskSortBy, 'default'>, string> = {
  due_date_asc: 'Hạn gần nhất',
  due_date_desc: 'Hạn xa nhất',
  priority_desc: 'Ưu tiên cao trước',
};

export function buildQuickFilterChips(
  filters: TaskFilterState,
  options: { isTrash: boolean; pendingInvitesCount?: number },
): QuickFilterChipItem[] {
  const { isTrash, pendingInvitesCount = 0 } = options;

  if (isTrash) {
    return [
      {
        id: 'high_priority',
        label: 'Ưu tiên cao',
        tone: 'volcano',
        active: filters.priorityFilter === 'HIGH',
      },
    ];
  }

  const chips: QuickFilterChipItem[] = [
    {
      id: 'my_work',
      label: 'Của tôi',
      tone: 'blue',
      active: filters.scopeFilter === 'my_work',
    },
    {
      id: 'today',
      label: 'Hôm nay',
      tone: 'orange',
      active: filters.deadlineFilter === 'today',
    },
    {
      id: 'overdue',
      label: 'Quá hạn',
      tone: 'red',
      active: filters.deadlineFilter === 'overdue',
    },
    {
      id: 'due_soon',
      label: 'Sắp đến hạn',
      tone: 'cyan',
      active: filters.deadlineFilter === 'due_soon',
    },
    {
      id: 'high_priority',
      label: 'Ưu tiên cao',
      tone: 'volcano',
      active: filters.priorityFilter === 'HIGH',
    },
    {
      id: 'incomplete',
      label: 'Chưa hoàn thành',
      tone: 'geekblue',
      active: filters.statusFilter === 'INCOMPLETE',
    },
  ];

  if (pendingInvitesCount > 0 || filters.scopeFilter === 'pending_invites') {
    chips.push({
      id: 'pending_invites',
      label: 'Lời mời chờ',
      tone: 'orange',
      active: filters.scopeFilter === 'pending_invites',
      count: pendingInvitesCount > 0 ? pendingInvitesCount : undefined,
    });
  }

  return chips;
}

export function toggleQuickFilterPatch(
  current: TaskFilterState,
  id: QuickFilterId,
): TaskFilterPatch {
  switch (id) {
    case 'my_work':
      return { scopeFilter: current.scopeFilter === 'my_work' ? 'all' : 'my_work' };
    case 'pending_invites':
      return {
        scopeFilter: current.scopeFilter === 'pending_invites' ? 'all' : 'pending_invites',
      };
    case 'today':
      return { deadlineFilter: current.deadlineFilter === 'today' ? 'ALL' : 'today' };
    case 'overdue':
      return { deadlineFilter: current.deadlineFilter === 'overdue' ? 'ALL' : 'overdue' };
    case 'due_soon':
      return { deadlineFilter: current.deadlineFilter === 'due_soon' ? 'ALL' : 'due_soon' };
    case 'high_priority':
      return { priorityFilter: current.priorityFilter === 'HIGH' ? 'ALL' : 'HIGH' };
    case 'incomplete':
      return { statusFilter: current.statusFilter === 'INCOMPLETE' ? 'ALL' : 'INCOMPLETE' };
  }
}

export function buildActiveFilterChips(
  filters: TaskFilterState,
  context: {
    isTrash: boolean;
    teams: Team[];
    categories: Category[];
    currentUserId?: number;
  },
): ActiveFilterChip[] {
  const { isTrash, teams, categories, currentUserId } = context;
  const chips: ActiveFilterChip[] = [];

  const trimmedSearch = filters.searchText.trim();
  if (trimmedSearch.length > 0) {
    chips.push({
      key: 'search',
      label: `Từ khóa: "${trimmedSearch}"`,
      clearPatch: { searchText: '' },
    });
  }

  if (!isTrash && filters.scopeFilter !== 'all') {
    chips.push({
      key: 'scope',
      label: `Phạm vi: ${SCOPE_LABELS[filters.scopeFilter]}`,
      clearPatch: { scopeFilter: 'all' },
    });
  }

  if (filters.teamFilter === 'PERSONAL') {
    chips.push({
      key: 'team',
      label: 'Không gian: Cá nhân',
      clearPatch: { teamFilter: 'ALL' },
    });
  } else if (typeof filters.teamFilter === 'number') {
    const teamName = teams.find((t) => t.id === filters.teamFilter)?.name ?? `#${filters.teamFilter}`;
    chips.push({
      key: 'team',
      label: `Nhóm: ${teamName}`,
      clearPatch: { teamFilter: 'ALL' },
    });
  }

  if (!isTrash && filters.statusFilter !== 'ALL') {
    chips.push({
      key: 'status',
      label: `Trạng thái: ${STATUS_LABELS[filters.statusFilter]}`,
      clearPatch: { statusFilter: 'ALL' },
    });
  }

  if (filters.priorityFilter !== 'ALL') {
    chips.push({
      key: 'priority',
      label: `Ưu tiên: ${PRIORITY_LABELS[filters.priorityFilter]}`,
      clearPatch: { priorityFilter: 'ALL' },
    });
  }

  if (filters.categoryFilter !== 'ALL') {
    const catName =
      categories.find((c) => c.id === filters.categoryFilter)?.name ?? `#${filters.categoryFilter}`;
    chips.push({
      key: 'category',
      label: `Danh mục: ${catName}`,
      clearPatch: { categoryFilter: 'ALL' },
    });
  }

  if (filters.assigneeFilter !== 'ALL') {
    const assigneeOptions = buildAssigneeOptions(teams, filters.teamFilter, currentUserId);
    const assigneeName =
      assigneeOptions.find((opt) => opt.value === filters.assigneeFilter)?.label ??
      `#${filters.assigneeFilter}`;
    chips.push({
      key: 'assignee',
      label: `Phụ trách: ${assigneeName}`,
      clearPatch: { assigneeFilter: 'ALL' },
    });
  }

  if (!isTrash && filters.deadlineFilter !== 'ALL') {
    chips.push({
      key: 'deadline',
      label: `Hạn chót: ${DEADLINE_LABELS[filters.deadlineFilter]}`,
      clearPatch: { deadlineFilter: 'ALL' },
    });
  }

  if (!isTrash && filters.sortBy !== 'default') {
    chips.push({
      key: 'sortBy',
      label: `Sắp xếp: ${SORT_LABELS[filters.sortBy]}`,
      clearPatch: { sortBy: 'default' },
    });
  }

  return chips;
}
