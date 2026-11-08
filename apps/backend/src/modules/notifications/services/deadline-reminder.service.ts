import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from './notification-event.service.js';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);
  private lastRunTime = 0;
  private readonly COOLDOWN_MS = 60000; // 60s minimum interval between scans

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventService: NotificationEventService,
  ) {}

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

    // Rate-limiting check to prevent denial-of-service / duplicate load across instances & restarts
    if (!referenceDate && !force) {
      const nowMs = Date.now();

      // Check DB persistent setting
      let lastRunMs = this.lastRunTime;
      try {
        if (this.prisma.systemSetting) {
          const setting = await this.prisma.systemSetting.findUnique({
            where: { key: 'DEADLINE_REMINDER_LAST_RUN' },
          });
          if (setting?.value) {
            const parsed = parseInt(setting.value, 10);
            if (!isNaN(parsed) && parsed > lastRunMs) {
              lastRunMs = parsed;
            }
          }
        }
      } catch {
        // Fallback to in-memory if DB transient issue
      }

      if (nowMs - lastRunMs < this.COOLDOWN_MS) {
        return {
          scanned: 0,
          deadlineSoonSent: 0,
          overdueSent: 0,
          skipped: true,
          message: 'Tác vụ quét deadline vừa được thực hiện gần đây, vui lòng thử lại sau',
        };
      }

      this.lastRunTime = nowMs;
      try {
        if (this.prisma.systemSetting) {
          await this.prisma.systemSetting.upsert({
            where: { key: 'DEADLINE_REMINDER_LAST_RUN' },
            update: { value: String(nowMs) },
            create: { key: 'DEADLINE_REMINDER_LAST_RUN', value: String(nowMs) },
          });
        }
      } catch {
        // Ignore setting upsert failure
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
}
