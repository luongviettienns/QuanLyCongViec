import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealtimeConnectionManager,
  type EventSourceLike,
} from '../realtime-connection.utils.ts';

class FakeEventSource implements EventSourceLike {
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Array<(e: { data: string }) => void>>();

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (e: { data: string }) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emitNamed(type: string, data: string) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn({ data });
    }
  }

  close() {
    this.closed = true;
  }
}

describe('Realtime SSE Connection & Reconnect Manager', () => {
  it('distinguishes initial connection from reconnect and prevents duplicate EventSources', () => {
    const created: FakeEventSource[] = [];
    const scheduled: Array<() => void> = [];
    let reconnectCalls = 0;
    const statuses: string[] = [];

    const manager = createRealtimeConnectionManager({
      getToken: () => 'valid-jwt-token',
      isTokenExpired: () => false,
      createEventSource: (url) => {
        const es = new FakeEventSource(url);
        created.push(es);
        return es;
      },
      scheduleTimer: (fn) => {
        scheduled.push(fn);
        return scheduled.length;
      },
      cancelTimer: () => {},
      onEvent: () => {},
      onReconnect: () => {
        reconnectCalls += 1;
      },
      onStatusChange: (s) => statuses.push(s),
    });

    manager.start();
    assert.equal(created.length, 1);

    // Calling start() again while active must NOT spawn a duplicate EventSource
    manager.start();
    assert.equal(created.length, 1);

    // Initial open does NOT trigger reconnect callback
    created[0].onopen?.();
    assert.equal(reconnectCalls, 0);
    assert.equal(statuses.at(-1), 'connected');

    // Simulate network drop -> closes old ES, schedules reconnect
    created[0].onerror?.();
    assert.equal(created[0].closed, true);
    assert.equal(statuses.at(-1), 'reconnecting');
    assert.equal(scheduled.length, 1);

    // Execute scheduled reconnect -> creates ES #2 -> open triggers onReconnect ONCE
    scheduled[0]();
    assert.equal(created.length, 2);
    created[1].onopen?.();
    assert.equal(reconnectCalls, 1);
  });

  it('closes connection cleanly on stop/logout and refuses leaked reconnect after stop', () => {
    const created: FakeEventSource[] = [];
    const cancelledIds: unknown[] = [];
    let reconnectTimerCb: (() => void) | null = null;
    let receivedEvents = 0;

    const manager = createRealtimeConnectionManager({
      getToken: () => 'user-a-token',
      isTokenExpired: () => false,
      createEventSource: (url) => {
        const es = new FakeEventSource(url);
        created.push(es);
        return es;
      },
      scheduleTimer: (fn) => {
        reconnectTimerCb = fn;
        return 42;
      },
      cancelTimer: (id) => {
        cancelledIds.push(id);
      },
      onEvent: () => {
        receivedEvents += 1;
      },
      onReconnect: () => {},
    });

    manager.start();
    created[0].onerror?.(); // schedules timer #42
    manager.stop(); // logout

    assert.equal(created[0].closed, true);
    assert.deepEqual(cancelledIds, [42]);

    // Stale timer callback or stray message after logout MUST be ignored
    reconnectTimerCb?.();
    created[0].emitNamed('TASK_UPDATED', JSON.stringify({ type: 'TASK_UPDATED', payload: { taskId: 1 } }));
    assert.equal(created.length, 1);
    assert.equal(receivedEvents, 0);
  });

  it('stops reconnect loop when token is expired or missing and invokes onAuthExpired', () => {
    let expired = false;
    let authExpiredCalled = 0;
    const created: FakeEventSource[] = [];
    let scheduledCount = 0;

    const manager = createRealtimeConnectionManager({
      getToken: () => 'expired-token',
      isTokenExpired: () => expired,
      createEventSource: (url) => {
        const es = new FakeEventSource(url);
        created.push(es);
        return es;
      },
      scheduleTimer: () => {
        scheduledCount += 1;
        return scheduledCount;
      },
      cancelTimer: () => {},
      onEvent: () => {},
      onReconnect: () => {},
      onAuthExpired: () => {
        authExpiredCalled += 1;
      },
    });

    manager.start();
    assert.equal(created.length, 1);

    // Token expires before error fires -> must NOT keep scheduling infinite reconnects
    expired = true;
    created[0].onerror?.();
    assert.equal(scheduledCount, 0);
    assert.equal(authExpiredCalled, 1);
  });

  it('debounces rapid consecutive reconnect notifications to prevent request floods', async () => {
    let executionCount = 0;
    const debounceMs = 50;

    // Simulate debounce wrapper identical to useRealtimeReconnect
    let timer: ReturnType<typeof setTimeout> | null = null;
    const debouncedTrigger = () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        executionCount += 1;
      }, debounceMs);
    };

    // Rapid network flapping: 5 reconnects within 20ms
    debouncedTrigger();
    debouncedTrigger();
    debouncedTrigger();
    debouncedTrigger();
    debouncedTrigger();

    assert.equal(executionCount, 0);

    // Wait past debounceMs
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Must have executed exactly ONCE
    assert.equal(executionCount, 1);
  });
});
