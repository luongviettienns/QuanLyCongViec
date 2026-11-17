import {
  TASK_STATUS_CONFIG,
  type Subtask,
  type Task,
  type TaskStatus,
} from '../types/task.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import type { User } from '../../auth/types/auth.types.ts';
import { getTaskActorRoles } from './task-permission.utils.ts';

export type ChecklistSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ChecklistProgress {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  percent: number;
}

export interface ChecklistActionContext {
  canManage: boolean;
  isAssignedCollaborator: boolean;
  isParentDone: boolean;
}

export interface ChecklistNextAction {
  nextStatus: TaskStatus | null;
  disabled: boolean;
  tooltip: string;
  visualState: 'todo' | 'in_progress' | 'done';
}

export interface ChecklistStatusMenuOption {
  status: TaskStatus;
  label: string;
  disabled: boolean;
}

export interface ChecklistTitleValidation {
  valid: boolean;
  title: string;
  errorMessage: string | null;
}

export interface ChecklistAssigneeOption {
  value: number;
  name: string;
  roleTag: string;
  label: string;
}

const CHECKLIST_STATUS_ORDER: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];
const MIN_TITLE_LENGTH = 2;
const MAX_TITLE_LENGTH = 255;

/** Computes aggregate completion counts and percentage for checklist items. */
export function getChecklistProgress(
  subtasks?: ReadonlyArray<Pick<Subtask, 'status'>> | null,
): ChecklistProgress {
  if (!subtasks || subtasks.length === 0) {
    return { total: 0, done: 0, inProgress: 0, todo: 0, percent: 0 };
  }

  let done = 0;
  let inProgress = 0;
  let todo = 0;

  for (const item of subtasks) {
    if (item.status === 'DONE') {
      done += 1;
    } else if (item.status === 'IN_PROGRESS') {
      inProgress += 1;
    } else {
      todo += 1;
    }
  }

  const total = subtasks.length;
  const percent = Math.round((done / total) * 100);
  return { total, done, inProgress, todo, percent };
}

/** Formats checklist completion as "done/total" or returns null when there are no items. */
export function formatChecklistRatio(
  subtasks?: ReadonlyArray<Pick<Subtask, 'status'>> | null,
): string | null {
  const { total, done } = getChecklistProgress(subtasks);
  return total > 0 ? `${done}/${total}` : null;
}

/**
 * Mirrors backend TaskPolicyService.canManageSubtask:
 * - Personal task: only the task creator
 * - Team task: OWNER, ADMIN, CREATOR, or ASSIGNEE
 */
export function canUserManageChecklist(
  user: User | null | undefined,
  task: Task,
  team?: Team | null,
): boolean {
  if (!user) {
    return false;
  }

  if (!task.teamId && !team) {
    return task.userId === user.id;
  }

  const roles = getTaskActorRoles(user, task, team);
  return roles.some(
    (role) =>
      role === 'OWNER' || role === 'ADMIN' || role === 'CREATOR' || role === 'ASSIGNEE',
  );
}

/** Checks whether the user is an ACCEPTED collaborator currently assigned to this subtask. */
export function isUserAssignedCollaboratorOnSubtask(
  user: User | null | undefined,
  task: Task,
  subtask: Pick<Subtask, 'assigneeId'>,
): boolean {
  if (!user || subtask.assigneeId !== user.id) {
    return false;
  }

  return Boolean(
    task.collaborators?.some(
      (collab) => collab.userId === user.id && collab.status === 'ACCEPTED',
    ),
  );
}

/**
 * Resolves the 1-click sequential transition for the checklist check control while strictly
 * preserving the backend 3-step workflow (TODO -> IN_PROGRESS -> DONE; never TODO -> DONE).
 */
