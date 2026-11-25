import { describe, expect, it, vi } from 'vitest';
import { ROUTING_KEY_DEADLINE_REMINDER } from '@taskflow/shared/rabbitmq';
import { WorkerJobsService } from '../worker-jobs.service.js';

describe('WorkerJobsService', () => {
  it('triggers backend deadline reminder endpoint with x-internal-api-key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ scanned: 4, deadlineSoonSent: 2, overdueSent: 1 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const prismaMock = {
      teamActivityLog: { deleteMany: vi.fn() },
      $disconnect: vi.fn(),
    };

    const service = new WorkerJobsService({
      prisma: prismaMock as never,
      fetchFn: fetchMock,
      backendUrl: 'http://backend:3000/',
      internalApiKey: 'secret-internal-key',
    });

    const result = await service.triggerDeadlineReminders();

    expect(result).toEqual({
      ok: true,
      scanned: 4,
      deadlineSoonSent: 2,
      overdueSent: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://backend:3000/api/notifications/reminders/trigger',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-internal-api-key': 'secret-internal-key' },
      }),
    );
  });

  it('fails safely without throwing when INTERNAL_API_KEY is missing or backend returns error', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const prismaMock = {
      teamActivityLog: { deleteMany: vi.fn() },
      $disconnect: vi.fn(),
    };

    const noKeyService = new WorkerJobsService({
      prisma: prismaMock as never,
      fetchFn: fetchMock,
      backendUrl: 'http://backend:3000',
      internalApiKey: '',
    });

    await expect(noKeyService.triggerDeadlineReminders()).resolves.toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));
    const errService = new WorkerJobsService({
      prisma: prismaMock as never,
      fetchFn: fetchMock,
      backendUrl: 'http://backend:3000',
      internalApiKey: 'wrong-key',
    });

    await expect(errService.triggerDeadlineReminders()).resolves.toEqual({ ok: false });
  });

  it('deletes team activity logs older than retentionMonths via Prisma', async () => {
    const deleteManyMock = vi.fn().mockResolvedValueOnce({ count: 12 });
    const prismaMock = {
      teamActivityLog: { deleteMany: deleteManyMock },
      $disconnect: vi.fn(),
    };

    const service = new WorkerJobsService({
      prisma: prismaMock as never,
      fetchFn: vi.fn<typeof fetch>(),
      backendUrl: 'http://backend:3000',
      internalApiKey: 'k',
    });

    const deletedCount = await service.cleanupOldActivityLogs(12);

    expect(deletedCount).toBe(12);
    expect(deleteManyMock).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: expect.any(Date),
        },
      },
    });
  });

  it('publishes deadline reminder job to RabbitMQ when enabled and falls back to HTTP on publish failure', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ scanned: 1, deadlineSoonSent: 1, overdueSent: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const prismaMock = {
      teamActivityLog: { deleteMany: vi.fn() },
      $disconnect: vi.fn(),
    };
    const rabbitMock = {
      isEnabled: vi.fn().mockReturnValue(true),
      publish: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const service = new WorkerJobsService({
      prisma: prismaMock as never,
      fetchFn: fetchMock,
      backendUrl: 'http://backend:3000',
      internalApiKey: 'secret-key',
      rabbitMq: rabbitMock,
    });

    await expect(service.triggerDeadlineReminders()).resolves.toEqual({
      ok: true,
      queued: true,
    });
    expect(rabbitMock.publish).toHaveBeenCalledWith(
      ROUTING_KEY_DEADLINE_REMINDER,
      expect.objectContaining({
        type: 'DEADLINE_REMINDER_SCAN',
        triggeredAt: expect.any(String),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(service.triggerDeadlineReminders()).resolves.toEqual({
      ok: true,
      scanned: 1,
      deadlineSoonSent: 1,
      overdueSent: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.onModuleDestroy();
    expect(rabbitMock.close).toHaveBeenCalledTimes(1);
  });
});
