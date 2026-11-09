import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadlineReminderService } from './services/deadline-reminder.service.js';

describe('DeadlineReminderService', () => {
  let service: DeadlineReminderService;
  let mockPrisma: any;
  let mockEventService: any;

  beforeEach(() => {
    mockPrisma = {
      task: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };
    mockEventService = {
      publish: vi.fn().mockResolvedValue(undefined),
    };

    service = new DeadlineReminderService(mockPrisma, mockEventService);
  });

  it('should publish TASK_OVERDUE for non-completed tasks whose dueDate has passed', async () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const pastDate = new Date('2026-11-07T12:00:00Z');

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: 1,
        title: 'Overdue Task',
        dueDate: pastDate,
        userId: 10,
        assigneeId: 20,
        teamId: 1,
      },
    ]);

    const result = await service.checkAndSendReminders(now);

    expect(result.scanned).toBe(1);
    expect(result.overdueSent).toBe(1);
    expect(result.deadlineSoonSent).toBe(0);
    expect(mockEventService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TASK_OVERDUE',
        taskId: 1,
        dueDate: '2026-11-07',
        creatorId: 10,
        assigneeId: 20,
      }),
    );
  });

  it('should publish TASK_DEADLINE_SOON for tasks due within the next 24 hours', async () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const soonDate = new Date('2026-11-08T18:00:00Z'); // 6 hours later

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: 2,
        title: 'Soon Task',
        dueDate: soonDate,
        userId: 10,
        assigneeId: null,
        teamId: null,
      },
    ]);

    const result = await service.checkAndSendReminders(now);

    expect(result.scanned).toBe(1);
    expect(result.deadlineSoonSent).toBe(1);
    expect(result.overdueSent).toBe(0);
    expect(mockEventService.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TASK_DEADLINE_SOON',
        taskId: 2,
        dueDate: '2026-11-08',
        creatorId: 10,
      }),
    );
  });

  it('should not publish reminders for tasks due more than 24 hours in the future', async () => {
    const now = new Date('2026-11-08T12:00:00Z');
    const farDate = new Date('2026-11-15T12:00:00Z'); // 7 days later

    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: 3,
        title: 'Far Task',
        dueDate: farDate,
        userId: 10,
        assigneeId: 20,
        teamId: 1,
      },
    ]);

    const result = await service.checkAndSendReminders(now);

    expect(result.scanned).toBe(1);
    expect(result.deadlineSoonSent).toBe(0);
    expect(result.overdueSent).toBe(0);
    expect(mockEventService.publish).not.toHaveBeenCalled();
  });

  describe('Multi-Instance Atomic Cooldown Claim', () => {
    it('returns skipped=true when atomic claim returns 0 rows (another instance already claimed or cooldown active)', async () => {
      // Simulate atomic query returning empty array (lock not acquired)
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.checkAndSendReminders();

      expect(result.skipped).toBe(true);
      expect(result.scanned).toBe(0);
      expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
    });

    it('proceeds with scan when atomic claim returns 1 row (lock acquired)', async () => {
      // Simulate atomic claim successful
      mockPrisma.$queryRaw.mockResolvedValue([{ key: 'DEADLINE_REMINDER_LAST_RUN' }]);
      mockPrisma.task.findMany.mockResolvedValue([]);

      const result = await service.checkAndSendReminders();

      expect(result.skipped).toBeUndefined();
      expect(result.scanned).toBe(0);
      expect(mockPrisma.task.findMany).toHaveBeenCalled();
    });

    it('re-throws error when database access fails during atomic claim instead of silently ignoring it', async () => {
      // Simulate database connection failure
      const dbError = new Error('PostgreSQL connection timeout');
      mockPrisma.$queryRaw.mockRejectedValue(dbError);

      await expect(service.checkAndSendReminders()).rejects.toThrow(
        'PostgreSQL connection timeout',
      );

      // Verify tasks were NOT scanned without a valid lock
      expect(mockPrisma.task.findMany).not.toHaveBeenCalled();
    });
  });
});
