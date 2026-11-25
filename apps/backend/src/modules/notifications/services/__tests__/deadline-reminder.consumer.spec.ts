import { describe, expect, it, vi } from 'vitest';
import { TASKFLOW_JOBS_QUEUE } from '@taskflow/shared/rabbitmq';
import { DeadlineReminderConsumer } from '../deadline-reminder.consumer.js';

describe('DeadlineReminderConsumer', () => {
  it('does not subscribe when RabbitMQ is disabled', async () => {
    const reminderService = { checkAndSendReminders: vi.fn() };
    const rabbitMock = {
      isEnabled: vi.fn().mockReturnValue(false),
      consume: vi.fn(),
    };

    const consumer = new DeadlineReminderConsumer(
      reminderService as never,
      rabbitMock as never,
    );
    await consumer.onModuleInit();

    expect(rabbitMock.consume).not.toHaveBeenCalled();
  });

  it('subscribes and processes DEADLINE_REMINDER_SCAN jobs', async () => {
    const reminderService = {
      checkAndSendReminders: vi.fn().mockResolvedValue({
        scanned: 3,
        deadlineSoonSent: 1,
        overdueSent: 1,
      }),
    };
    const rabbitMock = {
      isEnabled: vi.fn().mockReturnValue(true),
      consume: vi.fn().mockResolvedValue(true),
    };

    const consumer = new DeadlineReminderConsumer(
      reminderService as never,
      rabbitMock as never,
    );
    await consumer.onModuleInit();

    expect(rabbitMock.consume).toHaveBeenCalledWith(
      TASKFLOW_JOBS_QUEUE,
      expect.any(Function),
    );

    await consumer.handleMessage({
      type: 'DEADLINE_REMINDER_SCAN',
      triggeredAt: '2026-11-25T01:00:00.000Z',
    });
    expect(reminderService.checkAndSendReminders).toHaveBeenCalledTimes(1);

    await expect(consumer.handleMessage({ type: 'UNKNOWN_JOB' })).rejects.toThrow(
      /Unsupported job payload/,
    );
  });
});
