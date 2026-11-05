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
import { TeamRole } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

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
          role: TeamRole.OWNER,
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
        members: {
          some: { userId },
        },
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

    const callerMember = team.members.find((m) => m.userId === userId);
    if (!callerMember) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    return {
      ...team,
      currentUserRole: callerMember.role,
    };
  }

  async update(userId: number, teamId: number, dto: UpdateTeamDto) {
    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (caller.role !== TeamRole.OWNER && caller.role !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ chủ nhóm hoặc quản trị viên mới có quyền cập nhật thông tin nhóm');
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

    if (!caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (team.ownerId !== userId) {
      throw new ForbiddenException('Chỉ chủ nhóm (OWNER) mới có quyền giải tán nhóm');
    }

    await this.prisma.team.delete({
      where: { id: teamId },
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

    if (!caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (caller.role !== TeamRole.OWNER && caller.role !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ chủ nhóm hoặc quản trị viên mới có quyền thêm thành viên');
    }

    if (dto.role === TeamRole.OWNER) {
      throw new BadRequestException('Không thể thêm thành viên với vai trò OWNER');
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

    if (existingMember) {
      throw new BadRequestException('Người dùng này đã là thành viên trong nhóm');
    }

    return this.prisma.teamMember.create({
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

    if (!caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    if (caller.role !== TeamRole.OWNER) {
      throw new ForbiddenException('Chỉ chủ nhóm (OWNER) mới có quyền thay đổi vai trò của thành viên');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.teamId !== teamId) {
      throw new NotFoundException('Không tìm thấy thành viên trong nhóm này');
    }

    if (targetMember.userId === userId) {
      throw new BadRequestException('Không thể tự thay đổi vai trò của chính mình');
    }

    if (dto.role === TeamRole.OWNER) {
      throw new BadRequestException('Không thể gán vai trò OWNER qua chức năng này');
    }

    return this.prisma.teamMember.update({
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

    if (targetMember.role === TeamRole.OWNER) {
      throw new BadRequestException('Không thể xóa chủ nhóm khỏi nhóm');
    }

    const caller = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: { teamId, userId },
      },
    });

    if (!caller) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    const isSelfLeaving = targetMember.userId === userId;

    if (!isSelfLeaving) {
      if (caller.role === TeamRole.MEMBER) {
        throw new ForbiddenException('Thành viên thường không có quyền xóa thành viên khác');
      }
      if (caller.role === TeamRole.ADMIN && targetMember.role === TeamRole.ADMIN) {
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
    });

    return {
      message: isSelfLeaving ? 'Đã rời nhóm thành công' : 'Đã xóa thành viên khỏi nhóm thành công',
    };
  }
}
