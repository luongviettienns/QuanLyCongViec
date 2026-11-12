import type { Task, TaskStatus, TrashTask } from '../types/task.types.ts';
import type { Team } from '../../teams/types/team.types.ts';
import type { User } from '../../auth/types/auth.types.ts';
import { getTaskPermissions, canManageTrashTask } from './task-permission.utils.ts';

export interface BulkTaskSelectionSummary {
  total: number;
  deletableIds: number[];
  statusTargets: Record<TaskStatus, number[]>;
}

export interface TrashSelectionSummary {
  manageableSelectedIds: number[];
  unmanageableSelectedCount: number;
  manageableAllIds: number[];
}

function resolveTaskTeam(task: { teamId?: number | null }, teams: Team[]): Team | null {
  return task.teamId ? teams.find((t) => t.id === task.teamId) ?? null : null;
}

/**
 * Evaluates bulk delete and per-target-status permissions across selected active tasks.
 */
export function summarizeBulkSelection(
  selectedTasks: Task[],
  user: User | null | undefined,
  teams: Team[],
): BulkTaskSelectionSummary {
  const deletableIds: number[] = [];
  const statusTargets: Record<TaskStatus, number[]> = {
    TODO: [],
    IN_PROGRESS: [],
    DONE: [],
  };

  for (const task of selectedTasks) {
    const perms = getTaskPermissions(user, task, resolveTaskTeam(task, teams));
    if (perms.canDelete) {
      deletableIds.push(task.id);
    }
    for (const nextStatus of perms.allowedNextStatuses) {
      statusTargets[nextStatus].push(task.id);
    }
  }

  return {
    total: selectedTasks.length,
    deletableIds,
    statusTargets,
  };
}

/**
 * Evaluates restore/permanent-delete authorization across selected and visible trash tasks.
 */
export function summarizeTrashSelection(
  selectedTasks: TrashTask[],
  allTrashTasks: TrashTask[],
  user: User | null | undefined,
  teams: Team[],
): TrashSelectionSummary {
  const manageableSelectedIds: number[] = [];
  let unmanageableSelectedCount = 0;

  for (const task of selectedTasks) {
    if (canManageTrashTask(user, task, resolveTaskTeam(task, teams))) {
      manageableSelectedIds.push(task.id);
    } else {
      unmanageableSelectedCount += 1;
    }
  }

  const manageableAllIds = allTrashTasks
    .filter((task) => canManageTrashTask(user, task, resolveTaskTeam(task, teams)))
    .map((task) => task.id);

  return {
    manageableSelectedIds,
    unmanageableSelectedCount,
    manageableAllIds,
  };
}
