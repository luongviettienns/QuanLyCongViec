import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { MoveTaskTeamDto } from '../dto/move-task-team.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { type Task, Prisma } from '@prisma/client';

@Injectable()
export class TaskTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private executeInTransaction<T>(
    externalTx: Prisma.TransactionClient | undefined,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (externalTx) {
      return fn(externalTx);
    }
    return this.prisma.$transaction(fn);
  }

  async moveTeam(
    id: number,
    dto: MoveTaskTeamDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    const hasTeamId = dto.teamId !== undefined;
    const hasAssigneeId = dto.assigneeId !== undefined;

    if (!hasTeamId && !hasAssigneeId) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    try {
      const updatedTask = await this.executeInTransaction(externalTx, async (tx) => {
        const initialTask = await this.queryService.findOne(id, userId, tx);
        const targetTeamId = hasTeamId ? (dto.teamId ?? null) : initialTask.teamId;

        await this.reorderService.lockScopes(tx, [
          { teamId: initialTask.teamId, userId: initialTask.userId },
          { teamId: targetTeamId, userId: initialTask.userId },
        ]);

        const currentTask = await this.queryService.findOne(id, userId, tx);

        if (hasTeamId && !this.policy.canEditContent(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung công việc này');
        }

        if (hasAssigneeId && !this.policy.canChangeAssignee(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền phân công công việc này');
        }

        if (
          currentTask.status === 'DONE' &&
          hasAssigneeId &&
          (dto.assigneeId ?? null) !== currentTask.assigneeId
        ) {
          throw new BadRequestException('Không thể thay đổi người thực hiện khi công việc đã hoàn thành');
        }

        const effectiveTeamId = hasTeamId ? (dto.teamId ?? null) : currentTask.teamId;
        const isTeamChanged = effectiveTeamId !== currentTask.teamId;
        let effectiveAssigneeId = hasAssigneeId ? (dto.assigneeId ?? null) : currentTask.assigneeId;
        let targetTeamMemberIds: number[] = [];

        if (effectiveTeamId !== null) {
          const targetTeam = await tx.team.findUnique({
            where: { id: effectiveTeamId },
            include: { members: true },
          });
          if (!targetTeam || !this.policy.isTeamMember(userId, targetTeam)) {
            throw new NotFoundException('Không tìm thấy nhóm');
          }
          targetTeamMemberIds = targetTeam.members.map((m) => m.userId);

          if (hasAssigneeId) {
            if (effectiveAssigneeId && !this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
              throw new BadRequestException('Người được phân công không thuộc nhóm này');
            }
          } else if (isTeamChanged && effectiveAssigneeId) {
            if (!this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
              effectiveAssigneeId = null;
            }
          }
        } else {
          if (isTeamChanged && currentTask.userId !== userId) {
            throw new ForbiddenException('Chỉ người tạo mới có quyền chuyển công việc về không gian cá nhân');
          }

          if (hasAssigneeId) {
            if (effectiveAssigneeId && effectiveAssigneeId !== currentTask.userId) {
              throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
            }
          } else if (isTeamChanged && effectiveAssigneeId !== currentTask.userId) {
            effectiveAssigneeId = null;
          }
        }

        const updateData: Prisma.TaskUpdateInput = {};

        if (isTeamChanged) {
          const duplicateScopeWhere: Prisma.TaskWhereInput = effectiveTeamId
            ? { teamId: effectiveTeamId, deletedAt: null }
            : { userId: currentTask.userId, teamId: null, deletedAt: null };

          const targetTitle = (dto.title && dto.title.trim()) ? dto.title.trim() : currentTask.title;

          const duplicateTask = await tx.task.findFirst({
            where: {
              ...duplicateScopeWhere,
              title: {
                equals: targetTitle,
                mode: 'insensitive',
              },
              NOT: { id },
            },
          });

          if (duplicateTask) {
            throw new ConflictException(`Tiêu đề '${targetTitle}' đã được sử dụng bởi một công việc khác`);
          }
        }

        if (hasTeamId) {
          updateData.team = effectiveTeamId
            ? { connect: { id: effectiveTeamId } }
            : { disconnect: true };
        }

        if (isTeamChanged && currentTask.categoryId) {
          if (effectiveTeamId !== null) {
            const validTeamCat = await tx.category.findFirst({
              where: {
                id: currentTask.categoryId,
                teamId: effectiveTeamId,
              },
            });
            if (!validTeamCat) {
              updateData.category = { disconnect: true };
            }
          } else {
            const validPersonalCat = await tx.category.findFirst({
              where: {
                id: currentTask.categoryId,
                userId: currentTask.userId,
                teamId: null,
              },
            });
            if (!validPersonalCat) {
              updateData.category = { disconnect: true };
            }
          }
        }

        if (hasAssigneeId || (isTeamChanged && effectiveAssigneeId !== currentTask.assigneeId)) {
          updateData.assignee = effectiveAssigneeId
            ? { connect: { id: effectiveAssigneeId } }
            : { disconnect: true };
        }

        if (isTeamChanged) {
          const destScope: Prisma.TaskWhereInput = effectiveTeamId
            ? { teamId: effectiveTeamId, deletedAt: null }
            : { userId: currentTask.userId, teamId: null, deletedAt: null };

          const newPosition = await this.reorderService.getNextPosition(
            tx,
            destScope,
            currentTask.status,
          );
          updateData.position = newPosition;

          // Re-validate or revoke collaborators and subtask assignments across teams
          if (effectiveTeamId === null) {
            await tx.taskCollaborator.updateMany({
              where: {
                taskId: id,
                status: { in: ['PENDING', 'ACCEPTED'] },
              },
              data: { status: 'REVOKED' },
            });

            await tx.subtask.updateMany({
              where: {
                taskId: id,
                deletedAt: null,
                assigneeId: { not: null, notIn: [currentTask.userId] },
              },
              data: { assigneeId: null },
            });
          } else {
            await tx.taskCollaborator.updateMany({
              where: {
                taskId: id,
                status: { in: ['PENDING', 'ACCEPTED'] },
                OR: [
                  { userId: { notIn: targetTeamMemberIds } },
                  ...(effectiveAssigneeId ? [{ userId: effectiveAssigneeId }] : []),
                ],
              },
              data: { status: 'REVOKED' },
            });

            const validCollabs = await tx.taskCollaborator.findMany({
              where: {
                taskId: id,
                status: 'ACCEPTED',
                userId: { in: targetTeamMemberIds },
              },
              select: { userId: true },
            });

            const eligibleSubtaskAssignees = [
              ...(effectiveAssigneeId ? [effectiveAssigneeId] : []),
              ...validCollabs.map((c) => c.userId),
            ];

            await tx.subtask.updateMany({
              where: {
                taskId: id,
                deletedAt: null,
                assigneeId: {
                  not: null,
                  notIn: eligibleSubtaskAssignees.length > 0 ? eligibleSubtaskAssignees : [-1],
                },
              },
              data: { assigneeId: null },
            });
          }
        }

        const updatedTask = await tx.task.update({
          where: { id },
          data: updateData,
          include: {
            category: true,
            assignee: {
              select: { id: true, name: true, email: true },
            },
            team: {
              select: { id: true, name: true },
            },
          },
        });

        if (isTeamChanged) {
          const sourceScope: Prisma.TaskWhereInput = currentTask.teamId
            ? { teamId: currentTask.teamId, deletedAt: null }
            : { userId: currentTask.userId, teamId: null, deletedAt: null };

          await this.reorderService.reindexColumn(tx, sourceScope, currentTask.status, [id]);

          if (effectiveTeamId) {
            const targetTeam = await tx.team.findUnique({
              where: { id: effectiveTeamId },
              select: { name: true },
            });
            await this.notificationEventService.publish(
              {
                type: 'TASK_MOVED_TEAM',
                actorId: userId,
                taskId: currentTask.id,
                taskTitle: currentTask.title,
                targetTeamId: effectiveTeamId,
                targetTeamName: targetTeam?.name || 'Nhóm',
                assigneeId: effectiveAssigneeId,
              },
              tx,
            );
          }
        }

        if (currentTask.assigneeId !== effectiveAssigneeId) {
          if (currentTask.assigneeId) {
            await this.notificationEventService.publish(
              {
                type: 'TASK_UNASSIGNED',
                actorId: userId,
                taskId: currentTask.id,
                taskTitle: currentTask.title,
                previousAssigneeId: currentTask.assigneeId,
                teamId: currentTask.teamId,
              },
              tx,
            );
          }
          if (effectiveAssigneeId) {
            await this.notificationEventService.publish(
              {
                type: 'TASK_ASSIGNED',
                actorId: userId,
                taskId: currentTask.id,
                taskTitle: currentTask.title,
                assigneeId: effectiveAssigneeId,
                teamId: effectiveTeamId,
              },
              tx,
            );
          }
        }

        return updatedTask;
      });

      if (!externalTx) {
        void this.realtimeService.emit({
          type: 'TASK_UPDATED',
          actorId: userId,
          teamId: updatedTask.teamId,
          targetUserIds: updatedTask.teamId
            ? undefined
            : [updatedTask.userId, ...(updatedTask.assigneeId ? [updatedTask.assigneeId] : [])],
          payload: {
            taskId: updatedTask.id,
            teamId: updatedTask.teamId,
            status: updatedTask.status,
          },
        });
      }

      return updatedTask;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Tiêu đề công việc đã được sử dụng bởi một công việc khác trong phạm vi này');
        }
        if (error.code === 'P2025') {
          throw new NotFoundException('Không tìm thấy công việc (có thể đã bị xoá bởi người khác)');
        }
      }
      throw error;
    }
  }
}
