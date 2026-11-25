import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import {
  RabbitMqClient,
  type RabbitMqClientOptions,
} from '@taskflow/shared/rabbitmq';

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private readonly client: RabbitMqClient;

  constructor(@Optional() options?: RabbitMqClientOptions) {
    this.client = new RabbitMqClient({
      ...options,
      logger: options?.logger ?? {
        log: (msg) => this.logger.log(msg),
        warn: (msg) => this.logger.warn(msg),
        error: (msg) => this.logger.error(msg),
      },
    });
  }

  isEnabled(): boolean {
    return this.client.isEnabled();
  }

  publish(routingKey: string, payload: unknown): Promise<boolean> {
    return this.client.publish(routingKey, payload);
  }

  consume(queue: string, handler: (payload: unknown) => Promise<void>): Promise<boolean> {
    return this.client.consume(queue, handler);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
