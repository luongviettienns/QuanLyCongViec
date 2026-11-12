import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FilterTasksDto } from '../dto/filter-tasks.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { Prisma } from '@prisma/client';
import { getVietnamTodayDate } from './task-validation.utils.js';

@Injectable()
export class TaskStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
  ) {}

  async getStats(userId: number, query?: FilterTasksDto) {
    const todayDate = getVietnamTodayDate();
    const next7Days = new Date(todayDate);
    next7Days.setUTCDate(next7Days.getUTCDate() + 7);

    let teamAccessSql: Prisma.Sql;

    if (query?.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: query.teamId },
        include: { members: true },
      });
      if (!this.policy.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      teamAccessSql = Prisma.sql`"teamId" = ${query.teamId}`;
    } else {
      teamAccessSql = Prisma.sql`
        (
          ("teamId" IS NULL AND ("userId" = ${userId} OR "assigneeId" = ${userId}))
          OR (
            "teamId" IN (
              SELECT "teamId" FROM "TeamMember" WHERE "userId" = ${userId}
              UNION
              SELECT "id" FROM "Team" WHERE "ownerId" = ${userId}
            )
          )
        )
      `;
    }

    let scopeSql = Prisma.sql`1=1`;
    if (query?.scope === 'created_by_me') {
      scopeSql = Prisma.sql`"userId" = ${userId}`;
    } else if (query?.scope === 'assigned_to_me') {
      scopeSql = Prisma.sql`"assigneeId" = ${userId}`;
    } else if (query?.scope === 'collaborating') {
      scopeSql = Prisma.sql`
        EXISTS (
          SELECT 1 FROM "TaskCollaborator" tc
          WHERE tc."taskId" = "Task"."id" AND tc."userId" = ${userId} AND tc."status" = 'ACCEPTED'
        )
      `;
    } else if (query?.scope === 'subtasks_assigned_to_me') {
      scopeSql = Prisma.sql`
        EXISTS (
          SELECT 1 FROM "Subtask" st
          WHERE st."taskId" = "Task"."id" AND st."assigneeId" = ${userId} AND st."deletedAt" IS NULL
        )
      `;
    } else if (query?.scope === 'my_work') {
      scopeSql = Prisma.sql`
        (
          "assigneeId" = ${userId}
          OR EXISTS (
            SELECT 1 FROM "TaskCollaborator" tc
            WHERE tc."taskId" = "Task"."id" AND tc."userId" = ${userId} AND tc."status" = 'ACCEPTED'
          )
          OR EXISTS (
            SELECT 1 FROM "Subtask" st
            WHERE st."taskId" = "Task"."id" AND st."assigneeId" = ${userId} AND st."deletedAt" IS NULL
          )
        )
      `;
    }

    const whereSql = Prisma.sql`(${teamAccessSql}) AND (${scopeSql})`;

    const [statsResult, deadlinesResult] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          total: bigint | number;
          todo: bigint | number;
          inProgress: bigint | number;
          done: bigint | number;
          overdue: bigint | number;
          dueSoon: bigint | number;
          priorityLow: bigint | number;
          priorityMedium: bigint | number;
          priorityHigh: bigint | number;
        }>
      >`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status = 'TODO')::bigint AS todo,
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::bigint AS "inProgress",
          COUNT(*) FILTER (WHERE status = 'DONE')::bigint AS done,
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" < ${todayDate}::date)::bigint AS overdue,
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" >= ${todayDate}::date AND "dueDate" < ${next7Days}::date)::bigint AS "dueSoon",
          COUNT(*) FILTER (WHERE "Priority" = 'LOW')::bigint AS "priorityLow",
          COUNT(*) FILTER (WHERE "Priority" = 'MEDIUM')::bigint AS "priorityMedium",
          COUNT(*) FILTER (WHERE "Priority" = 'HIGH')::bigint AS "priorityHigh"
        FROM "Task"
        WHERE (${whereSql})
          AND "deletedAt" IS NULL;
      `,
      this.prisma.$queryRaw<
        Array<{
          date: string;
          count: bigint | number;
        }>
      >`
        SELECT
          to_char("dueDate", 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Task"
        WHERE (${whereSql})
          AND "deletedAt" IS NULL
          AND status != 'DONE'
          AND "dueDate" IS NOT NULL
          AND "dueDate" >= ${todayDate}::date
          AND "dueDate" < ${next7Days}::date
        GROUP BY "dueDate"
        ORDER BY "dueDate" ASC;
      `,
    ]);

    const stats = statsResult[0];
    const total = Number(stats?.total ?? 0);
    const todo = Number(stats?.todo ?? 0);
    const inProgress = Number(stats?.inProgress ?? 0);
    const done = Number(stats?.done ?? 0);
    const overdue = Number(stats?.overdue ?? 0);
    const dueSoon = Number(stats?.dueSoon ?? 0);
    const priorityLow = Number(stats?.priorityLow ?? 0);
    const priorityMedium = Number(stats?.priorityMedium ?? 0);
    const priorityHigh = Number(stats?.priorityHigh ?? 0);
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const deadlineMap = new Map<string, number>();
    for (const row of deadlinesResult) {
      if (row.date) {
        deadlineMap.set(row.date, Number(row.count ?? 0));
      }
    }

    const upcomingDeadlines: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() + i);
      const isoDate = d.toISOString().slice(0, 10);
      upcomingDeadlines.push({
        date: isoDate,
        count: deadlineMap.get(isoDate) ?? 0,
      });
    }

    return {
      total,
      todo,
      inProgress,
      done,
      overdue,
      dueSoon,
      completionRate,
      byPriority: {
        low: priorityLow,
        medium: priorityMedium,
        high: priorityHigh,
      },
      upcomingDeadlines,
    };
  }
}