export function getNextChecklistStatusAction(
  subtask: Pick<Subtask, 'status'>,
  context: ChecklistActionContext,
): ChecklistNextAction {
  const { canManage, isAssignedCollaborator, isParentDone } = context;
  const hasAnyStatusPermission = canManage || isAssignedCollaborator;

  if (subtask.status === 'TODO') {
    if (!hasAnyStatusPermission) {
      return {
        nextStatus: null,
        disabled: true,
        tooltip: 'Bạn không có quyền cập nhật đầu việc này',
        visualState: 'todo',
      };
    }
    if (isParentDone) {
      return {
        nextStatus: null,
        disabled: true,
        tooltip: 'Hãy mở lại công việc chính trước khi bắt đầu đầu việc',
        visualState: 'todo',
      };
    }
    return {
      nextStatus: 'IN_PROGRESS',
      disabled: false,
      tooltip: 'Bắt đầu làm (Đang làm)',
      visualState: 'todo',
    };
  }

  if (subtask.status === 'IN_PROGRESS') {
    if (!hasAnyStatusPermission) {
      return {
        nextStatus: null,
        disabled: true,
        tooltip: 'Bạn không có quyền cập nhật đầu việc này',
        visualState: 'in_progress',
      };
    }
    return {
      nextStatus: 'DONE',
      disabled: false,
      tooltip: 'Đánh dấu hoàn thành',
      visualState: 'in_progress',
    };
  }

  if (!canManage) {
    return {
      nextStatus: null,
      disabled: true,
      tooltip: isAssignedCollaborator
        ? 'Chỉ người quản lý mới có thể mở lại đầu việc đã hoàn thành'
        : 'Bạn không có quyền mở lại đầu việc này',
      visualState: 'done',
    };
  }

  if (isParentDone) {
    return {
      nextStatus: null,
      disabled: true,
      tooltip: 'Hãy mở lại công việc chính trước khi mở lại đầu việc',
      visualState: 'done',
    };
  }

  return {
    nextStatus: 'IN_PROGRESS',
    disabled: false,
    tooltip: 'Mở lại (Đang làm)',
    visualState: 'done',
  };
}

/** Builds allowed status menu transitions matching backend SubtaskService invariants. */
export function getChecklistStatusMenuOptions(
  subtask: Pick<Subtask, 'status'>,
  context: ChecklistActionContext,
): ChecklistStatusMenuOption[] {
  const { canManage, isAssignedCollaborator, isParentDone } = context;

  return CHECKLIST_STATUS_ORDER.map((status) => {
    const label = TASK_STATUS_CONFIG[status].label;

    if (status === subtask.status) {
      return { status, label, disabled: true };
    }

    // Backend forbids TODO -> DONE directly for everyone
    if (subtask.status === 'TODO' && status === 'DONE') {
      return { status, label, disabled: true };
    }

    // Backend forbids setting non-DONE status when parent task is DONE
    if (isParentDone && status !== 'DONE') {
      return { status, label, disabled: true };
    }

    if (canManage) {
      return { status, label, disabled: false };
    }

    if (isAssignedCollaborator) {
      const allowedForward =
        (subtask.status === 'TODO' && status === 'IN_PROGRESS') ||
        (subtask.status === 'IN_PROGRESS' && status === 'DONE');
      return { status, label, disabled: !allowedForward };
    }

    return { status, label, disabled: true };
  });
}

/** Validates and normalizes a checklist item title to match backend 2..255 constraints. */
export function validateChecklistTitle(rawTitle: string): ChecklistTitleValidation {
  const title = rawTitle.trim();

  if (title.length === 0) {
    return {
      valid: false,
      title,
      errorMessage: 'Vui lòng nhập tiêu đề đầu việc',
    };
  }

  if (title.length < MIN_TITLE_LENGTH) {
    return {
      valid: false,
      title,
      errorMessage: 'Tiêu đề đầu việc phải có ít nhất 2 ký tự',
    };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return {
      valid: false,
      title,
      errorMessage: 'Tiêu đề đầu việc không được vượt quá 255 ký tự',
    };
  }

  return {
    valid: true,
    title,
    errorMessage: null,
  };
}

