import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expiryMode: 'EX', time: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  quit(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface RedisServiceOptions {
  redisUrl?: string;
  client?: RedisLikeClient;
}

const STATS_VERSION_TTL_SEC = 86_400;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisLikeClient | null = null;

  constructor(@Optional() options?: RedisServiceOptions) {
    const rawUrl = (options?.redisUrl ?? process.env.REDIS_URL ?? '').trim();
    if (!rawUrl) {
      return;
    }

    if (options?.client) {
      this.client = options.client;
      return;
    }

    const client = new Redis(rawUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    client.on('error', (err: unknown) => {
      this.logger.warn(
        `Redis client error (failing open): ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.client = client as unknown as RedisLikeClient;
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(
        `Redis getJson failed for "${key}": ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(
        `Redis setJson failed for "${key}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getStatsVersion(userId: number): Promise<string | null> {
    if (!this.client) return null;
    try {
      const version = await this.client.get(`taskflow:stats:ver:u:${userId}`);
      return version ?? '0';
    } catch (err) {
      this.logger.warn(
        `Redis getStatsVersion failed for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async invalidateTaskStatsForUsers(userIds: number[]): Promise<void> {
    if (!this.client || userIds.length === 0) return;

    const uniqueValidIds = Array.from(
      new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)),
    );
    if (uniqueValidIds.length === 0) return;

    await Promise.all(
      uniqueValidIds.map(async (uid) => {
        const versionKey = `taskflow:stats:ver:u:${uid}`;
        try {
          await this.client!.incr(versionKey);
          await this.client!.expire(versionKey, STATS_VERSION_TTL_SEC);
        } catch (err) {
          this.logger.warn(
            `Redis invalidateTaskStats failed for user ${uid}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await this.client.quit().catch(() => undefined);
  }
}
