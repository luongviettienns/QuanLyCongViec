import { Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import {
  TASKFLOW_JOBS_QUEUE,
  type DeadlineReminderJobPayload,
} from '@taskflow/shared/rabbitmq';
import { RabbitMqService } from '../../rabbitmq/rabbitmq.service.js';
import { DeadlineReminderService } from './deadline-reminder.service.js';

function isDeadlineReminderJob(payload: unknown): payload is DeadlineReminderJobPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as { type?: unknown }).type === 'DEADLINE_REMINDER_SCAN'
  );
}

@Injectable()
export class DeadlineReminderConsumer implements OnModuleInit {
  private readonly logger = new Logger(DeadlineReminderConsumer.name);

  constructor(
    private readonly deadlineReminderService: DeadlineReminderService,
    @Optional() private readonly rabbitMqService?: RabbitMqService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.rabbitMqService?.isEnabled()) {
      return;
    }

    const subscribed = await this.rabbitMqService.consume(
      TASKFLOW_JOBS_QUEUE,
      (payload) => this.handleMessage(payload),
    );
    if (subscribed) {
      this.logger.log(`Subscribed to RabbitMQ queue "${TASKFLOW_JOBS_QUEUE}"`);
    }
  }

  async handleMessage(payload: unknown): Promise<void> {
    if (!isDeadlineReminderJob(payload)) {
      throw new Error(`Unsupported job payload on "${TASKFLOW_JOBS_QUEUE}"`);
    }

    const result = await this.deadlineReminderService.checkAndSendReminders();
    this.logger.log(
      `Processed RabbitMQ deadline reminder job: scanned=${result.scanned}, soon=${result.deadlineSoonSent}, overdue=${result.overdueSent}`,
    );
  }
}
