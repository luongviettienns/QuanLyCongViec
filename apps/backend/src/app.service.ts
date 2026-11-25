import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';
import { RedisService } from './modules/redis/redis.service.js';
import { RabbitMqService } from './modules/rabbitmq/rabbitmq.service.js';

@Injectable()
export class AppService {
  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly rabbitMqService?: RabbitMqService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth() {
    if (this.prisma) {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
      } catch {
        throw new ServiceUnavailableException({
          status: 'error',
          app: 'TaskFlow',
          database: 'down',
        });
      }
    }

    return {
      status: 'ok',
      app: 'TaskFlow',
      database: this.prisma ? 'up' : 'unconfigured',
      redis: this.redisService?.isEnabled() ? 'enabled' : 'disabled',
      rabbitmq: this.rabbitMqService?.isEnabled() ? 'enabled' : 'disabled',
    };
  }
}
