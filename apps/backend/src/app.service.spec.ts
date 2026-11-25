import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppService } from './app.service.js';

describe('AppService', () => {
  it('returns ok with database up and optional service states when DB query succeeds', async () => {
    const prismaMock = {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    const redisMock = { isEnabled: vi.fn().mockReturnValue(true) };
    const rabbitMock = { isEnabled: vi.fn().mockReturnValue(false) };

    const service = new AppService(
      prismaMock as never,
      redisMock as never,
      rabbitMock as never,
    );

    await expect(service.getHealth()).resolves.toEqual({
      status: 'ok',
      app: 'TaskFlow',
      database: 'up',
      redis: 'enabled',
      rabbitmq: 'disabled',
    });
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('throws ServiceUnavailableException when database check fails', async () => {
    const prismaMock = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('DB connection refused')),
    };

    const service = new AppService(prismaMock as never);

    await expect(service.getHealth()).rejects.toThrow(ServiceUnavailableException);
  });
});
