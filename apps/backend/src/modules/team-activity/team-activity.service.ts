import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService, POST_COMMIT_HOOKS } from '../../database/prisma.service.js';
import { Prisma, TeamActivityAction, TeamRole, TeamActivityLog } from '@prisma/client';
import { GetTeamActivityLogsDto } from './dto/get-activity-logs.dto.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export interface LogActivityParams {
  teamId: number;
  teamName?: string;
  actorId: number;
  action: TeamActivityAction;
  targetUserId?: number | null;
  oldRole?: TeamRole | null;
  newRole?: TeamRole | null;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityActorInfo {
  id: number;
  name: string;
  email: string;
}

export interface PaginatedTeamActivityLogs {
  data: TeamActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  actors: ActivityActorInfo[];
}

@Injectable()
export class TeamActivityService {
  private readonly logger = new Logger(TeamActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtimeService?: RealtimeService,
  ) {}

  async logActivity(
    tx: Prisma.TransactionClient,
    params: LogActivityParams,
  ): Promise<TeamActivityLog | null> {
    if (!params.teamId) {
      this.logger.warn('Cannot log activity: teamId is missing');
      return null;
    }

    let teamName = params.teamName;
    if (!teamName) {
      const team = await tx.team.findUnique({
        where: { id: params.teamId },
        select: { id: true, name: true },
      });
      if (!team) {
        this.logger.warn(`Cannot log activity: Team #${params.teamId} not found`);
        return null;
      }
      teamName = team.name;
    }

    const created = await tx.teamActivityLog.create({
      data: {
        teamIdSnapshot: params.teamId,
        teamNameSnapshot: teamName,
        teamId: params.teamId,
        actorId: params.actorId > 0 ? params.actorId : null,
        targetUserId: params.targetUserId ?? null,
        action: params.action,
        oldRole: params.oldRole ?? null,
        newRole: params.newRole ?? null,
        metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    if (this.realtimeService) {
      const emitActivity = () => {
        void this.realtimeService?.emit({
          type: 'TEAM_ACTIVITY_CREATED',
          actorId: params.actorId > 0 ? params.actorId : undefined,
          teamId: params.teamId,
          payload: {
            activityId: created.id,
            teamId: params.teamId,
            action: params.action,
          },
        });
      };

      const hooks = (tx as unknown as Record<symbol, Array<() => void> | undefined>)[POST_COMMIT_HOOKS];
      if (hooks && Array.isArray(hooks)) {
        hooks.push(emitActivity);
      } else {
        (tx as unknown as Record<symbol, Array<() => void>>)[POST_COMMIT_HOOKS] = [emitActivity];
      }
    }

    return created;
  }

  async getPaginatedLogs(
    teamId: number,
    query?: GetTeamActivityLogsDto,
  ): Promise<PaginatedTeamActivityLogs> {
    const page = query?.page && query.page > 0 ? query.page : 1;
    const limit = query?.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TeamActivityLogWhereInput = {
      teamIdSnapshot: teamId,
    };

    if (query?.action) {
      where.action = query.action;
    }

    if (query?.actorId) {
      where.actorId = query.actorId;
    }

    const [total, data, actorRows] = await Promise.all([
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
      this.prisma.teamActivityLog.findMany({
        where: { teamIdSnapshot: teamId, actorId: { not: null } },
        select: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
        distinct: ['actorId'],
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const actors: ActivityActorInfo[] = actorRows
      .map((r) => r.actor)
      .filter((a): a is ActivityActorInfo => Boolean(a));

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      actors,
    };
  }

  /**
   * Cleans up logs older than retention period (default 12 months)
   * Scheduled nightly at 03:00 AM Asia/Ho_Chi_Minh
   */
  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async scheduledCleanup(retentionMonths: number = 12): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    try {
      const result = await this.prisma.teamActivityLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });
      if (result.count > 0) {
        this.logger.log(`[Scheduled Cleanup] Removed ${result.count} activity logs older than ${retentionMonths} months.`);
      }
      return result.count;
    } catch (error) {
      this.logger.error('[Scheduled Cleanup] Error cleaning old activity logs:', error);
      return 0;
    }
  }
}