/** Immutably moves an item from `fromIndex` to `toIndex`. */
export function reorderChecklistArray<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const next = [...items];
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return next;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

/** Collects eligible checklist assignees (main assignee + accepted collaborators). */
export function buildChecklistAssigneeOptions(task: Task): ChecklistAssigneeOption[] {
  const options: ChecklistAssigneeOption[] = [];

  if (task.assignee) {
    options.push({
      value: task.assignee.id,
      name: task.assignee.name,
      roleTag: 'Phụ trách chính',
      label: `${task.assignee.name} (Phụ trách chính)`,
    });
  }

  if (task.collaborators) {
    for (const collab of task.collaborators) {
      if (collab.status === 'ACCEPTED' && collab.userId !== task.assigneeId) {
        const name = collab.user?.name || `User #${collab.userId}`;
        options.push({
          value: collab.userId,
          name,
          roleTag: 'Phối hợp',
          label: `${name} (Phối hợp)`,
        });
      }
    }
  }

  return options;
}

/** Extracts source and target array indices from sortable drag IDs (`subtask-<id>`). */
export function resolveDragReorderIndices(
  items: ReadonlyArray<Pick<Subtask, 'id'>>,
  sourceDragId: unknown,
  targetDragId: unknown,
): { fromIndex: number; toIndex: number } | null {
  const sourceStr = String(sourceDragId ?? '');
  const targetStr = String(targetDragId ?? '');
  if (!sourceStr.startsWith('subtask-') || !targetStr.startsWith('subtask-')) {
    return null;
  }

  const sourceId = Number(sourceStr.slice('subtask-'.length));
  const targetId = Number(targetStr.slice('subtask-'.length));
  if (!Number.isFinite(sourceId) || !Number.isFinite(targetId) || sourceId === targetId) {
    return null;
  }

  const fromIndex = items.findIndex((item) => item.id === sourceId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return null;
  }

  return { fromIndex, toIndex };
}

/** Guards async task-scoped checklist responses from mutating state after unmount or task switch. */
export function shouldApplyTaskScopedResult(
  requestedTaskId: number,
  activeTaskId: number,
  isMounted: boolean,
): boolean {
  return isMounted && requestedTaskId === activeTaskId;
}

export interface InlineEditDecision {
  action: 'cancel' | 'noop' | 'error' | 'commit';
  title: string;
  errorMessage: string | null;
}

/** Resolves whether an inline title submission should cancel, noop, show an error, or commit. */
export function resolveInlineEditSubmit(
  draftTitle: string,
  originalTitle: string,
  fromBlur: boolean,
): InlineEditDecision {
  const validation = validateChecklistTitle(draftTitle);
  if (!validation.valid) {
    if (fromBlur) {
      return { action: 'cancel', title: originalTitle, errorMessage: null };
    }
    return {
      action: 'error',
      title: validation.title,
      errorMessage: validation.errorMessage,
    };
  }

  if (validation.title === originalTitle) {
    return { action: 'noop', title: originalTitle, errorMessage: null };
  }

  return { action: 'commit', title: validation.title, errorMessage: null };
}

export interface LiveChecklistCache {
  taskId: number;
  sourceSubtasksRef: Task['subtasks'];
  subtasks: Subtask[];
}

/**
 * Resolves checklist subtasks for modal header progress while invalidating stale
 * caches after modal close or external task.subtasks updates.
 */
export function resolveModalChecklistSubtasks(
  modalOpen: boolean,
  task: Task | null | undefined,
  liveSubtasks: LiveChecklistCache | null,
): Task['subtasks'] {
  if (!task) {
    return undefined;
  }
  if (
    modalOpen &&
    liveSubtasks &&
    liveSubtasks.taskId === task.id &&
    liveSubtasks.sourceSubtasksRef === task.subtasks
  ) {
    return liveSubtasks.subtasks;
  }
  return task.subtasks;
}
