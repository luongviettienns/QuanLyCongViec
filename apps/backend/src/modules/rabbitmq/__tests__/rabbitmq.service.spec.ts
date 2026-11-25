import { describe, expect, it, vi } from 'vitest';
import {
  ROUTING_KEY_DEADLINE_REMINDER,
  TASKFLOW_DLX_EXCHANGE,
  TASKFLOW_EXCHANGE,
  TASKFLOW_JOBS_DLQ,
  TASKFLOW_JOBS_QUEUE,
  type AmqpChannelLike,
  type AmqpConnectionLike,
  type AmqpMessageLike,
  type PublishConfirmCallback,
} from '@taskflow/shared/rabbitmq';
import { RabbitMqService } from '../rabbitmq.service.js';

function createMockAmqp(options?: { publishError?: Error | null; hangPublish?: boolean }) {
  let consumeHandler: ((msg: AmqpMessageLike | null) => void | Promise<void>) | null = null;
  const connListeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const chListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  const channel: AmqpChannelLike = {
    assertExchange: vi.fn<AmqpChannelLike['assertExchange']>().mockResolvedValue({}),
    assertQueue: vi.fn<AmqpChannelLike['assertQueue']>().mockResolvedValue({}),
    bindQueue: vi.fn<AmqpChannelLike['bindQueue']>().mockResolvedValue({}),
    prefetch: vi.fn<AmqpChannelLike['prefetch']>().mockResolvedValue({}),
    publish: vi
      .fn<AmqpChannelLike['publish']>()
      .mockImplementation((_ex, _rk, _buf, _opts, cb?: PublishConfirmCallback) => {
        if (!options?.hangPublish && cb) {
          queueMicrotask(() => cb(options?.publishError ?? null));
        }
        return true;
      }),
    consume: vi.fn<AmqpChannelLike['consume']>().mockImplementation(async (_queue, onMsg) => {
      consumeHandler = onMsg;
      return {};
    }),
    ack: vi.fn<AmqpChannelLike['ack']>(),
    nack: vi.fn<AmqpChannelLike['nack']>(),
    close: vi.fn<AmqpChannelLike['close']>().mockResolvedValue(undefined),
    on: vi.fn<AmqpChannelLike['on']>().mockImplementation((event, listener) => {
      const list = chListeners.get(event) ?? [];
      list.push(listener);
      chListeners.set(event, list);
      return channel;
    }),
  };

  const connection: AmqpConnectionLike = {
    createConfirmChannel: vi
      .fn<AmqpConnectionLike['createConfirmChannel']>()
      .mockResolvedValue(channel),
    close: vi.fn<AmqpConnectionLike['close']>().mockResolvedValue(undefined),
    on: vi.fn<AmqpConnectionLike['on']>().mockImplementation((event, listener) => {
      const list = connListeners.get(event) ?? [];
      list.push(listener);
      connListeners.set(event, list);
      return connection;
    }),
  };

  return {
    channel,
    connection,
    getConsumeHandler: () => consumeHandler,
    emitConnectionEvent: (event: string, ...args: unknown[]) => {
      for (const fn of connListeners.get(event) ?? []) {
        fn(...args);
      }
    },
  };
}

