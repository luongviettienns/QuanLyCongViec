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

export type PublishConfirmCallback = (err: unknown, ok?: unknown) => void;

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
    callback?: PublishConfirmCallback,
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
  createConfirmChannel(): Promise<AmqpChannelLike>;
  close(): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface RabbitMqLogger {
  log?(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface RabbitMqClientOptions {
  url?: string;
  connectFn?: (url: string) => Promise<AmqpConnectionLike>;
  logger?: RabbitMqLogger;
  publishConfirmTimeoutMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
}

const DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS = 5000;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;

const DEFAULT_LOGGER: RabbitMqLogger = {
  log: (msg) => console.info(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

export class RabbitMqClient {
  private readonly url: string;
  private readonly connectFn: (url: string) => Promise<AmqpConnectionLike>;
  private readonly logger: RabbitMqLogger;
  private readonly publishConfirmTimeoutMs: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;

  private connection: AmqpConnectionLike | null = null;
  private channel: AmqpChannelLike | null = null;
  private connectPromise: Promise<AmqpChannelLike> | null = null;
  private readonly consumers = new Map<string, (payload: unknown) => Promise<void>>();
  private readonly channelConsumerQueues = new Set<string>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closed = false;

  constructor(options?: RabbitMqClientOptions) {
    this.url = (options?.url ?? process.env.RABBITMQ_URL ?? '').trim();
    this.connectFn =
      options?.connectFn ??
      ((url: string) => amqp.connect(url) as unknown as Promise<AmqpConnectionLike>);
    this.logger = options?.logger ?? DEFAULT_LOGGER;
    this.publishConfirmTimeoutMs =
      options?.publishConfirmTimeoutMs ?? DEFAULT_PUBLISH_CONFIRM_TIMEOUT_MS;
    this.reconnectBaseDelayMs =
      options?.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;
    this.reconnectMaxDelayMs =
      options?.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS;
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
      let conn: AmqpConnectionLike | null = null;
      try {
        conn = await this.connectFn(this.url);
        conn.on('error', (err: unknown) => {
          if (!this.closed) {
            this.logger.warn(
              `RabbitMQ connection error (failing open): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
          this.handleDisconnect();
        });
        conn.on('close', () => {
          this.handleDisconnect();
        });

        const ch = await conn.createConfirmChannel();
        ch.on('error', (err: unknown) => {
          if (!this.closed) {
            this.logger.warn(
              `RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          this.channel = null;
          this.channelConsumerQueues.clear();
        });
        ch.on('close', () => {
          this.channel = null;
          this.channelConsumerQueues.clear();
          if (!this.closed) {
            this.scheduleReconnect();
          }
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

        if (this.closed) {
          await ch.close().catch(() => undefined);
          await conn.close().catch(() => undefined);
          throw new Error('RabbitMqClient closed during initialization');
        }

        this.connection = conn;
        this.channel = ch;
        return ch;
      } catch (err) {
        this.resetState();
        if (conn) {
          await conn.close().catch(() => undefined);
        }
        throw err;
      }
    })();

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async publish(routingKey: string, payload: unknown): Promise<boolean> {
    if (!this.isEnabled() || this.closed) {
      return false;
    }

    let ch: AmqpChannelLike;
    try {
      ch = await this.ensureTopology();
    } catch (err) {
      this.logger.warn(
        `RabbitMQ connect failed for publish "${routingKey}" (failing open): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }

    const body = Buffer.from(JSON.stringify(payload), 'utf8');

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.logger.warn(
          `RabbitMQ publisher confirm timed out for "${routingKey}" (failing open)`,
        );
        resolve(false);
      }, this.publishConfirmTimeoutMs);
      timer.unref?.();

      try {
        const accepted = ch.publish(
          TASKFLOW_EXCHANGE,
          routingKey,
          body,
          {
            persistent: true,
            contentType: 'application/json',
          },
          (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (err) {
              this.logger.warn(
                `RabbitMQ broker nacked publish for "${routingKey}" (failing open): ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
              resolve(false);
              return;
            }
            resolve(true);
          },
        );
        if (!accepted) {
          this.logger.warn(
            `RabbitMQ write buffer full for "${routingKey}"; awaiting broker confirm`,
          );
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.logger.warn(
            `RabbitMQ publish failed for "${routingKey}" (failing open): ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          resolve(false);
        }
      }
    });
  }

  async consume(
    queue: string,
    handler: (payload: unknown) => Promise<void>,
  ): Promise<boolean> {
    if (!this.isEnabled() || this.closed) {
      return false;
    }

    this.consumers.set(queue, handler);

    try {
      const ch = await this.ensureTopology();
      await this.attachConsumerOnChannel(ch, queue, handler);
      this.reconnectAttempt = 0;
      return true;
    } catch (err) {
      this.logger.warn(
        `RabbitMQ consume setup failed for "${queue}" (scheduling auto-reconnect): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.scheduleReconnect();
      return false;
    }
  }

  private async attachConsumerOnChannel(
    ch: AmqpChannelLike,
    queue: string,
    handler: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    if (this.channelConsumerQueues.has(queue)) {
      return;
    }
    this.channelConsumerQueues.add(queue);
    try {
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
    } catch (err) {
      this.channelConsumerQueues.delete(queue);
      throw err;
    }
  }

  private handleDisconnect(): void {
    this.resetState();
    if (!this.closed) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (
      this.closed ||
      !this.isEnabled() ||
      this.consumers.size === 0 ||
      this.reconnectTimer !== null
    ) {
      return;
    }

    const delayMs = Math.min(
      this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
      this.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectConsumers();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  private async reconnectConsumers(): Promise<void> {
    if (this.closed || !this.isEnabled() || this.consumers.size === 0) {
      return;
    }

    try {
      const ch = await this.ensureTopology();
      for (const [queue, handler] of this.consumers.entries()) {
        await this.attachConsumerOnChannel(ch, queue, handler);
      }
      this.reconnectAttempt = 0;
      this.logger.log?.(
        `RabbitMQ reconnected and re-registered ${this.consumers.size} consumer(s).`,
      );
    } catch (err) {
      this.logger.warn(
        `RabbitMQ reconnect attempt failed (retrying): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.resetState();
      this.scheduleReconnect();
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.consumers.clear();
    const ch = this.channel;
    const conn = this.connection;
    this.resetState();
    await ch?.close().catch(() => undefined);
    await conn?.close().catch(() => undefined);
  }

  private resetState(): void {
    this.channel = null;
    this.connection = null;
    this.channelConsumerQueues.clear();
  }
}
