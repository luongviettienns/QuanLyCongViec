import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  WORKER_ACTIVITY_CLEANUP_LOCK_KEY,
  WORKER_DEADLINE_REMINDER_LOCK_KEY,
  WorkerJobsService,
} from '../worker-jobs.service.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../backend/.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../../apps/backend/.env'),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, 'utf8');
    const match = raw.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

describe('WorkerJobsService Multi-Instance Concurrency (Real PostgreSQL)', () => {
  const databaseUrl = resolveDatabaseUrl();
  const runId = `test_worker_lock_${randomUUID()}_`;
  const lockKeys = [
    `${runId}${WORKER_DEADLINE_REMINDER_LOCK_KEY}`,
    `${runId}${WORKER_ACTIVITY_CLEANUP_LOCK_KEY}`,
  ];

  let prisma1: PrismaClient | null = null;
  let prisma2: PrismaClient | null = null;
  let dbReachable = false;

  beforeAll(async () => {
    if (!databaseUrl) return;
    prisma1 = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    prisma2 = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      await prisma1.$queryRaw`SELECT 1`;
      await prisma2.$queryRaw`SELECT 1`;
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  afterAll(async () => {
    if (prisma1 && dbReachable) {
      await prisma1.systemSetting.deleteMany({
        where: { key: { in: lockKeys } },
      });
    }
    await prisma1?.$disconnect().catch(() => undefined);
    await prisma2?.$disconnect().catch(() => undefined);
  });

  it('guarantees only 1 of 2 concurrent worker instances publishes deadline reminder or runs cleanup', async () => {
    expect(dbReachable).toBe(true);
    if (!prisma1 || !prisma2) {
      throw new Error('Prisma clients were not initialized');
    }

    const publishSpy1 = vi.fn().mockResolvedValue(true);
    const publishSpy2 = vi.fn().mockResolvedValue(true);

    const worker1 = new WorkerJobsService({
      prisma: prisma1,
      lockKeyPrefix: runId,
      cronLockCooldownMs: 60_000,
      rabbitMq: {
        isEnabled: () => true,
        publish: publishSpy1,
        close: async () => undefined,
      },
    });

    const worker2 = new WorkerJobsService({
      prisma: prisma2,
      lockKeyPrefix: runId,
      cronLockCooldownMs: 60_000,
      rabbitMq: {
        isEnabled: () => true,
        publish: publishSpy2,
        close: async () => undefined,
      },
    });

    // Fire both worker instances at the exact same instant
    const reminderResults = await Promise.all([
      worker1.triggerDeadlineReminders(),
      worker2.triggerDeadlineReminders(),
    ]);

    const queuedCount = reminderResults.filter((r) => r.queued === true).length;
    const skippedCount = reminderResults.filter((r) => r.skipped === true).length;
    expect(queuedCount).toBe(1);
    expect(skippedCount).toBe(1);
    expect(publishSpy1.mock.calls.length + publishSpy2.mock.calls.length).toBe(1);

    // Fire cleanup simultaneously across both workers with a retention far in the future?
    // No! Use retentionMonths = 1200 (100 years) so real DB rows are never deleted,
    // while verifying the PostgreSQL SystemSetting lock elects strictly 1 winner.
    const acquireSpy1 = vi.spyOn(worker1, 'acquireCronLock');
    const acquireSpy2 = vi.spyOn(worker2, 'acquireCronLock');
    await Promise.all([
      worker1.cleanupOldActivityLogs(1200),
      worker2.cleanupOldActivityLogs(1200),
    ]);

    const lockResults = await Promise.all([
      acquireSpy1.mock.results[0]?.value,
      acquireSpy2.mock.results[0]?.value,
    ]);
    expect(lockResults.filter((v) => v === true)).toHaveLength(1);
    expect(lockResults.filter((v) => v === false)).toHaveLength(1);
  });
});
