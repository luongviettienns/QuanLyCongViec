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
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TeamActivityService } from '../../team-activity/team-activity.service.js';
import { InviteCollaboratorDto } from '../dto/invite-collaborator.dto.js';
import { RespondCollaboratorDto } from '../dto/respond-collaborator.dto.js';
import { CollaboratorStatus, TaskStatus, TeamActivityAction } from '@prisma/client';

@Injectable()
export class TaskCollaboratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
    private readonly teamActivityService: TeamActivityService,
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
    let parentTask: any = null;
    const result = await this.prisma.$transaction(async (tx) => {
      // Row lock the parent task for concurrent protection
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

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
        const updated = await tx.taskCollaborator.update({
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

        await this.notificationEventService.publish(
          {
            type: 'TASK_COLLABORATOR_INVITED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            teamId: task.teamId,
            invitedUserId: dto.userId,
            invitedAt: updated.invitedAt,
            timestamp: updated.invitedAt.getTime(),
          },
          tx,
        );

        return updated;
      }

      const created = await tx.taskCollaborator.create({
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

      if (task.teamId) {
        await this.teamActivityService.logActivity(tx, {
          teamId: task.teamId,
          actorId: callerId,
          action: TeamActivityAction.COLLABORATOR_ADDED,
          targetUserId: dto.userId,
          metadata: {
            taskId,
            taskTitle: task.title,
          },
        });
      }

      await this.notificationEventService.publish(
        {
          type: 'TASK_COLLABORATOR_INVITED',
          actorId: callerId,
          taskId,
          taskTitle: task.title,
          teamId: task.teamId,
          invitedUserId: dto.userId,
          invitedAt: created.invitedAt,
          timestamp: created.invitedAt.getTime(),
        },
        tx,
      );

      return created;
    });

    void this.realtimeService.emit({
      type: 'TASK_COLLABORATORS_CHANGED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      payload: {
        taskId,
        action: 'INVITE',
        userId: dto.userId,
        status: result.status,
      },
    });

    return result;
  }

  async respond(taskId: number, dto: RespondCollaboratorDto, callerId: number) {
    let parentTask: any = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Row lock on task
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

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

      const updatedRecord = await tx.taskCollaborator.update({
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

      if (dto.action === 'ACCEPT') {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COLLABORATOR_ACCEPTED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            teamId: task.teamId!,
            invitedById: collab.invitedById,
            assigneeId: task.assigneeId,
            respondedAt: updatedRecord.respondedAt ?? new Date(),
            timestamp: updatedRecord.respondedAt?.getTime() ?? Date.now(),
          },
          tx,
        );
      } else {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COLLABORATOR_DECLINED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            teamId: task.teamId!,
            invitedById: collab.invitedById,
            assigneeId: task.assigneeId,
            respondedAt: updatedRecord.respondedAt ?? new Date(),
            timestamp: updatedRecord.respondedAt?.getTime() ?? Date.now(),
          },
          tx,
        );
      }

      return updatedRecord;
    });

    void this.realtimeService.emit({
      type: 'TASK_COLLABORATORS_CHANGED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      payload: {
        taskId,
        action: dto.action,
        userId: callerId,
        status: updated.status,
      },
    });

    return updated;
  }

  async remove(taskId: number, targetUserId: number, callerId: number) {
    let parentTask: any = null;
    let isSelfLeaving = false;
    let affectedSubtaskIds: number[] = [];
    const updatedCollab = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      const collab = await tx.taskCollaborator.findUnique({
        where: {
          taskId_userId: { taskId, userId: targetUserId },
        },
      });

      if (
        !collab ||
        collab.status === CollaboratorStatus.REVOKED ||
        collab.status === CollaboratorStatus.DECLINED
      ) {
        throw new NotFoundException(
          'Không tìm thấy người phối hợp hoặc lời mời đã bị thu hồi/từ chối',
        );
      }

      isSelfLeaving = callerId === targetUserId;
      if (!isSelfLeaving && !this.policy.canManageCollaborators(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền thu hồi hoặc xóa người phối hợp này');
      }

      // Update collaborator status to REVOKED
      const updated = await tx.taskCollaborator.update({
        where: { id: collab.id },
        data: {
          status: CollaboratorStatus.REVOKED,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          invitedBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Identify unfinished subtasks assigned to this collaborator BEFORE bulk cleanup
      const affectedSubtasks = await tx.subtask.findMany({
        where: {
          taskId,
          assigneeId: targetUserId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          deletedAt: null,
        },
        select: { id: true, title: true },
      });
      affectedSubtaskIds = affectedSubtasks.map((s) => s.id);

      // Cleanup unfinished subtasks assigned to this collaborator on this task
      if (affectedSubtaskIds.length > 0) {
        await tx.subtask.updateMany({
          where: {
            id: { in: affectedSubtaskIds },
          },
          data: {
            assigneeId: null,
            status: TaskStatus.TODO,
          },
        });
      }

      if (task.teamId) {
        await this.teamActivityService.logActivity(tx, {
          teamId: task.teamId,
          actorId: callerId,
          action: TeamActivityAction.COLLABORATOR_REMOVED,
          targetUserId,
          metadata: {
            taskId,
            taskTitle: task.title,
            isSelfLeave: isSelfLeaving,
          },
        });
      }

      await this.notificationEventService.publish(
        {
          type: 'TASK_COLLABORATOR_REMOVED',
          actorId: callerId,
          taskId,
          taskTitle: task.title,
          teamId: task.teamId!,
          removedUserId: targetUserId,
          isSelfLeave: isSelfLeaving,
          assigneeId: task.assigneeId,
          removedAt: updated.updatedAt,
          timestamp: updated.updatedAt.getTime(),
        },
        tx,
      );

      for (const affectedSubtask of affectedSubtasks) {
        await this.notificationEventService.publish(
          {
            type: 'SUBTASK_UNASSIGNED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            teamId: task.teamId!,
            subtaskId: affectedSubtask.id,
            subtaskTitle: affectedSubtask.title,
            previousAssigneeId: targetUserId,
            reassignedToUserId: null,
            unassignedAt: updated.updatedAt,
            timestamp: updated.updatedAt.getTime(),
          },
          tx,
        );
      }

      return updated;
    });

    void this.realtimeService.emit({
      type: 'TASK_COLLABORATORS_CHANGED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      payload: {
        taskId,
        action: isSelfLeaving ? 'LEAVE' : 'REMOVE',
        userId: targetUserId,
        status: updatedCollab.status,
      },
    });

    for (const subId of affectedSubtaskIds) {
      void this.realtimeService.emit({
        type: 'SUBTASK_UPDATED',
        actorId: callerId,
        teamId: parentTask?.teamId,
        payload: {
          taskId,
          subtaskId: subId,
        },
      });
    }

    return updatedCollab;
  }
}
