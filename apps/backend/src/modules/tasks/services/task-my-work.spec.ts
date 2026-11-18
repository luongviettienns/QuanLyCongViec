import { describe, it, expect, vi } from 'vitest';
import { TaskQueryService } from './task-query.service.js';
import { TaskStatsService } from './task-stats.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import type { TaskPolicyService } from '../policies/task-policy.service.js';

describe('My Tasks Backend: scope=my_work & today stat', () => {
  it('TaskQueryService.findAll(scope=my_work) includes unassigned personal tasks { teamId: null, userId }', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prismaMock = {
      task: { findMany },
      team: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(true),
    } as unknown as TaskPolicyService;

    const service = new TaskQueryService(prismaMock, policyMock);
    await service.findAll({ scope: 'my_work' }, 42);

    expect(findMany).toHaveBeenCalledTimes(1);
    const callArg = findMany.mock.calls[0][0] as {
      where?: { AND?: Array<{ OR?: Array<Record<string, unknown>> }> };
    };
    const andClauses = callArg.where?.AND ?? [];
    const scopeClause = andClauses.find(
      (clause) =>
        Array.isArray(clause.OR) &&
        clause.OR.some(
          (branch) => Object.keys(branch).length === 1 && branch.assigneeId === 42,
        ),
    );

    expect(scopeClause).toBeDefined();
    expect(scopeClause?.OR).toEqual(
      expect.arrayContaining([
        { teamId: null, userId: 42 },
        { assigneeId: 42 },
      ]),
    );
  });

  it('TaskStatsService.getStats(scope=my_work) returns today count alongside overdue and dueSoon', async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        {
          total: 5n,
          todo: 2n,
          inProgress: 2n,
          done: 1n,
          overdue: 1n,
          today: 2n,
          dueSoon: 3n,
          priorityLow: 1n,
          priorityMedium: 2n,
          priorityHigh: 2n,
        },
      ])
      .mockResolvedValueOnce([]);

    const prismaMock = {
      $queryRaw: queryRaw,
      team: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(true),
    } as unknown as TaskPolicyService;

    const service = new TaskStatsService(prismaMock, policyMock);
    const stats = await service.getStats(42, { scope: 'my_work' });

    expect(stats.total).toBe(5);
    expect(stats.overdue).toBe(1);
    expect(stats.today).toBe(2);
    expect(stats.dueSoon).toBe(3);
  });
});
