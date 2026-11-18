import { describe, it, expect, vi } from 'vitest';
import { TaskStatus, type Prisma } from '@prisma/client';
import { TaskQueryService } from './task-query.service.js';
import type { PrismaService } from '../../../database/prisma.service.js';
import type { TaskPolicyService } from '../policies/task-policy.service.js';

describe('TaskQueryService status=INCOMPLETE filter', () => {
  const createService = () => {
    const prismaMock = {
      task: { findMany: vi.fn().mockResolvedValue([]) },
      team: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(true),
    } as unknown as TaskPolicyService;
    return new TaskQueryService(prismaMock, policyMock);
  };

  it('maps status=INCOMPLETE to { status: { not: TaskStatus.DONE } }', () => {
    const service = createService();
    const andClauses: Prisma.TaskWhereInput[] = [];
    service.applyAttributeFilters(andClauses, {
      status: 'INCOMPLETE',
    });

    expect(andClauses).toContainEqual({ status: { not: TaskStatus.DONE } });
  });

  it('preserves exact status matching for TODO, IN_PROGRESS, and DONE', () => {
    const service = createService();
    for (const status of [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE]) {
      const andClauses: Prisma.TaskWhereInput[] = [];
      service.applyAttributeFilters(andClauses, { status });
      expect(andClauses).toContainEqual({ status });
    }
  });

  it('findTrash ignores status filters (e.g. INCOMPLETE) while retaining trash-applicable filters like priority', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prismaMock = {
      task: { findMany },
      team: { findUnique: vi.fn() },
    } as unknown as PrismaService;
    const policyMock = {
      isTeamMember: vi.fn().mockReturnValue(true),
    } as unknown as TaskPolicyService;
    const service = new TaskQueryService(prismaMock, policyMock);

    await service.findTrash({ status: 'INCOMPLETE', priority: 'HIGH' }, 7);

    expect(findMany).toHaveBeenCalledTimes(1);
    const callArg = findMany.mock.calls[0][0] as {
      where?: { AND?: Array<Record<string, unknown>> };
    };
    const andClauses = callArg.where?.AND ?? [];
    expect(andClauses).toContainEqual({ priority: 'HIGH' });
    expect(andClauses.some((clause) => 'status' in clause)).toBe(false);
  });
});
