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
    return this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trong transaction để tuần tự hóa và chống race condition
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR UPDATE
      `;

      if (!lockedTeams || lockedTeams.length === 0) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      const team = lockedTeams[0];

      // 2. Đọc membership của caller ngay trong transaction đã khóa
      const caller = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId },
        },
      });

      // 3. Xác thực quyền ngay trong transaction
      const { isOwner, callerRole } = this.policy.resolveCallerContext(
        team.ownerId,
        caller,
        userId,
      );

      this.policy.assertCanAddMember(isOwner, callerRole, dto.role);

      // 4. Kiểm tra tài khoản đích
      const targetEmail = dto.email.trim().toLowerCase();
      const targetUser = await tx.user.findUnique({
        where: { email: targetEmail },
      });

      if (!targetUser) {
        throw new NotFoundException('Không tìm thấy tài khoản người dùng với email này');
      }

      const existingMember = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId: targetUser.id },
        },
      });

      if (existingMember || team.ownerId === targetUser.id) {
        throw new BadRequestException('Người dùng này đã là thành viên trong nhóm');
      }

      // 5. Tạo thành viên mới
      const createdMember = await tx.teamMember.create({
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

      // 6. Ghi nhật ký hoạt động trong cùng transaction
      await tx.teamActivityLog.create({
        data: {
          teamIdSnapshot: team.id,
          teamNameSnapshot: team.name,
          teamId: team.id,
          actorId: userId,
          targetUserId: targetUser.id,
          action: 'ADD_MEMBER',
          newRole: createdMember.role,
        },
      });

      // 7. Tạo Notification nguyên tử trong cùng transaction (SSE tự động gửi post-commit)
      await this.notificationEventService.publish(
        {
          type: 'TEAM_MEMBER_ADDED',
          actorId: userId,
          teamId,
          teamName: team.name,
          newMemberId: targetUser.id,
          role: createdMember.role,
        },
        tx,
      );

      return createdMember;
    });
  }

  async updateMemberRole(
    userId: number,
    teamId: number,
    memberId: number,
    dto: UpdateMemberRoleDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trong transaction
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR UPDATE
      `;

      if (!lockedTeams || lockedTeams.length === 0) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      const team = lockedTeams[0];

      // 2. Đọc caller membership trong transaction đã khóa
      const caller = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId },
        },
      });

      const { isOwner } = this.policy.resolveCallerContext(team.ownerId, caller, userId);

      // 3. Đọc target member trong transaction
      const targetMember = await tx.teamMember.findUnique({
        where: { id: memberId },
      });

      if (!targetMember || targetMember.teamId !== teamId) {
        throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
      }

      // 4. Xác thực quyền trong transaction
      this.policy.assertCanUpdateMemberRole(
        isOwner,
        targetMember.userId,
        team.ownerId,
        userId,
      );

      // 5. Cập nhật role
      const res = await tx.teamMember.update({
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

      // 6. Ghi nhật ký trong transaction
      await tx.teamActivityLog.create({
        data: {
          teamIdSnapshot: team.id,
          teamNameSnapshot: team.name,
          teamId: team.id,
          actorId: userId,
          targetUserId: targetMember.userId,
          action: 'CHANGE_ROLE',
          oldRole: targetMember.role,
          newRole: dto.role,
        },
      });

      // 7. Tạo Notification nguyên tử trong cùng transaction (SSE tự động gửi post-commit)
      await this.notificationEventService.publish(
        {
          type: 'TEAM_ROLE_CHANGED',
          actorId: userId,
          teamId,
          teamName: team.name,
          targetUserId: targetMember.userId,
          newRole: dto.role,
        },
        tx,
      );

      return res;
    });
  }

  async transferOwnership(userId: number, teamId: number, dto: TransferOwnershipDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trong transaction để tuần tự hóa chuyển quyền
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR UPDATE
      `;

      if (!lockedTeams || lockedTeams.length === 0) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      const team = lockedTeams[0];

      // 2. Đọc caller membership ngay trong transaction đã khóa
      const caller = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId },
        },
      });

      // 3. Xác thực quyền Owner ngay tại thời điểm đã khóa
      const { isOwner } = this.policy.resolveCallerContext(team.ownerId, caller, userId);
      this.policy.assertCanTransferOwnership(isOwner, userId, dto.newOwnerId);

      // 4. Kiểm tra target member trong transaction
      const targetMember = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId: dto.newOwnerId },
        },
      });

      if (!targetMember) {
        throw new BadRequestException('Người nhận quyền sở hữu phải là thành viên trong nhóm');
      }

      // 5. Cập nhật quyền sở hữu và role
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

      await tx.teamActivityLog.create({
        data: {
          teamIdSnapshot: team.id,
          teamNameSnapshot: team.name,
          teamId: team.id,
          actorId: userId,
          targetUserId: dto.newOwnerId,
          action: 'TRANSFER_OWNER',
          oldRole: targetMember.role,
          newRole: TeamRole.ADMIN,
          metadata: {
            previousOwnerId: userId,
            newOwnerId: dto.newOwnerId,
          },
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
    const updatedTasks: Array<{ id: number; title: string }> = [];
    const affectedSubtasks: Array<{ id: number; taskId: number }> = [];
    const revokedCollabTaskIds: number[] = [];
    let isSelfLeaving = false;
    let targetMemberUserId = 0;

    await this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trong transaction để tuần tự hóa xóa thành viên
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR UPDATE
      `;

      if (!lockedTeams || lockedTeams.length === 0) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      const team = lockedTeams[0];

      // 2. Đọc target member trong transaction
      const targetMember = await tx.teamMember.findUnique({
        where: { id: memberId },
      });

      if (!targetMember || targetMember.teamId !== teamId) {
        throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
      }
      targetMemberUserId = targetMember.userId;

      // 3. Đọc caller membership trong transaction đã khóa
      const caller = await tx.teamMember.findUnique({
        where: {
          teamId_userId: { teamId, userId },
        },
      });

      // 4. Xác thực quyền trong transaction
      const { isOwner, callerRole } = this.policy.resolveCallerContext(
        team.ownerId,
        caller,
        userId,
      );

      const removalResult = this.policy.assertCanRemoveMember(
        isOwner,
        callerRole,
        targetMember.userId,
        targetMember.role,
        team.ownerId,
        userId,
      );
      isSelfLeaving = removalResult.isSelfLeaving;

      // 5. Khóa phân tán scope Board của nhóm để đồng bộ hóa cập nhật vị trí
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

      // 6. Ghi nhật ký hoạt động (Activity History)
      await tx.teamActivityLog.create({
        data: {
          teamIdSnapshot: team.id,
          teamNameSnapshot: team.name,
          teamId: team.id,
          actorId: userId,
          targetUserId: targetMember.userId,
          action: isSelfLeaving ? 'LEAVE_TEAM' : 'REMOVE_MEMBER',
          oldRole: targetMember.role,
          metadata: {
            unassignedTaskCount: updatedTasks.length,
            affectedSubtaskCount: affectedSubtasks.length,
            revokedCollaboratorCount: revokedCollabTaskIds.length,
          },
        },
      });

      // 7. Phát thông báo thành viên đã rời / bị xóa khỏi nhóm
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
          userId: targetMemberUserId,
          status: 'REVOKED',
        },
      });
    }

    return {
      message: isSelfLeaving ? 'Đã rời nhóm thành công' : 'Đã xóa thành viên khỏi nhóm thành công',
    };
  }
}
