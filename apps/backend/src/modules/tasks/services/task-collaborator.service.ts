import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { InviteCollaboratorDto } from '../dto/invite-collaborator.dto.js';
import { RespondCollaboratorDto } from '../dto/respond-collaborator.dto.js';
import { CollaboratorStatus, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskCollaboratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
  ) {}

  async getCollaborators(taskId: number, callerId: number) {
    // findOne ensures task exists, caller has permission to view, and task is not soft deleted
    await this.queryService.findOne(taskId, callerId);

    return this.prisma.taskCollaborator.findMany({
      where: { taskId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        invitedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(taskId: number, dto: InviteCollaboratorDto, callerId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Row lock the parent task for concurrent protection
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

      if (!task.teamId || !task.team) {
        throw new BadRequestException('Chỉ có thể mời người phối hợp cho công việc thuộc nhóm làm việc');
      }

      if (!this.policy.canManageCollaborators(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền mời người phối hợp cho công việc này');
      }

      if (dto.userId === callerId) {
        throw new BadRequestException('Không thể tự mời chính mình làm người phối hợp');
      }

      if (dto.userId === task.assigneeId) {
        throw new BadRequestException('Người này đang là người phụ trách chính của công việc');
      }

      const targetUser = await tx.user.findUnique({
        where: { id: dto.userId },
      });
      if (!targetUser) {
        throw new NotFoundException('Không tìm thấy tài khoản người dùng được mời');
      }

      const isMember = this.policy.isTeamMember(dto.userId, task.team);
      if (!isMember) {
        throw new BadRequestException('Người được mời không phải là thành viên trong nhóm');
      }

      const existing = await tx.taskCollaborator.findUnique({
        where: {
          taskId_userId: { taskId, userId: dto.userId },
        },
      });

      if (existing) {
        if (existing.status === CollaboratorStatus.ACCEPTED) {
          throw new ConflictException('Người dùng này đã là người phối hợp của công việc');
        }
        if (existing.status === CollaboratorStatus.PENDING) {
          throw new ConflictException('Lời mời phối hợp đang chờ phản hồi');
        }

        // Re-inviting previously declined or revoked collaborator
        return tx.taskCollaborator.update({
          where: { id: existing.id },
          data: {
            status: CollaboratorStatus.PENDING,
            invitedById: callerId,
            invitedAt: new Date(),
            respondedAt: null,
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            invitedBy: { select: { id: true, name: true, email: true } },
          },
        });
      }

      return tx.taskCollaborator.create({
        data: {
          taskId,
          userId: dto.userId,
          invitedById: callerId,
          status: CollaboratorStatus.PENDING,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  async respond(taskId: number, dto: RespondCollaboratorDto, callerId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Row lock on task
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

      const collab = await tx.taskCollaborator.findUnique({
        where: {
          taskId_userId: { taskId, userId: callerId },
        },
      });

      if (!collab) {
        throw new NotFoundException('Không tìm thấy lời mời phối hợp cho bạn trong công việc này');
      }

      if (collab.status === CollaboratorStatus.ACCEPTED) {
        throw new BadRequestException('Bạn đã chấp nhận lời mời này trước đó');
      }
      if (collab.status === CollaboratorStatus.DECLINED) {
        throw new BadRequestException('Bạn đã từ chối lời mời này trước đó');
      }
      if (collab.status === CollaboratorStatus.REVOKED) {
        throw new BadRequestException('Lời mời phối hợp đã bị thu hồi');
      }

      if (!this.policy.isTeamMember(callerId, task.team)) {
        throw new ForbiddenException('Bạn không còn là thành viên của nhóm');
      }

      const newStatus =
        dto.action === 'ACCEPT'
          ? CollaboratorStatus.ACCEPTED
          : CollaboratorStatus.DECLINED;

      return tx.taskCollaborator.update({
        where: { id: collab.id },
        data: {
          status: newStatus,
          respondedAt: new Date(),
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });
  }

  async remove(taskId: number, targetUserId: number, callerId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

      const collab = await tx.taskCollaborator.findUnique({
        where: {
          taskId_userId: { taskId, userId: targetUserId },
        },
      });

      if (!collab || collab.status === CollaboratorStatus.REVOKED) {
        throw new NotFoundException('Không tìm thấy người phối hợp hoặc lời mời đã bị thu hồi');
      }

      const isSelfLeaving = callerId === targetUserId;
      if (!isSelfLeaving && !this.policy.canManageCollaborators(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền thu hồi hoặc xóa người phối hợp này');
      }

      // Update collaborator status to REVOKED
      const updatedCollab = await tx.taskCollaborator.update({
        where: { id: collab.id },
        data: {
          status: CollaboratorStatus.REVOKED,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Cleanup unfinished subtasks assigned to this collaborator on this task
      await tx.subtask.updateMany({
        where: {
          taskId,
          assigneeId: targetUserId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          deletedAt: null,
        },
        data: {
          assigneeId: null,
          status: TaskStatus.TODO,
        },
      });

      return updatedCollab;
    });
  }
}
