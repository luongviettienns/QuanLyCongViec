import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { UpdateTeamDto } from './dto/update-team.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto.js';
import { TeamRole } from '@prisma/client';
import { NotificationEventService } from '../notifications/services/notification-event.service.js';
import { TeamPolicyService } from './policies/team-policy.service.js';
import { TeamMembershipService } from './services/team-membership.service.js';
import { TeamActivityService } from '../team-activity/team-activity.service.js';
import { GetTeamActivityLogsDto } from '../team-activity/dto/get-activity-logs.dto.js';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventService: NotificationEventService,
    private readonly policy: TeamPolicyService,
    private readonly membershipService: TeamMembershipService,
    private readonly teamActivityService: TeamActivityService,
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

    const callerMember = team.members.find((m) => m.userId === userId);
    const { callerRole } = this.policy.resolveCallerContext(
      team.ownerId,
      callerMember,
      userId,
    );

    return {
      ...team,
      currentUserRole: callerRole,
    };
  }

  async update(userId: number, teamId: number, dto: UpdateTeamDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trước tiên trong transaction
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR NO KEY UPDATE
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

      this.policy.assertCanUpdate(isOwner, callerRole);

      return tx.team.update({
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
    });
  }

  async remove(userId: number, teamId: number) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Khóa dòng Team trước tiên trong transaction để tuần tự hóa các mutation
      const lockedTeams = await tx.$queryRaw<Array<{ id: number; name: string; ownerId: number }>>`
        SELECT id, name, "ownerId" FROM "Team" WHERE id = ${teamId} FOR NO KEY UPDATE
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

      // 3. Xác thực quyền Owner ngay trong transaction
      const { isOwner } = this.policy.resolveCallerContext(
        team.ownerId,
        caller,
        userId,
      );

      this.policy.assertCanDelete(isOwner);

      // 4. Kiểm tra dữ liệu công việc đang hoạt động và danh mục phụ thuộc
      const [taskCount, categoryCount] = await Promise.all([
        tx.task.count({
          where: { teamId, deletedAt: null },
        }),
        tx.category.count({
          where: { teamId },
        }),
      ]);

      if (taskCount > 0 || categoryCount > 0) {
        throw new ConflictException({
          code: 'TEAM_HAS_DEPENDENT_DATA',
          message: 'Không thể xóa nhóm khi vẫn còn dữ liệu công việc hoặc danh mục',
          taskCount,
          categoryCount,
        });
      }

      await this.notificationEventService.publish(
        {
          type: 'TEAM_DELETED',
          actorId: userId,
          teamId,
          teamName: team.name,
        },
        tx,
      );

      // Dọn sạch vĩnh viễn các task trong thùng rác (đã xóa mềm) trước khi giải tán nhóm
      await tx.task.deleteMany({
        where: { teamId, deletedAt: { not: null } },
      });

      await tx.team.delete({
        where: { id: teamId },
      });

      return { message: 'Đã giải tán nhóm thành công' };
    });
  }

  async addMember(userId: number, teamId: number, dto: AddMemberDto) {
    return this.membershipService.addMember(userId, teamId, dto);
  }

  async updateMemberRole(
    userId: number,
    teamId: number,
    memberId: number,
    dto: UpdateMemberRoleDto,
  ) {
    return this.membershipService.updateMemberRole(userId, teamId, memberId, dto);
  }

  async transferOwnership(userId: number, teamId: number, dto: TransferOwnershipDto) {
    return this.membershipService.transferOwnership(userId, teamId, dto);
  }

  async removeMember(userId: number, teamId: number, memberId: number) {
    return this.membershipService.removeMember(userId, teamId, memberId);
  }

  async getActivityLogs(userId: number, teamId: number, query?: GetTeamActivityLogsDto) {
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

    this.policy.assertCanViewActivityLogs(isOwner, callerRole);

    return this.teamActivityService.getPaginatedLogs(teamId, query);
  }
}
