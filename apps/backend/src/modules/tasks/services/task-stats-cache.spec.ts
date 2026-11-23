import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TaskStatsService } from './task-stats.service.js';

describe('TaskStatsService (Redis Cache)', () => {
  it('returns cached stats on cache hit without querying PostgreSQL', async () => {
    const cachedStats = {
      total: 10,
      todo: 3,
      inProgress: 4,
      done: 3,
      overdue: 1,
      today: 2,
      dueSoon: 4,
      completionRate: 30,
      byPriority: { low: 2, medium: 5, high: 3 },
      upcomingDeadlines: [],
    };
    const prismaMock = {
      $queryRaw: vi.fn(),
      team: { findUnique: vi.fn() },
    };
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(true),
    };
    const redisMock = {
      getStatsVersion: vi.fn().mockResolvedValue('2'),
      getJson: vi.fn().mockResolvedValue(cachedStats),
      setJson: vi.fn(),
    };

    const service = new TaskStatsService(
      prismaMock as never,
      policyMock as never,
      redisMock as never,
    );

    const result = await service.getStats(5, { scope: 'my_work' });

    expect(result).toEqual(cachedStats);
    expect(redisMock.getJson).toHaveBeenCalledWith('taskflow:stats:v2:u:5:t:all:s:my_work');
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(redisMock.setJson).not.toHaveBeenCalled();
  });

  it('queries PostgreSQL on cache miss and stores result with 60s TTL', async () => {
    const prismaMock = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([
          {
            total: 2n,
            todo: 1n,
            inProgress: 1n,
            done: 0n,
            overdue: 0n,
            today: 1n,
            dueSoon: 1n,
            priorityLow: 0n,
            priorityMedium: 1n,
            priorityHigh: 1n,
          },
        ])
        .mockResolvedValueOnce([]),
      team: { findUnique: vi.fn() },
    };
    const policyMock = { isTeamMember: vi.fn() };
    const redisMock = {
      getStatsVersion: vi.fn().mockResolvedValue('0'),
      getJson: vi.fn().mockResolvedValue(null),
      setJson: vi.fn().mockResolvedValue(undefined),
    };

    const service = new TaskStatsService(
      prismaMock as never,
      policyMock as never,
      redisMock as never,
    );

    const result = await service.getStats(5);

    expect(result.total).toBe(2);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
    expect(redisMock.setJson).toHaveBeenCalledWith(
      'taskflow:stats:v0:u:5:t:all:s:all',
      result,
      60,
    );
  });

  it('enforces team membership RBAC before reading cached stats', async () => {
    const prismaMock = {
      $queryRaw: vi.fn(),
      team: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(false),
    };
    const redisMock = {
      getStatsVersion: vi.fn(),
      getJson: vi.fn(),
      setJson: vi.fn(),
    };

    const service = new TaskStatsService(
      prismaMock as never,
      policyMock as never,
      redisMock as never,
    );

    await expect(service.getStats(5, { teamId: 99 })).rejects.toThrow(NotFoundException);
    expect(redisMock.getStatsVersion).not.toHaveBeenCalled();
    expect(redisMock.getJson).not.toHaveBeenCalled();
  });
});
