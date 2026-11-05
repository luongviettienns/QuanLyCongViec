import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FilterTasksDto } from '../dto/filter-tasks.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class TaskStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: number, query?: FilterTasksDto) {
    const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [vnYear, vnMonth, vnDay] = vnDateFormatter
      .format(new Date())
      .split('-')
      .map((part) => parseInt(part, 10));

    const todayDate = new Date(Date.UTC(vnYear, vnMonth - 1, vnDay));
    const next7Days = new Date(todayDate);
    next7Days.setUTCDate(next7Days.getUTCDate() + 7);

    let whereSql: Prisma.Sql;

    if (query?.teamId) {
      const isMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: query.teamId, userId } },
      });
      if (!isMember) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      whereSql = Prisma.sql`"teamId" = ${query.teamId}`;
    } else if (query?.scope === 'created_by_me') {
      whereSql = Prisma.sql`
        "userId" = ${userId}
        AND (
          "teamId" IS NULL
          OR "teamId" IN (SELECT "teamId" FROM "TeamMember" WHERE "userId" = ${userId})
        )
      `;
    } else if (query?.scope === 'assigned_to_me') {
      whereSql = Prisma.sql`
        "assigneeId" = ${userId}
        AND (
          "teamId" IS NULL
          OR "teamId" IN (SELECT "teamId" FROM "TeamMember" WHERE "userId" = ${userId})
        )
      `;
    } else {
      whereSql = Prisma.sql`
        ("userId" = ${userId} OR "assigneeId" = ${userId})
        AND (
          "teamId" IS NULL
          OR "teamId" IN (SELECT "teamId" FROM "TeamMember" WHERE "userId" = ${userId})
        )
      `;
    }

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
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" < ${todayDate})::bigint AS overdue,
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" >= ${todayDate} AND "dueDate" < ${next7Days})::bigint AS "dueSoon",
          COUNT(*) FILTER (WHERE "Priority" = 'LOW')::bigint AS "priorityLow",
          COUNT(*) FILTER (WHERE "Priority" = 'MEDIUM')::bigint AS "priorityMedium",
          COUNT(*) FILTER (WHERE "Priority" = 'HIGH')::bigint AS "priorityHigh"
        FROM "Task"
        WHERE ${whereSql};
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
        WHERE ${whereSql}
          AND status != 'DONE'
          AND "dueDate" IS NOT NULL
          AND "dueDate" >= ${todayDate}
          AND "dueDate" < ${next7Days}
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
