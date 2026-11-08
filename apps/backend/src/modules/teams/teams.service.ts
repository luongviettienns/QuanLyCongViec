import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto.js';
import { TeamRole } from '@prisma/client';
import { NotificationEventService } from '../notifications/services/notification-event.service.js';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventService: NotificationEventService,
  ) {}

  async create(userId: number, dto: CreateTeamDto) {
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          ownerId: userId,
        },
      });

      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId,
          role: TeamRole.ADMIN,
        },
      });

      return tx.team.findUnique({
        where: { id: team.id },
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

  async findAllForUser(userId: number) {
    return this.prisma.team.findMany({
      where: {
        OR: [
          { ownerId: userId },
          {
            members: {
              some: { userId },
            },
          },
        ],
      },
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(userId: number, teamId: number) {
    const team = await this.prisma.team.findUnique({
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
          orderBy: {
            joinedAt: 'asc',
          },
        },
        _count: {
          select: { members: true, tasks: true },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const isOwner = team.ownerId === userId;
    const callerMember = team.members.find((m) => m.userId === userId);
    if (!isOwner && !callerMember) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    return {
      ...team,
      currentUserRole: isOwner ? TeamRole.ADMIN : callerMember!.role,
    };
  }

  async update(userId: number, teamId: number, dto: UpdateTeamDto) {
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

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (!isOwner && caller?.role !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền cập nhật thông tin nhóm');
    }

    return this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      },
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
  }

  async remove(userId: number, teamId: number) {
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

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền giải tán nhóm');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.notificationEventService.publish(
        {
          type: 'TEAM_DELETED',
          actorId: userId,
          teamId,
          teamName: team.name,
        },
        tx,
      );

      await tx.team.delete({
        where: { id: teamId },
      });
    });

    return { message: 'Đã giải tán nhóm thành công' };
  }

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

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (!isOwner && caller?.role !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền thêm thành viên');
    }

    if (dto.role === TeamRole.ADMIN && !isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền bổ nhiệm Quản trị viên');
    }

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

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền thay đổi vai trò của thành viên');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.teamId !== teamId) {
      throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
    }

    if (targetMember.userId === team.ownerId) {
      throw new BadRequestException('Không thể thay đổi vai trò của chủ nhóm');
    }

    if (targetMember.userId === userId) {
      throw new BadRequestException('Không thể tự thay đổi vai trò của chính mình');
    }

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

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền chuyển quyền sở hữu');
    }

    if (dto.newOwnerId === userId) {
      throw new BadRequestException('Bạn đang là chủ sở hữu của nhóm này');
    }

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

    if (targetMember.userId === team.ownerId) {
      throw new BadRequestException('Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm hoặc bị xóa');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    const isOwner = team.ownerId === userId;
    if (!isOwner && !caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const isSelfLeaving = targetMember.userId === userId;

    if (!isSelfLeaving) {
      if (!isOwner && caller?.role !== TeamRole.ADMIN) {
        throw new ForbiddenException('Thành viên thường không có quyền xóa thành viên khác');
      }
      if (targetMember.role === TeamRole.ADMIN && !isOwner) {
        throw new ForbiddenException('Quản trị viên không thể xóa một quản trị viên khác');
      }
    }

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
