import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { NotificationEventService } from './notification-event.service.js';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEventService: NotificationEventService,
  ) {}

  /**
   * Scans non-completed tasks with due dates and publishes:
   * 1. TASK_DEADLINE_SOON for tasks due within the next 24 hours.
   * 2. TASK_OVERDUE for tasks whose deadline has passed.
   *
   * Deduplication is guaranteed at the database level via unique `eventKey`.
   */
  async checkAndSendReminders(referenceDate?: Date): Promise<{
    scanned: number;
    deadlineSoonSent: number;
    overdueSent: number;
  }> {
    const now = referenceDate || new Date();
    const nowTime = now.getTime();
    const twentyFourHoursLater = nowTime + 24 * 60 * 60 * 1000;

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

      const dueTime = task.dueDate.getTime();
      const dueDateStr = task.dueDate.toISOString().slice(0, 10);

      // Overdue check
      if (dueTime < nowTime) {
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
      // Soon check (within 24 hours in future)
      else if (dueTime >= nowTime && dueTime <= twentyFourHoursLater) {
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
