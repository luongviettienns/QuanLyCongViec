import type { Task, TaskComment, TaskCommentMention } from '../types/task.types.ts';
import type { Team } from '../../teams/types/team.types.ts';

export interface CommentMentionCandidate {
  id: number;
  name: string;
  email?: string;
  roleLabel?: string;
}

export interface CommentContentSegment {
  text: string;
  isMention: boolean;
  userId?: number;
}

/**
 * Collects unique, authorized mentionable users for a task (excluding the current user).
 * Mirrors backend mention validation rules so users never see unauthorized accounts.
 */
export function buildMentionableUsers(
  task: Pick<Task, 'teamId' | 'team' | 'assignee' | 'assigneeId'>,
  team?: Team | null,
  currentUserId?: number | null,
): CommentMentionCandidate[] {
  const byId = new Map<number, CommentMentionCandidate>();

  const addCandidate = (
    user: { id: number; name: string; email?: string } | null | undefined,
    roleLabel?: string,
  ) => {
    if (!user || user.id <= 0 || user.id === currentUserId) {
      return;
    }
    const existing = byId.get(user.id);
    if (!existing) {
      byId.set(user.id, {
        id: user.id,
        name: user.name,
        email: user.email,
        roleLabel,
      });
    } else if (!existing.roleLabel && roleLabel) {
      byId.set(user.id, { ...existing, roleLabel });
    }
  };

  if (task.teamId) {
    const resolvedTeam = team && team.id === task.teamId ? team : null;
    if (resolvedTeam?.owner) {
      addCandidate(resolvedTeam.owner, 'Chủ nhóm');
    } else if (task.team?.owner) {
      addCandidate(task.team.owner, 'Chủ nhóm');
    }

    if (resolvedTeam?.members) {
      for (const member of resolvedTeam.members) {
        if (!member.user) continue;
        const roleLabel =
          member.userId === resolvedTeam.ownerId
            ? 'Chủ nhóm'
            : member.role === 'ADMIN'
              ? 'Quản trị'
              : 'Thành viên';
        addCandidate(member.user, roleLabel);
      }
    }
  } else if (task.assignee) {
    addCandidate(task.assignee, 'Phụ trách');
  }

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectMatchedMentionTokens(
  content: string,
  names: readonly string[],
): string[] {
  const uniqueNames = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  ).sort((a, b) => b.length - a.length);

  if (uniqueNames.length === 0) {
    return [];
  }

  const pattern = uniqueNames.map((n) => `@${escapeRegex(n)}`).join('|');
  const regex = new RegExp(`(${pattern})(?=$|\\s|[.,!?;:)])`, 'giu');
  const matched: string[] = [];

  for (const match of content.matchAll(regex)) {
    const idx = match.index ?? 0;
    if (idx > 0 && !/\s/.test(content[idx - 1])) {
      continue;
    }
    matched.push(match[0].toLowerCase());
  }

  return matched;
}

/**
 * Extracts validated `mentionedUserIds` from comment text, combining explicit
 * dropdown selections (that still appear in text) and direct `@Name` matches.
 * Longest names win first so prefix names do not false-match longer names.
 */
export function extractMentionedUserIds(
  content: string,
  candidates: readonly CommentMentionCandidate[],
  trackedSelections: readonly Pick<CommentMentionCandidate, 'id' | 'name'>[] = [],
): number[] {
  if (!content.trim()) {
    return [];
  }

  const matchedTokens = new Set(
    collectMatchedMentionTokens(content, [
      ...candidates.map((c) => c.name),
      ...trackedSelections.map((s) => s.name),
    ]),
  );
  if (matchedTokens.size === 0) {
    return [];
  }

  const candidateIds = new Set(candidates.map((c) => c.id));
  const resultIds: number[] = [];
  const seen = new Set<number>();

  const pushId = (id: number) => {
    if (id > 0 && candidateIds.has(id) && !seen.has(id)) {
      seen.add(id);
      resultIds.push(id);
    }
  };

  for (const selected of trackedSelections) {
    if (matchedTokens.has(`@${selected.name.trim().toLowerCase()}`)) {
      pushId(selected.id);
    }
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.name.length - a.name.length);
  for (const candidate of sortedCandidates) {
    if (matchedTokens.has(`@${candidate.name.trim().toLowerCase()}`)) {
      pushId(candidate.id);
    }
  }

  return resultIds;
}

/**
 * Splits plain comment text into normal text and `@Name` mention segments
 * for safe React rendering without HTML injection.
 */
export function splitCommentContentSegments(
  content: string,
  mentions: readonly TaskCommentMention[],
): CommentContentSegment[] {
  if (!content) {
    return [];
  }
  if (mentions.length === 0) {
    return [{ text: content, isMention: false }];
  }

  const sortedMentions = [...mentions]
    .filter((m) => m.name.trim().length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  if (sortedMentions.length === 0) {
    return [{ text: content, isMention: false }];
  }

  const pattern = sortedMentions.map((m) => `@${escapeRegex(m.name.trim())}`).join('|');
  const regex = new RegExp(`(${pattern})(?=$|\\s|[.,!?;:)])`, 'giu');
  const mentionByLowerToken = new Map<string, TaskCommentMention>();
  for (const m of sortedMentions) {
    const key = `@${m.name.trim().toLowerCase()}`;
    if (!mentionByLowerToken.has(key)) {
      mentionByLowerToken.set(key, m);
    }
  }

  const segments: CommentContentSegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(regex)) {
    const idx = match.index ?? 0;
    const token = match[0];
    // Ensure @ starts at beginning or whitespace so emails like foo@An are not matched
    if (idx > 0 && !/\s/.test(content[idx - 1])) {
      continue;
    }

    if (idx > lastIndex) {
      segments.push({ text: content.slice(lastIndex, idx), isMention: false });
    }
    const matchedUser = mentionByLowerToken.get(token.toLowerCase());
    segments.push({
      text: token,
      isMention: true,
      userId: matchedUser?.id,
    });
    lastIndex = idx + token.length;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex), isMention: false });
  }

  return segments.length > 0 ? segments : [{ text: content, isMention: false }];
}

/** Counts all root comments and their replies. */
export function countTotalComments(comments: readonly TaskComment[]): number {
  return comments.reduce((sum, item) => sum + 1 + item.replies.length, 0);
}

/** Only the author may edit a comment. */
export function canEditTaskComment(
  comment: Pick<TaskComment, 'authorId'>,
  currentUserId?: number | null,
): boolean {
  return Boolean(currentUserId && comment.authorId === currentUserId);
}

/** Author or team Owner/Admin may delete a comment. */
export function canDeleteTaskComment(
  comment: Pick<TaskComment, 'authorId'>,
  currentUserId?: number | null,
  task?: Pick<Task, 'teamId' | 'team'> | null,
  team?: Team | null,
): boolean {
  if (!currentUserId) return false;
  if (comment.authorId === currentUserId) return true;
  if (!task?.teamId) return false;

  const resolvedTeam = team && team.id === task.teamId ? team : null;
  if (resolvedTeam) {
    if (resolvedTeam.ownerId === currentUserId) return true;
    return Boolean(
      resolvedTeam.members?.some((m) => m.userId === currentUserId && m.role === 'ADMIN'),
    );
  }
  return task.team?.ownerId === currentUserId;
}

/** Formats comment timestamp concisely in Vietnamese. */
export function formatCommentTimestamp(isoString: string, now: Date = new Date()): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;

  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
