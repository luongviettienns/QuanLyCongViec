import amqp from 'amqplib';

export const TASKFLOW_EXCHANGE = 'taskflow.events';
export const TASKFLOW_DLX_EXCHANGE = 'taskflow.events.dlx';
export const TASKFLOW_JOBS_QUEUE = 'taskflow.jobs';
export const TASKFLOW_JOBS_DLQ = 'taskflow.jobs.dlq';
export const ROUTING_KEY_DEADLINE_REMINDER = 'notifications.deadline_reminder';

export interface DeadlineReminderJobPayload {
  type: 'DEADLINE_REMINDER_SCAN';
  triggeredAt: string;
}

export interface AmqpMessageLike {
  content: Buffer;
}

export interface AmqpChannelLike {
  assertExchange(exchange: string, type: string, options?: Record<string, unknown>): Promise<unknown>;
  assertQueue(queue: string, options?: Record<string, unknown>): Promise<unknown>;
  bindQueue(queue: string, source: string, pattern: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Record<string, unknown>,
  ): boolean;
  consume(
    queue: string,
    onMessage: (msg: AmqpMessageLike | null) => void | Promise<void>,
  ): Promise<unknown>;
  ack(message: AmqpMessageLike): void;
  nack(message: AmqpMessageLike, allUpTo?: boolean, requeue?: boolean): void;
  close(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface AmqpConnectionLike {
  createChannel(): Promise<AmqpChannelLike>;
  close(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface RabbitMqLogger {
  warn(message: string): void;
  error(message: string): void;
}

export interface RabbitMqClientOptions {
  url?: string;
  connectFn?: (url: string) => Promise<AmqpConnectionLike>;
  logger?: RabbitMqLogger;
}

const DEFAULT_LOGGER: RabbitMqLogger = {
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

export class RabbitMqClient {
  private readonly url: string;
  private readonly connectFn: (url: string) => Promise<AmqpConnectionLike>;
  private readonly logger: RabbitMqLogger;
  private connection: AmqpConnectionLike | null = null;
  private channel: AmqpChannelLike | null = null;
  private connectPromise: Promise<AmqpChannelLike> | null = null;
  private closed = false;

  constructor(options?: RabbitMqClientOptions) {
    this.url = (options?.url ?? process.env.RABBITMQ_URL ?? '').trim();
    this.connectFn =
      options?.connectFn ??
      ((url: string) => amqp.connect(url) as unknown as Promise<AmqpConnectionLike>);
    this.logger = options?.logger ?? DEFAULT_LOGGER;
  }

  isEnabled(): boolean {
    return this.url.length > 0;
  }

  async ensureTopology(): Promise<AmqpChannelLike> {
    if (this.channel) {
      return this.channel;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      const conn = await this.connectFn(this.url);
      conn.on('error', (err: unknown) => {
        if (!this.closed) {
          this.logger.warn(
            `RabbitMQ connection error (failing open): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        this.resetState();
      });
      conn.on('close', () => {
        this.resetState();
      });

      const ch = await conn.createChannel();
      ch.on('error', (err: unknown) => {
        if (!this.closed) {
          this.logger.warn(
            `RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        this.channel = null;
      });
      ch.on('close', () => {
        this.channel = null;
      });

      await ch.assertExchange(TASKFLOW_DLX_EXCHANGE, 'direct', { durable: true });
      await ch.assertQueue(TASKFLOW_JOBS_DLQ, { durable: true });
      await ch.bindQueue(TASKFLOW_JOBS_DLQ, TASKFLOW_DLX_EXCHANGE, TASKFLOW_JOBS_QUEUE);

      await ch.assertExchange(TASKFLOW_EXCHANGE, 'topic', { durable: true });
      await ch.assertQueue(TASKFLOW_JOBS_QUEUE, {
        durable: true,
        deadLetterExchange: TASKFLOW_DLX_EXCHANGE,
        deadLetterRoutingKey: TASKFLOW_JOBS_QUEUE,
      });
      await ch.bindQueue(TASKFLOW_JOBS_QUEUE, TASKFLOW_EXCHANGE, ROUTING_KEY_DEADLINE_REMINDER);

      this.connection = conn;
      this.channel = ch;
      return ch;
    })();

    try {
      return await this.connectPromise;
    } catch (err) {
      this.resetState();
      throw err;
    } finally {
      this.connectPromise = null;
    }
  }

  async publish(routingKey: string, payload: unknown): Promise<boolean> {
    if (!this.isEnabled() || this.closed) {
      return false;
    }
    try {
      const ch = await this.ensureTopology();
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      return ch.publish(TASKFLOW_EXCHANGE, routingKey, body, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (err) {
      this.logger.warn(
        `RabbitMQ publish failed for "${routingKey}" (failing open): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async consume(
    queue: string,
    handler: (payload: unknown) => Promise<void>,
  ): Promise<boolean> {
    if (!this.isEnabled() || this.closed) {
      return false;
    }
    try {
      const ch = await this.ensureTopology();
      await ch.prefetch(1);
      await ch.consume(queue, async (msg) => {
        if (!msg) return;
        try {
          const parsed = JSON.parse(msg.content.toString('utf8')) as unknown;
          await handler(parsed);
          ch.ack(msg);
        } catch (err) {
          this.logger.error(
            `RabbitMQ consumer failed for "${queue}" (routing to DLQ): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          ch.nack(msg, false, false);
        }
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `RabbitMQ consume setup failed for "${queue}" (failing open): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    const ch = this.channel;
    const conn = this.connection;
    this.resetState();
    await ch?.close().catch(() => undefined);
    await conn?.close().catch(() => undefined);
  }

  private resetState(): void {
    this.channel = null;
    this.connection = null;
  }
}