describe('RabbitMqService', () => {
  it('operates as a safe no-op when RABBITMQ_URL is not configured', async () => {
    const service = new RabbitMqService({ url: '' });

    expect(service.isEnabled()).toBe(false);
    await expect(service.publish(ROUTING_KEY_DEADLINE_REMINDER, { ok: true })).resolves.toBe(
      false,
    );
    await expect(service.consume(TASKFLOW_JOBS_QUEUE, async () => undefined)).resolves.toBe(
      false,
    );
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('uses confirm channel, asserts exchange/DLQ topology, and resolves true on broker ACK', async () => {
    const { channel, connection } = createMockAmqp();
    const service = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn: vi.fn().mockResolvedValue(connection),
    });

    const published = await service.publish(ROUTING_KEY_DEADLINE_REMINDER, {
      type: 'DEADLINE_REMINDER_SCAN',
    });

    expect(published).toBe(true);
    expect(connection.createConfirmChannel).toHaveBeenCalledTimes(1);
    expect(channel.assertExchange).toHaveBeenCalledWith(TASKFLOW_DLX_EXCHANGE, 'direct', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith(TASKFLOW_JOBS_DLQ, { durable: true });
    expect(channel.assertExchange).toHaveBeenCalledWith(TASKFLOW_EXCHANGE, 'topic', {
      durable: true,
    });
    expect(channel.assertQueue).toHaveBeenCalledWith(TASKFLOW_JOBS_QUEUE, {
      durable: true,
      deadLetterExchange: TASKFLOW_DLX_EXCHANGE,
      deadLetterRoutingKey: TASKFLOW_JOBS_QUEUE,
    });
    expect(channel.publish).toHaveBeenCalledWith(
      TASKFLOW_EXCHANGE,
      ROUTING_KEY_DEADLINE_REMINDER,
      expect.any(Buffer),
      { persistent: true, contentType: 'application/json' },
      expect.any(Function),
    );

    await service.onModuleDestroy();
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  it('fails open (returns false) when broker NACKs or publisher confirm times out', async () => {
    const nackAmqp = createMockAmqp({ publishError: new Error('broker nack') });
    const nackService = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn: vi.fn().mockResolvedValue(nackAmqp.connection),
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    await expect(
      nackService.publish(ROUTING_KEY_DEADLINE_REMINDER, { type: 'DEADLINE_REMINDER_SCAN' }),
    ).resolves.toBe(false);
    await nackService.onModuleDestroy();

    const hangAmqp = createMockAmqp({ hangPublish: true });
    const timeoutService = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn: vi.fn().mockResolvedValue(hangAmqp.connection),
      publishConfirmTimeoutMs: 15,
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    await expect(
      timeoutService.publish(ROUTING_KEY_DEADLINE_REMINDER, { type: 'DEADLINE_REMINDER_SCAN' }),
    ).resolves.toBe(false);
    await timeoutService.onModuleDestroy();
  });

  it('acks valid messages and nacks failing or malformed messages to DLQ', async () => {
    const { channel, connection, getConsumeHandler } = createMockAmqp();
    const service = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn: vi.fn().mockResolvedValue(connection),
      logger: { warn: vi.fn(), error: vi.fn() },
    });

    const handler = vi
      .fn<(payload: unknown) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('handler failure'));

    const subscribed = await service.consume(TASKFLOW_JOBS_QUEUE, handler);
    expect(subscribed).toBe(true);
    expect(channel.prefetch).toHaveBeenCalledWith(1);

    const onMessage = getConsumeHandler();
    expect(onMessage).not.toBeNull();

    const validMsg: AmqpMessageLike = {
      content: Buffer.from(JSON.stringify({ type: 'DEADLINE_REMINDER_SCAN' })),
    };
    await onMessage!(validMsg);
    expect(handler).toHaveBeenCalledWith({ type: 'DEADLINE_REMINDER_SCAN' });
    expect(channel.ack).toHaveBeenCalledWith(validMsg);

    const failingMsg: AmqpMessageLike = {
      content: Buffer.from(JSON.stringify({ type: 'DEADLINE_REMINDER_SCAN' })),
    };
    await onMessage!(failingMsg);
    expect(channel.nack).toHaveBeenCalledWith(failingMsg, false, false);

    const malformedMsg: AmqpMessageLike = {
      content: Buffer.from('{bad-json'),
    };
    await onMessage!(malformedMsg);
    expect(channel.nack).toHaveBeenCalledWith(malformedMsg, false, false);

    await service.onModuleDestroy();
  });

  it('auto-reconnects and re-registers consumers after startup failure or connection drop', async () => {
    const amqp1 = createMockAmqp();
    const amqp2 = createMockAmqp();
    const connectFn = vi
      .fn<(url: string) => Promise<AmqpConnectionLike>>()
      .mockRejectedValueOnce(new Error('broker booting'))
      .mockResolvedValueOnce(amqp1.connection)
      .mockResolvedValueOnce(amqp2.connection);

    const logSpy = vi.fn();
    const service = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn,
      reconnectBaseDelayMs: 10,
      reconnectMaxDelayMs: 20,
      logger: { log: logSpy, warn: vi.fn(), error: vi.fn() },
    });

    const handler = vi.fn<(payload: unknown) => Promise<void>>().mockResolvedValue(undefined);
    const initialSubscribed = await service.consume(TASKFLOW_JOBS_QUEUE, handler);
    expect(initialSubscribed).toBe(false);

    // Wait for initial auto-reconnect recovery (amqp1)
    await vi.waitFor(() => {
      expect(amqp1.channel.consume).toHaveBeenCalledTimes(1);
    });

    // Simulate broker restart / connection drop on amqp1 -> reconnects onto amqp2
    amqp1.emitConnectionEvent('close');

    await vi.waitFor(() => {
      expect(amqp2.channel.consume).toHaveBeenCalledTimes(1);
    });

    // Deliver a message on the recovered consumer channel
    const onRecoveredMsg = amqp2.getConsumeHandler();
    expect(onRecoveredMsg).not.toBeNull();
    const msg: AmqpMessageLike = {
      content: Buffer.from(JSON.stringify({ type: 'DEADLINE_REMINDER_SCAN' })),
    };
    await onRecoveredMsg!(msg);
    expect(handler).toHaveBeenCalledWith({ type: 'DEADLINE_REMINDER_SCAN' });
    expect(amqp2.channel.ack).toHaveBeenCalledWith(msg);

    await service.onModuleDestroy();
  });
});
