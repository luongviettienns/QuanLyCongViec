import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, TeamActivityAction, TeamRole, TeamActivityLog } from '@prisma/client';
import { GetTeamActivityLogsDto } from './dto/get-activity-logs.dto.js';

export interface LogActivityParams {
  teamId: number;
  actorId: number;
  action: TeamActivityAction;
  targetUserId?: number | null;
  oldRole?: TeamRole | null;
  newRole?: TeamRole | null;
  metadata?: Record<string, unknown> | null;
}

export interface PaginatedTeamActivityLogs {
  data: TeamActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class TeamActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async logActivity(
    tx: Prisma.TransactionClient,
    params: LogActivityParams,
  ): Promise<TeamActivityLog | null> {
    if (!params.teamId) return null;

    const team = await tx.team.findUnique({
      where: { id: params.teamId },
      select: { id: true, name: true },
    });
    if (!team) return null;

    return tx.teamActivityLog.create({
      data: {
        teamIdSnapshot: team.id,
        teamNameSnapshot: team.name,
        teamId: team.id,
        actorId: params.actorId > 0 ? params.actorId : null,
        targetUserId: params.targetUserId ?? null,
        action: params.action,
        oldRole: params.oldRole ?? null,
        newRole: params.newRole ?? null,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  async getPaginatedLogs(
    teamId: number,
    query?: GetTeamActivityLogsDto,
  ): Promise<PaginatedTeamActivityLogs> {
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit =
      query?.limit && query.limit > 0
        ? query.limit
        : query?.page !== undefined
          ? 4
          : 100;
    const skip = (page - 1) * limit;

    const where: Prisma.TeamActivityLogWhereInput = {
      OR: [{ teamId }, { teamIdSnapshot: teamId }],
    };

    if (query?.action) {
      where.action = query.action;
    }

    if (query?.actorId) {
      where.actorId = query.actorId;
    }

    const [total, data] = await Promise.all([
      this.prisma.teamActivityLog.count({ where }),
      this.prisma.teamActivityLog.findMany({
        where,
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
          targetUser: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
