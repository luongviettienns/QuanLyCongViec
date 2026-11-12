import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRealtimeNotificationState,
  appendPaginatedNotifications,
  buildNotificationDestination,
  resolveNotificationModalTab,
} from '../notification-state.utils.ts';
import type { Notification } from '../../types/notification.types.ts';

function makeNotif(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 100,
    userId: 1,
    actorId: 2,
    type: 'SUBTASK_ASSIGNED',
    title: 'Bạn được phân công việc con mới',
    content: 'Manager đã giao việc con cho bạn',
    isRead: false,
    readAt: null,
    taskId: 50,
    subtaskId: 12,
    teamId: 3,
    eventKey: 'k-100',
    createdAt: '2026-11-11T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('Notification State & Deep-Link Utils', () => {
  it('prepends live SSE notification without wiping loaded paginated items', () => {
    const existing = [
      makeNotif({ id: 99, title: 'Cũ 1' }),
      makeNotif({ id: 98, title: 'Cũ 2' }),
    ];

    const result = mergeRealtimeNotificationState(
      existing,
      {
        id: 105,
        type: 'SUBTASK_COMPLETED',
        title: 'Việc con đã hoàn thành',
        content: 'Collab hoàn thành Subtask A',
        taskId: 50,
        subtaskId: 77,
        teamId: 3,
        isRead: false,
        createdAt: '2026-11-11T10:05:00.000Z',
      },
      1,
      'all',
    );

    assert.equal(result.needsServerFetch, false);
    assert.equal(result.unreadDelta, 1);
    assert.equal(result.items.length, 3);
    assert.equal(result.items[0].id, 105);
    assert.equal(result.items[0].subtaskId, 77);
    assert.equal(result.items[2].id, 98);
  });

  it('deduplicates notification IDs and avoids double unread increment on duplicate SSE arrival', () => {
    const existing = [makeNotif({ id: 105, isRead: false })];

    const result = mergeRealtimeNotificationState(
      existing,
      {
        id: 105,
        type: 'SUBTASK_ASSIGNED',
        title: 'Duplicate',
        content: 'Duplicate',
        taskId: 50,
        subtaskId: 12,
      },
      1,
      'unread',
    );

    assert.equal(result.items.length, 1);
    assert.equal(result.unreadDelta, 0);
  });

  it('requests canonical fetch only when SSE payload omits id', () => {
    const existing = [makeNotif({ id: 99 })];

    const result = mergeRealtimeNotificationState(
      existing,
      {
        type: 'TASK_ASSIGNED',
        title: 'Fallback',
        content: 'Missing id payload',
        taskId: 50,
      },
      1,
      'all',
    );

    assert.equal(result.needsServerFetch, true);
    assert.equal(result.items.length, 1);
  });

  it('appends cursor pagination pages without duplicating prepended items', () => {
    const existing = [makeNotif({ id: 105 }), makeNotif({ id: 99 })];
    const incoming = [makeNotif({ id: 99 }), makeNotif({ id: 98 }), makeNotif({ id: 97 })];

    const merged = appendPaginatedNotifications(existing, incoming);
    assert.deepEqual(
      merged.map((n) => n.id),
      [105, 99, 98, 97],
    );
  });

  it('builds task destination preserving subtaskId priority for deep navigation', () => {
    const withSubtask = buildNotificationDestination(makeNotif({ taskId: 42, subtaskId: 9, teamId: 3 }));
    assert.deepEqual(withSubtask, { type: 'task', id: 42, subtaskId: 9 });

    const teamOnly = buildNotificationDestination(
      makeNotif({ taskId: null, subtaskId: null, teamId: 7 }),
    );
    assert.deepEqual(teamOnly, { type: 'team', id: 7 });

    const empty = buildNotificationDestination(
      makeNotif({ taskId: null, subtaskId: null, teamId: null }),
    );
    assert.equal(empty, null);
  });

  it('resolves collaborator modal tab for collaborator events while prioritizing subtaskId', () => {
    assert.equal(resolveNotificationModalTab('TASK_COLLABORATOR_INVITED', null), 'collaborators');
    assert.equal(resolveNotificationModalTab('TASK_COLLABORATOR_ACCEPTED', null), 'collaborators');
    assert.equal(resolveNotificationModalTab('TASK_COLLABORATOR_DECLINED', null), 'collaborators');
    assert.equal(resolveNotificationModalTab('TASK_COLLABORATOR_REMOVED', null), 'collaborators');
    assert.equal(resolveNotificationModalTab('TASK_COLLABORATOR_INVITED', 12), 'subtasks');
    assert.equal(resolveNotificationModalTab('SUBTASK_ASSIGNED', 12), 'subtasks');
    assert.equal(resolveNotificationModalTab('TASK_ASSIGNED', null), 'info');
  });
});
