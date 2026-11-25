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
} from '@taskflow/shared/rabbitmq';
import { RabbitMqService } from '../rabbitmq.service.js';

function createMockAmqp() {
  let consumeHandler: ((msg: AmqpMessageLike | null) => void | Promise<void>) | null = null;
  const channel: AmqpChannelLike = {
    assertExchange: vi.fn<AmqpChannelLike['assertExchange']>().mockResolvedValue({}),
    assertQueue: vi.fn<AmqpChannelLike['assertQueue']>().mockResolvedValue({}),
    bindQueue: vi.fn<AmqpChannelLike['bindQueue']>().mockResolvedValue({}),
    prefetch: vi.fn<AmqpChannelLike['prefetch']>().mockResolvedValue({}),
    publish: vi.fn<AmqpChannelLike['publish']>().mockReturnValue(true),
    consume: vi.fn<AmqpChannelLike['consume']>().mockImplementation(async (_queue, onMsg) => {
      consumeHandler = onMsg;
      return {};
    }),
    ack: vi.fn<AmqpChannelLike['ack']>(),
    nack: vi.fn<AmqpChannelLike['nack']>(),
    close: vi.fn<AmqpChannelLike['close']>().mockResolvedValue(undefined),
    on: vi.fn<AmqpChannelLike['on']>(),
  };
  const connection: AmqpConnectionLike = {
    createChannel: vi.fn<AmqpConnectionLike['createChannel']>().mockResolvedValue(channel),
    close: vi.fn<AmqpConnectionLike['close']>().mockResolvedValue(undefined),
    on: vi.fn<AmqpConnectionLike['on']>(),
  };
  return {
    channel,
    connection,
    getConsumeHandler: () => consumeHandler,
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

  it('asserts exchange/DLQ topology and publishes persistent JSON messages', async () => {
    const { channel, connection } = createMockAmqp();
    const service = new RabbitMqService({
      url: 'amqp://localhost:5672',
      connectFn: vi.fn().mockResolvedValue(connection),
    });

    const published = await service.publish(ROUTING_KEY_DEADLINE_REMINDER, {
      type: 'DEADLINE_REMINDER_SCAN',
    });

    expect(published).toBe(true);
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
    );

    await service.onModuleDestroy();
    expect(channel.close).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalledTimes(1);
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
  });
});
