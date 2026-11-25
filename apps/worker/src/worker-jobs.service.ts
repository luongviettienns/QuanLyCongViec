import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import {
  ROUTING_KEY_DEADLINE_REMINDER,
  RabbitMqClient,
  type DeadlineReminderJobPayload,
} from '@taskflow/shared/rabbitmq';

export interface WorkerJobsOptions {
  prisma?: Pick<PrismaClient, 'teamActivityLog' | '$disconnect'>;
  fetchFn?: typeof fetch;
  backendUrl?: string;
  internalApiKey?: string;
  rabbitMq?: Pick<RabbitMqClient, 'isEnabled' | 'publish' | 'close'>;
}

@Injectable()
export class WorkerJobsService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerJobsService.name);
  private readonly prisma: Pick<PrismaClient, 'teamActivityLog' | '$disconnect'>;
  private readonly fetchFn: typeof fetch;
  private readonly backendUrl: string;
  private readonly internalApiKey: string;
  private readonly rabbitMq: Pick<RabbitMqClient, 'isEnabled' | 'publish' | 'close'>;
  private readonly ownsPrisma: boolean;

  constructor(@Optional() options?: WorkerJobsOptions) {
    this.ownsPrisma = !options?.prisma;
    this.prisma = options?.prisma ?? new PrismaClient();
    this.fetchFn = options?.fetchFn ?? fetch;
    this.backendUrl = (
      options?.backendUrl ??
      process.env.BACKEND_INTERNAL_URL ??
      'http://127.0.0.1:3000'
    )
      .trim()
      .replace(/\/+$/, '');
    this.internalApiKey = (options?.internalApiKey ?? process.env.INTERNAL_API_KEY ?? '').trim();
    this.rabbitMq = options?.rabbitMq ?? new RabbitMqClient({
      logger: {
        warn: (msg) => this.logger.warn(msg),
        error: (msg) => this.logger.error(msg),
      },
    });
  }

  /**
   * Triggers deadline reminders via RabbitMQ (with HTTP internal API fallback).
   * Scheduled daily at 08:00 AM Asia/Ho_Chi_Minh.
   */
  @Cron('0 8 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async triggerDeadlineReminders(): Promise<{
    ok: boolean;
    queued?: boolean;
    scanned?: number;
    deadlineSoonSent?: number;
    overdueSent?: number;
  }> {
    if (this.rabbitMq.isEnabled()) {
      const payload: DeadlineReminderJobPayload = {
        type: 'DEADLINE_REMINDER_SCAN',
        triggeredAt: new Date().toISOString(),
      };
      const published = await this.rabbitMq.publish(ROUTING_KEY_DEADLINE_REMINDER, payload);
      if (published) {
        this.logger.log('Deadline reminder job published to RabbitMQ.');
        return { ok: true, queued: true };
      }
      this.logger.warn('RabbitMQ publish failed; falling back to HTTP internal trigger.');
    }

    if (!this.internalApiKey) {
      this.logger.error('INTERNAL_API_KEY is missing; skipping deadline reminder trigger.');
      return { ok: false };
    }

    try {
      const response = await this.fetchFn(
        `${this.backendUrl}/api/notifications/reminders/trigger`,
        {
          method: 'POST',
          headers: {
            'x-internal-api-key': this.internalApiKey,
          },
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (!response.ok) {
        this.logger.error(`Deadline reminder trigger failed with HTTP ${response.status}`);
        return { ok: false };
      }

      const body = (await response.json()) as {
        scanned?: number;
        deadlineSoonSent?: number;
        overdueSent?: number;
      };
      this.logger.log(
        `Deadline reminder completed via worker. Scanned: ${body.scanned ?? 0}, Soon: ${
          body.deadlineSoonSent ?? 0
        }, Overdue: ${body.overdueSent ?? 0}`,
      );
      return { ok: true, ...body };
    } catch (error) {
      this.logger.error(
        `Deadline reminder trigger error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { ok: false };
    }
  }

  /**
   * Cleans up team activity logs older than retention period (default 12 months).
   * Scheduled nightly at 03:00 AM Asia/Ho_Chi_Minh.
   */
  @Cron('0 3 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async cleanupOldActivityLogs(retentionMonths: number = 12): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

    try {
      const result = await this.prisma.teamActivityLog.deleteMany({
        where: { createdAt: { lt: cutoffDate } },
      });
      if (result.count > 0) {
        this.logger.log(
          `[Scheduled Cleanup] Removed ${result.count} activity logs older than ${retentionMonths} months.`,
        );
      }
      return result.count;
    } catch (error) {
      this.logger.error(
        `[Scheduled Cleanup] Error cleaning old activity logs: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.rabbitMq.close();
    if (this.ownsPrisma) {
      await this.prisma.$disconnect().catch(() => undefined);
    }
  }
}
