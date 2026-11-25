import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { CreateTaskCommentDto } from '../dto/create-task-comment.dto.js';
import { UpdateTaskCommentDto } from '../dto/update-task-comment.dto.js';
import {
  TaskPolicyService,
  type TaskWithTeamAndMembers,
} from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';

export interface CommentAuthorDto {
  id: number;
  name: string;
  email: string;
}

export interface CommentMentionDto {
  id: number;
  name: string;
}

export interface TaskCommentItemDto {
  id: number;
  taskId: number;
  authorId: number;
  parentId: number | null;
  content: string;
  mentionedUserIds: number[];
  mentions: CommentMentionDto[];
  author: CommentAuthorDto;
  createdAt: Date;
  updatedAt: Date;
  replies: TaskCommentItemDto[];
}

interface RawTaskCommentRow {
  id: number;
  taskId: number;
  authorId: number;
  parentId: number | null;
  content: string;
  mentionedUserIds: number[];
  author: CommentAuthorDto;
  createdAt: Date;
  updatedAt: Date;
}

function buildCommentPreview(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}...`;
}

function getAllowedMentionUserIds(task: TaskWithTeamAndMembers): Set<number> {
  if (task.teamId && task.team) {
    const ids = new Set<number>([task.team.ownerId]);
    for (const member of task.team.members) {
      ids.add(member.userId);
    }
    return ids;
  }

  const ids = new Set<number>([task.userId]);
  if (task.assigneeId) {
    ids.add(task.assigneeId);
  }
  return ids;
}

function sanitizeMentionedUserIds(
  requestedIds: number[] | undefined,
  allowedIds: Set<number>,
  callerId: number,
): number[] {
  if (!requestedIds || requestedIds.length === 0) {
    return [];
  }

  const unique: number[] = [];
  const seen = new Set<number>();
  for (const id of requestedIds) {
    if (
      Number.isInteger(id) &&
      id > 0 &&
      id !== callerId &&
      allowedIds.has(id) &&
      !seen.has(id)
    ) {
      seen.add(id);
      unique.push(id);
    }
  }
  return unique;
}

function resolveRealtimeAudience(task: TaskWithTeamAndMembers): number[] | undefined {
  if (task.teamId) {
    return undefined;
  }
  return [task.userId, ...(task.assigneeId ? [task.assigneeId] : [])];
}

@Injectable()
export class TaskCommentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private async resolveMentionUserMap(
    client: Pick<PrismaService, 'user'>,
    rows: readonly Pick<RawTaskCommentRow, 'mentionedUserIds'>[],
  ): Promise<Map<number, CommentMentionDto>> {
    const uniqueIds = Array.from(
      new Set(
        rows.flatMap((row) => row.mentionedUserIds).filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    const map = new Map<number, CommentMentionDto>();
    if (uniqueIds.length === 0) {
      return map;
    }

    const users = await client.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, name: true },
    });
    for (const user of users) {
      map.set(user.id, { id: user.id, name: user.name });
    }
    return map;
  }

  private toCommentDto(
    row: RawTaskCommentRow,
    mentionMap: Map<number, CommentMentionDto>,
    replies: TaskCommentItemDto[] = [],
  ): TaskCommentItemDto {
    const mentions = row.mentionedUserIds
      .map((id) => mentionMap.get(id))
      .filter((item): item is CommentMentionDto => Boolean(item));

    return {
      id: row.id,
      taskId: row.taskId,
      authorId: row.authorId,
      parentId: row.parentId,
      content: row.content,
      mentionedUserIds: row.mentionedUserIds,
      mentions,
      author: row.author,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      replies,
    };
  }

  async getComments(taskId: number, callerId: number): Promise<TaskCommentItemDto[]> {
    await this.queryService.findOne(taskId, callerId);

    const rows = await this.prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const mentionMap = await this.resolveMentionUserMap(this.prisma, rows);
    const rootComments: TaskCommentItemDto[] = [];
    const rootById = new Map<number, TaskCommentItemDto>();
    const orphanedReplies: TaskCommentItemDto[] = [];

    for (const row of rows) {
      if (row.parentId === null) {
        const dto = this.toCommentDto(row, mentionMap, []);
        rootComments.push(dto);
        rootById.set(dto.id, dto);
      } else {
        const dto = this.toCommentDto(row, mentionMap, []);
        const parent = rootById.get(row.parentId);
        if (parent) {
          parent.replies.push(dto);
        } else {
          orphanedReplies.push(dto);
        }
      }
    }

    return orphanedReplies.length > 0 ? [...rootComments, ...orphanedReplies] : rootComments;
  }

  async create(
    taskId: number,
    dto: CreateTaskCommentDto,
    callerId: number,
  ): Promise<TaskCommentItemDto> {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Nội dung bình luận không được để trống');
    }

    let parentTask!: TaskWithTeamAndMembers;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "Task" WHERE id = ${taskId} FOR SHARE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      let resolvedParentId: number | null = null;
      let replyTargetAuthorId: number | null = null;

      if (dto.parentId !== undefined) {
        const parent = await tx.taskComment.findFirst({
          where: { id: dto.parentId, taskId },
          select: { id: true, parentId: true, authorId: true },
        });
        if (!parent) {
          throw new BadRequestException(
            'Bình luận bạn đang phản hồi không tồn tại trong công việc này',
          );
        }
        // Keep thread hierarchy flat at max 1 level
        resolvedParentId = parent.parentId ?? parent.id;
        replyTargetAuthorId = parent.authorId;
      }

      const allowedIds = getAllowedMentionUserIds(task);
      const validMentionIds = sanitizeMentionedUserIds(dto.mentionedUserIds, allowedIds, callerId);

      const comment = await tx.taskComment.create({
        data: {
          taskId,
          authorId: callerId,
          parentId: resolvedParentId,
          content,
          mentionedUserIds: validMentionIds,
        },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const commentPreview = buildCommentPreview(content);
      const replyRecipientId =
        replyTargetAuthorId && replyTargetAuthorId !== callerId ? replyTargetAuthorId : null;

      if (replyRecipientId) {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COMMENT_REPLIED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            commentId: comment.id,
            commentPreview,
            parentAuthorId: replyRecipientId,
            teamId: task.teamId,
            timestamp: comment.createdAt.getTime(),
          },
          tx,
        );
      }

      const mentionRecipients = validMentionIds.filter((id) => id !== replyRecipientId);
      if (mentionRecipients.length > 0) {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COMMENT_MENTIONED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            commentId: comment.id,
            commentPreview,
            mentionedUserIds: mentionRecipients,
            teamId: task.teamId,
            timestamp: comment.createdAt.getTime(),
          },
          tx,
        );
      }

      const mentionMap = await this.resolveMentionUserMap(tx as unknown as PrismaService, [comment]);
      return this.toCommentDto(comment, mentionMap, []);
    });

    void this.realtimeService.emit({
      type: 'TASK_COMMENT_CHANGED',
      actorId: callerId,
      teamId: parentTask.teamId,
      targetUserIds: resolveRealtimeAudience(parentTask),
      payload: {
        taskId,
        commentId: created.id,
        action: 'CREATED',
      },
    });

    return created;
  }

  async update(
    taskId: number,
    commentId: number,
    dto: UpdateTaskCommentDto,
    callerId: number,
  ): Promise<TaskCommentItemDto> {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Nội dung bình luận không được để trống');
    }

    let parentTask!: TaskWithTeamAndMembers;

    const updated = await this.prisma.$transaction(async (tx) => {
      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      const existing = await tx.taskComment.findFirst({
        where: { id: commentId, taskId },
        include: {
          parent: {
            select: { authorId: true },
          },
        },
      });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy bình luận');
      }
      if (existing.authorId !== callerId) {
        throw new ForbiddenException('Bạn chỉ có thể chỉnh sửa bình luận của chính mình');
      }

      const allowedIds = getAllowedMentionUserIds(task);
      const nextMentions =
        dto.mentionedUserIds !== undefined
          ? sanitizeMentionedUserIds(dto.mentionedUserIds, allowedIds, callerId)
          : existing.mentionedUserIds.filter((id) => id !== callerId && allowedIds.has(id));

      const saved = await tx.taskComment.update({
        where: { id: commentId },
        data: {
          content,
          mentionedUserIds: nextMentions,
        },
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      const newlyMentionedIds = nextMentions.filter(
        (id) => !existing.mentionedUserIds.includes(id) && id !== existing.parent?.authorId,
      );
      if (newlyMentionedIds.length > 0) {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COMMENT_MENTIONED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            commentId: saved.id,
            commentPreview: buildCommentPreview(content),
            mentionedUserIds: newlyMentionedIds,
            teamId: task.teamId,
            timestamp: saved.updatedAt.getTime(),
          },
          tx,
        );
      }

      const mentionMap = await this.resolveMentionUserMap(tx as unknown as PrismaService, [saved]);
      return this.toCommentDto(saved, mentionMap, []);
    });

    void this.realtimeService.emit({
      type: 'TASK_COMMENT_CHANGED',
      actorId: callerId,
      teamId: parentTask.teamId,
      targetUserIds: resolveRealtimeAudience(parentTask),
      payload: {
        taskId,
        commentId: updated.id,
        action: 'UPDATED',
      },
    });

    return updated;
  }

  async remove(
    taskId: number,
    commentId: number,
    callerId: number,
  ): Promise<{ success: boolean; deletedId: number }> {
    let parentTask!: TaskWithTeamAndMembers;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      const existing = await tx.taskComment.findFirst({
        where: { id: commentId, taskId },
        select: { id: true, authorId: true },
      });
      if (!existing) {
        throw new NotFoundException('Không tìm thấy bình luận');
      }

      const canDelete =
        existing.authorId === callerId ||
        (Boolean(task.team) && this.policy.isAdminOrOwner(callerId, task.team));
      if (!canDelete) {
        throw new ForbiddenException('Bạn không có quyền xóa bình luận này');
      }

      await tx.taskComment.delete({
        where: { id: commentId },
      });
    });

    void this.realtimeService.emit({
      type: 'TASK_COMMENT_CHANGED',
      actorId: callerId,
      teamId: parentTask.teamId,
      targetUserIds: resolveRealtimeAudience(parentTask),
      payload: {
        taskId,
        commentId,
        action: 'DELETED',
      },
    });

    return { success: true, deletedId: commentId };
  }
}
