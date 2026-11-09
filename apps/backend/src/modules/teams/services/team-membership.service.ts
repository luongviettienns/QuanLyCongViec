import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { TeamPolicyService } from '../policies/team-policy.service.js';
import { AddMemberDto } from '../dto/add-member.dto.js';
import { UpdateMemberRoleDto } from '../dto/update-member-role.dto.js';
import { TransferOwnershipDto } from '../dto/transfer-ownership.dto.js';
import { TeamRole } from '@prisma/client';

@Injectable()
export class TeamMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TeamPolicyService,
    private readonly notificationEventService: NotificationEventService,
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

    await this.prisma.$transaction(async (tx) => {
      await tx.task.updateMany({
        where: {
          teamId,
          assigneeId: targetMember.userId,
        },
        data: {
          assigneeId: null,
        },
      });

      await tx.teamMember.delete({
        where: { id: memberId },
      });

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

    return {
      message: isSelfLeaving ? 'Đã rời nhóm thành công' : 'Đã xóa thành viên khỏi nhóm thành công',
    };
  }
}
