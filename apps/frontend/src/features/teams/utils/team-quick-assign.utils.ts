import type { CreateTaskPayload, TaskPriority } from '../../tasks/types/task.types.ts';
import type { Team, TeamRole } from '../types/team.types.ts';

export interface TeamMemberOption {
  userId: number;
  name: string;
  email: string;
  isOwner: boolean;
  role: 'OWNER' | TeamRole;
}

export interface QuickAssignPayloadInput {
  title: string;
  assigneeId: number;
  dueDateStr?: string | null;
  priority?: TaskPriority;
  description?: string | null;
  categoryId?: number | null;
  collaboratorIds?: number[];
  currentUserId?: number | null;
}

export interface QuickAssignDirtyCheckValues {
  title?: string | null;
  assigneeId?: number | null;
  dueDate?: unknown;
  priority?: TaskPriority | null;
  description?: string | null;
  collaboratorIds?: number[] | null;
  categoryId?: number | null;
}

/**
 * Merges team owner and team members into a deduplicated list for quick-assign dropdowns.
 */
export function buildTeamMemberOptions(team: Team | null | undefined): TeamMemberOption[] {
  if (!team) {
    return [];
  }

  const options: TeamMemberOption[] = [];
  const seen = new Set<number>();

  if (team.owner) {
    seen.add(team.owner.id);
    options.push({
      userId: team.owner.id,
      name: team.owner.name,
      email: team.owner.email,
      isOwner: true,
      role: 'OWNER',
    });
  }

  for (const member of team.members || []) {
    if (seen.has(member.userId)) {
      continue;
    }
    seen.add(member.userId);
    options.push({
      userId: member.userId,
      name: member.user?.name || `Thành viên #${member.userId}`,
      email: member.user?.email || '',
      isOwner: member.userId === team.ownerId,
      role: member.userId === team.ownerId ? 'OWNER' : member.role,
    });
  }

  return options;
}

/**
 * Filters team members eligible to be invited as collaborators (excludes primary assignee and creator).
 */
export function filterQuickAssignCollaboratorOptions(
  memberOptions: TeamMemberOption[],
  assigneeId?: number | null,
  currentUserId?: number | null,
): TeamMemberOption[] {
  return memberOptions.filter(
    (option) =>
      option.userId !== assigneeId &&
      option.userId !== currentUserId,
  );
}

/**
 * Removes any selected collaborator IDs that conflict with the chosen primary assignee or creator.
 */
export function stripConflictingCollaborators(
  collaboratorIds: number[],
  nextAssigneeId?: number | null,
  currentUserId?: number | null,
): number[] {
  return collaboratorIds.filter(
    (id) => id !== nextAssigneeId && id !== currentUserId,
  );
}

/**
 * Builds a CreateTaskPayload locked to the given teamId with normalized optional fields.
 */
export function buildQuickAssignCreatePayload(
  teamId: number,
  input: QuickAssignPayloadInput,
): CreateTaskPayload {
  const cleanDescription = input.description?.trim();

  const payload: CreateTaskPayload = {
    title: input.title.trim(),
    teamId,
    assigneeId: input.assigneeId,
    priority: input.priority || 'MEDIUM',
    categoryId: input.categoryId ?? null,
    dueDate: input.dueDateStr ?? null,
  };

  if (cleanDescription) {
    payload.description = cleanDescription;
  }

  const cleanCollaboratorIds = Array.from(
    new Set(
      stripConflictingCollaborators(
        input.collaboratorIds ?? [],
        input.assigneeId,
        input.currentUserId,
      ),
    ),
  );
  if (cleanCollaboratorIds.length > 0) {
    payload.collaboratorIds = cleanCollaboratorIds;
  }

  return payload;
}

/**
 * Checks whether the quick-assign form holds unsaved user input compared to defaults.
 */
export function isQuickAssignFormDirty(values: QuickAssignDirtyCheckValues): boolean {
  if (values.title && values.title.trim().length > 0) {
    return true;
  }
  if (values.assigneeId !== undefined && values.assigneeId !== null) {
    return true;
  }
  if (values.dueDate !== undefined && values.dueDate !== null) {
    return true;
  }
  if (values.priority && values.priority !== 'MEDIUM') {
    return true;
  }
  if (values.description && values.description.trim().length > 0) {
    return true;
  }
  if (Array.isArray(values.collaboratorIds) && values.collaboratorIds.length > 0) {
    return true;
  }
  if (values.categoryId !== undefined && values.categoryId !== null) {
    return true;
  }
  return false;
}
