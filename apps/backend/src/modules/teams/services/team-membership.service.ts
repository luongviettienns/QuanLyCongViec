import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { TeamPolicyService } from '../policies/team-policy.service.js';
import { TaskReorderService } from '../../tasks/services/task-reorder.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { AddMemberDto } from '../dto/add-member.dto.js';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto.js';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto.js';
import { TeamRole, TaskStatus } from '@prisma/client';

@Injectable()
export class TeamMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TeamPolicyService,
    private readonly notificationEventService: NotificationEventService,
    private readonly taskReorderService: TaskReorderService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async addMember(userId: number, teamId: number, dto: AddMemberDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    const { isOwner, callerRole } = this.policy.resolveCallerContext(
      team.ownerId,
      caller,
      userId,
    );

    this.policy.assertCanAddMember(isOwner, callerRole, dto.role);

    const targetEmail = dto.email.trim().toLowerCase();
    const targetUser = await this.prisma.user.findUnique({
      where: { email: targetEmail },
    });

    if (!targetUser) {
      throw new NotFoundException('Không tìm thấy tài khoản người dùng với email này');
    }

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId: targetUser.id },
      },
    });

    if (existingMember || team.ownerId === targetUser.id) {
      throw new BadRequestException('Người dùng này đã là thành viên trong nhóm');
    }

    const member = await this.prisma.teamMember.create({
      data: {
        teamId,
        userId: targetUser.id,
        role: dto.role ?? TeamRole.MEMBER,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await this.notificationEventService.publish({
      type: 'TEAM_MEMBER_ADDED',
      actorId: userId,
      teamId,
      teamName: team.name,
      newMemberId: targetUser.id,
      role: member.role,
    });

    return member;
  }

  async updateMemberRole(
    userId: number,
    teamId: number,
    memberId: number,
    dto: UpdateMemberRoleDto,
  ) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    const { isOwner } = this.policy.resolveCallerContext(team.ownerId, caller, userId);

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.teamId !== teamId) {
      throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
    }

    this.policy.assertCanUpdateMemberRole(
      isOwner,
      targetMember.userId,
      team.ownerId,
      userId,
    );

    const updated = await this.prisma.teamMember.update({
      where: { id: memberId },
      data: {
        role: dto.role,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await this.notificationEventService.publish({
      type: 'TEAM_ROLE_CHANGED',
      actorId: userId,
      teamId,
      teamName: team.name,
      targetUserId: targetMember.userId,
      newRole: dto.role,
    });

    return updated;
  }

  async transferOwnership(userId: number, teamId: number, dto: TransferOwnershipDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    const { isOwner } = this.policy.resolveCallerContext(team.ownerId, caller, userId);

    this.policy.assertCanTransferOwnership(isOwner, userId, dto.newOwnerId);

    const targetMember = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId: dto.newOwnerId },
      },
    });

    if (!targetMember) {
      throw new BadRequestException('Người nhận quyền sở hữu phải là thành viên trong nhóm');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: { id: teamId },
        data: { ownerId: dto.newOwnerId },
      });

      await tx.teamMember.update({
        where: {
          teamId_userId: { teamId, userId: dto.newOwnerId },
        },
        data: { role: TeamRole.ADMIN },
      });

      await tx.teamMember.upsert({
        where: {
          teamId_userId: { teamId, userId },
        },
        update: { role: TeamRole.ADMIN },
        create: {
          teamId,
          userId,
          role: TeamRole.ADMIN,
        },
      });

      await this.notificationEventService.publish(
        {
          type: 'TEAM_OWNERSHIP_TRANSFERRED',
          actorId: userId,
          teamId,
          teamName: team.name,
          newOwnerId: dto.newOwnerId,
          previousOwnerId: userId,
        },
        tx,
      );

      return tx.team.findUnique({
        where: { id: teamId },
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: { members: true, tasks: true },
          },
        },
      });
    });
  }

  async removeMember(userId: number, teamId: number, memberId: number) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.teamId !== teamId) {
      throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    const { isOwner, callerRole } = this.policy.resolveCallerContext(
      team.ownerId,
      caller,
      userId,
    );

    const { isSelfLeaving } = this.policy.assertCanRemoveMember(
      isOwner,
      callerRole,
      targetMember.userId,
      targetMember.role,
      team.ownerId,
      userId,
    );

    const updatedTasks: Array<{ id: number; title: string }> = [];
    const affectedSubtasks: Array<{ id: number; taskId: number }> = [];
    const revokedCollabTaskIds: number[] = [];

    await this.prisma.$transaction(async (tx) => {
      // 1. Khóa phân tán scope Board của nhóm để đồng bộ hóa cập nhật vị trí
      await this.taskReorderService.lockScope(tx, { teamId, userId });

      // 2. Tìm các công việc ĐANG HOẠT ĐỘNG (chưa DONE, chưa xóa) mà thành viên rời nhóm đang phụ trách
      const tasksToReassign = await tx.task.findMany({
        where: {
          teamId,
          assigneeId: targetMember.userId,
          deletedAt: null,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          position: true,
        },
      });

      // 3. Xử lý từng công việc: hủy phân công, đưa về TODO, reindex vị trí
      for (const t of tasksToReassign) {
        let newPosition = t.position;
        if (t.status === TaskStatus.IN_PROGRESS) {
          await this.taskReorderService.reindexColumn(
            tx,
            { teamId, deletedAt: null },
            TaskStatus.IN_PROGRESS,
            [t.id],
          );
          newPosition = await this.taskReorderService.getNextPosition(
            tx,
            { teamId, deletedAt: null },
            TaskStatus.TODO,
            [t.id],
          );
        }

        await tx.task.update({
          where: { id: t.id },
          data: {
            assigneeId: null,
            status: TaskStatus.TODO,
            position: newPosition,
          },
        });

        updatedTasks.push({ id: t.id, title: t.title });

        await this.notificationEventService.publish(
          {
            type: 'TASK_UNASSIGNED',
            actorId: userId,
            taskId: t.id,
            taskTitle: t.title,
            previousAssigneeId: targetMember.userId,
            teamId,
          },
          tx,
        );
      }

      // 3.1. Thu hồi toàn bộ quyền Collaborator của thành viên rời nhóm và unassign các Subtask chưa hoàn thành
      const teamTaskRecords = await tx.task.findMany({
        where: { teamId },
        select: { id: true },
      });
      const teamTaskIds = teamTaskRecords.map((t) => t.id);

      if (teamTaskIds.length > 0) {
        const collabsToRevoke = await tx.taskCollaborator.findMany({
          where: {
            taskId: { in: teamTaskIds },
            userId: targetMember.userId,
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
          select: { taskId: true },
        });
        revokedCollabTaskIds.push(...collabsToRevoke.map((c) => c.taskId));

        if (collabsToRevoke.length > 0) {
          await tx.taskCollaborator.updateMany({
            where: {
              taskId: { in: teamTaskIds },
              userId: targetMember.userId,
              status: { in: ['PENDING', 'ACCEPTED'] },
            },
            data: {
              status: 'REVOKED',
            },
          });
        }

        const subtasksToReset = await tx.subtask.findMany({
          where: {
            taskId: { in: teamTaskIds },
            assigneeId: targetMember.userId,
            status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
            deletedAt: null,
          },
          select: { id: true, taskId: true },
        });
        affectedSubtasks.push(...subtasksToReset);

        if (subtasksToReset.length > 0) {
          await tx.subtask.updateMany({
            where: {
              id: { in: subtasksToReset.map((s) => s.id) },
            },
            data: {
              assigneeId: null,
              status: TaskStatus.TODO,
            },
          });
        }
      }

      // 4. Các công việc DONE được giữ nguyên vẹn để bảo toàn lịch sử người đã hoàn thành!

      // 5. Xóa quan hệ thành viên khỏi nhóm
      await tx.teamMember.delete({
        where: { id: memberId },
      });

      // 6. Phát thông báo thành viên đã rời / bị xóa khỏi nhóm
      await this.notificationEventService.publish(
        {
          type: 'TEAM_MEMBER_REMOVED',
          actorId: userId,
          teamId,
          teamName: team.name,
          removedUserId: targetMember.userId,
          isSelfLeave: isSelfLeaving,
        },
        tx,
      );
    });

    // 7. Phát realtime sau khi transaction đã commit thành công
    for (const ut of updatedTasks) {
      void this.realtimeService.emit({
        type: 'TASK_UPDATED',
        actorId: userId,
        teamId,
        payload: {
          taskId: ut.id,
          teamId,
          status: TaskStatus.TODO,
        },
      });
    }

    for (const sub of affectedSubtasks) {
      void this.realtimeService.emit({
        type: 'SUBTASK_UPDATED',
        actorId: userId,
        teamId,
        payload: {
          taskId: sub.taskId,
          subtaskId: sub.id,
        },
      });
    }

    for (const collabTaskId of Array.from(new Set(revokedCollabTaskIds))) {
      void this.realtimeService.emit({
        type: 'TASK_COLLABORATORS_CHANGED',
        actorId: userId,
        teamId,
        payload: {
          taskId: collabTaskId,
          action: isSelfLeaving ? 'LEAVE' : 'REMOVE',
          userId: targetMember.userId,
          status: 'REVOKED',
        },
      });
    }

    return {
      message: isSelfLeaving ? 'Đã rời nhóm thành công' : 'Đã xóa thành viên khỏi nhóm thành công',
    };
  }
}
