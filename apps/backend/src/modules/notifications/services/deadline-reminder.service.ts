import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from './notification-event.service.js';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);
  private readonly COOLDOWN_MS = 60000; // 60s minimum interval between scans

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventService: NotificationEventService,
  ) {}

  /**
   * Atomically claims the execution lock in PostgreSQL using PostgreSQL's server clock.
   * Uses INSERT ... ON CONFLICT ("key") DO UPDATE ... WHERE ... RETURNING "key"
   * to guarantee that at any given moment, across multiple NestJS instances/servers,
   * ONLY ONE instance wins the right to execute.
   *
   * PostgreSQL's CLOCK_TIMESTAMP() is used as the single unified source of truth,
   * completely eliminating clock drift / skew across multiple nodes.
   *
   * If database access fails, the error is NOT silently ignored,
   * preserving system safety and alerting operators.
   */
  async acquireExecutionLock(force = false): Promise<boolean> {
    if (force) {
      await this.prisma.$queryRaw`
        INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
        VALUES (
          'DEADLINE_REMINDER_LAST_RUN',
          CAST(FLOOR(EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000) AS TEXT),
          CLOCK_TIMESTAMP()
        )
        ON CONFLICT ("key") DO UPDATE
        SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "key";
      `;
      return true;
    }

    const rows = await this.prisma.$queryRaw<Array<{ key: string }>>`
      INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
      VALUES (
        'DEADLINE_REMINDER_LAST_RUN',
        CAST(FLOOR(EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000) AS TEXT),
        CLOCK_TIMESTAMP()
      )
      ON CONFLICT ("key") DO UPDATE
      SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
      WHERE (FLOOR(EXTRACT(EPOCH FROM CLOCK_TIMESTAMP()) * 1000)::bigint - CASE WHEN "SystemSetting"."value" ~ '^[0-9]+$' THEN "SystemSetting"."value"::bigint ELSE 0::bigint END) >= ${this.COOLDOWN_MS}::bigint
      RETURNING "key";
    `;

    return rows.length > 0;
  }

  /**
   * Scans non-completed tasks with due dates and publishes:
   * 1. TASK_DEADLINE_SOON for tasks due today or tomorrow.
   * 2. TASK_OVERDUE for tasks whose deadline has passed (strictly before today).
   *
   * Deduplication is guaranteed at the database level via unique `eventKey`.
   */
  async checkAndSendReminders(
    referenceDate?: Date,
    force = false,
  ): Promise<{
    scanned: number;
    deadlineSoonSent: number;
    overdueSent: number;
    skipped?: boolean;
    message?: string;
  }> {
    const now = referenceDate || new Date();

    // Rate-limiting check with atomic claim across instances & restarts
    if (!referenceDate) {
      let acquired = false;
      try {
        acquired = await this.acquireExecutionLock(force);
      } catch (error) {
        this.logger.error('Lỗi khi kiểm tra hoặc xác lập khóa phân tán deadline qua SystemSetting', error);
        throw error;
      }

      if (!acquired) {
        return {
          scanned: 0,
          deadlineSoonSent: 0,
          overdueSent: 0,
          skipped: true,
          message: 'Tác vụ quét deadline vừa được thực hiện gần đây, vui lòng thử lại sau',
        };
      }
    }

    // Standardize date comparison using Asia/Ho_Chi_Minh calendar day
    const vnFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = vnFormatter.format(now);
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = vnFormatter.format(tomorrowDate);

    const tasks = await this.prisma.task.findMany({
      where: {
        status: { not: TaskStatus.DONE },
        dueDate: { not: null },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        userId: true,
        assigneeId: true,
        teamId: true,
      },
    });

    let deadlineSoonSent = 0;
    let overdueSent = 0;

    for (const task of tasks) {
      if (!task.dueDate) continue;

      const dueDateStr = task.dueDate.toISOString().slice(0, 10);

      try {
        // Overdue check: dueDate is strictly prior to today's calendar date
        if (dueDateStr < todayStr) {
          await this.notificationEventService.publish({
            type: 'TASK_OVERDUE',
            actorId: 0,
            taskId: task.id,
            taskTitle: task.title,
            dueDate: dueDateStr,
            creatorId: task.userId,
            assigneeId: task.assigneeId,
            teamId: task.teamId,
          });
          overdueSent++;
        }
        // Soon check: dueDate is today or tomorrow
        else if (dueDateStr === todayStr || dueDateStr === tomorrowStr) {
          await this.notificationEventService.publish({
            type: 'TASK_DEADLINE_SOON',
            actorId: 0,
            taskId: task.id,
            taskTitle: task.title,
            dueDate: dueDateStr,
            creatorId: task.userId,
            assigneeId: task.assigneeId,
            teamId: task.teamId,
          });
          deadlineSoonSent++;
        }
      } catch (err) {
        this.logger.warn(`Failed to send reminder for task ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    this.logger.log(
      `Deadline reminder completed. Scanned: ${tasks.length}, Soon: ${deadlineSoonSent}, Overdue: ${overdueSent}`,
    );

    return {
      scanned: tasks.length,
      deadlineSoonSent,
      overdueSent,
    };
  }

  @Cron('0 8 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async scheduledScan() {
    return this.checkAndSendReminders();
  }
}
