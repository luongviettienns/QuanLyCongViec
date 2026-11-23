import { describe, expect, it, vi } from 'vitest';
import { RedisService, type RedisLikeClient } from '../redis.service.js';

function createMockClient() {
  return {
    get: vi.fn<RedisLikeClient['get']>(),
    set: vi.fn<RedisLikeClient['set']>().mockResolvedValue('OK'),
    incr: vi.fn<RedisLikeClient['incr']>().mockResolvedValue(1),
    expire: vi.fn<RedisLikeClient['expire']>().mockResolvedValue(1),
    quit: vi.fn<RedisLikeClient['quit']>().mockResolvedValue('OK'),
    on: vi.fn<RedisLikeClient['on']>(),
  };
}

describe('RedisService', () => {
  it('operates as a safe no-op when REDIS_URL is not configured', async () => {
    const service = new RedisService({ redisUrl: '' });

    expect(service.isEnabled()).toBe(false);
    await expect(service.getJson('any-key')).resolves.toBeNull();
    await expect(service.getStatsVersion(1)).resolves.toBeNull();
    await expect(service.setJson('any-key', { ok: true }, 60)).resolves.toBeUndefined();
    await expect(service.invalidateTaskStatsForUsers([1, 2])).resolves.toBeUndefined();
  });

  it('reads/writes JSON and fails open on Redis errors or malformed JSON', async () => {
    const mockClient = createMockClient();
    const service = new RedisService({
      redisUrl: 'redis://localhost:6379',
      client: mockClient,
    });

    expect(service.isEnabled()).toBe(true);

    await service.setJson('k1', { total: 5 }, 60);
    expect(mockClient.set).toHaveBeenCalledWith('k1', JSON.stringify({ total: 5 }), 'EX', 60);

    mockClient.get.mockResolvedValueOnce(JSON.stringify({ total: 5 }));
    await expect(service.getJson<{ total: number }>('k1')).resolves.toEqual({ total: 5 });

    mockClient.get.mockResolvedValueOnce('{broken-json');
    await expect(service.getJson('k1')).resolves.toBeNull();

    mockClient.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.getJson('k1')).resolves.toBeNull();
  });

  it('reads stats version and deduplicates userIds on invalidation', async () => {
    const mockClient = createMockClient();
    const service = new RedisService({
      redisUrl: 'redis://localhost:6379',
      client: mockClient,
    });

    mockClient.get.mockResolvedValueOnce(null);
    await expect(service.getStatsVersion(7)).resolves.toBe('0');

    mockClient.get.mockResolvedValueOnce('4');
    await expect(service.getStatsVersion(7)).resolves.toBe('4');

    await service.invalidateTaskStatsForUsers([7, 8, 7, 0, -1]);
    expect(mockClient.incr).toHaveBeenCalledTimes(2);
    expect(mockClient.incr).toHaveBeenCalledWith('taskflow:stats:ver:u:7');
    expect(mockClient.incr).toHaveBeenCalledWith('taskflow:stats:ver:u:8');
    expect(mockClient.expire).toHaveBeenCalledWith('taskflow:stats:ver:u:7', 86400);
    expect(mockClient.expire).toHaveBeenCalledWith('taskflow:stats:ver:u:8', 86400);
  });
});
