import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRealtimeNotificationState,
  appendPaginatedNotifications,
  buildNotificationDestination,
  resolveNotificationModalTab,
  IMPORTANT_NOTIFICATION_TYPES,
  isImportantNotification,
  getVietnamCalendarDateKey,
  groupNotificationsByTime,
  getNotificationVisualStyle,
  applyOptimisticMarkRead,
  rollbackOptimisticMarkRead,
  applyOptimisticMarkAllRead,
  rollbackOptimisticMarkAllRead,
} from '../notification-state.utils.ts';
import type { Notification, NotificationType } from '../../types/notification.types.ts';

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

  it('classifies important notification types matching backend IMPORTANT_NOTIFICATION_TYPES (14 types)', () => {
    const expectedImportant: NotificationType[] = [
      'TASK_OVERDUE',
      'TASK_DEADLINE_SOON',
      'DEADLINE_SOON',
      'TASK_DEADLINE_CHANGED',
      'TASK_ASSIGNED',
      'SUBTASK_ASSIGNED',
      'TASK_RETURNED',
      'TASK_COLLABORATOR_INVITED',
      'TASK_DELETED',
      'TEAM_INVITED',
      'TEAM_OWNERSHIP_TRANSFERRED',
      'TEAM_MEMBER_REMOVED',
      'TEAM_ROLE_CHANGED',
      'TEAM_DELETED',
    ];
    assert.equal(IMPORTANT_NOTIFICATION_TYPES.size, expectedImportant.length);
    for (const type of expectedImportant) {
      assert.equal(isImportantNotification(type), true);
    }
    assert.equal(isImportantNotification('TASK_COMPLETED'), false);
    assert.equal(isImportantNotification('TASK_STATUS_CHANGED'), false);
    assert.equal(isImportantNotification('SUBTASK_COMPLETED'), false);
    assert.equal(isImportantNotification('TEAM_MEMBER_ADDED'), false);
  });

  it('filters live SSE NOTIFICATION_NEW into important tab while always incrementing unreadDelta', () => {
    const existing = [makeNotif({ id: 90, type: 'TASK_OVERDUE' })];

    const nonImportantRes = mergeRealtimeNotificationState(
      existing,
      {
        id: 91,
        type: 'TASK_COMPLETED',
        title: 'Task done',
        content: 'Done',
        isRead: false,
      },
      1,
      'important',
    );
    assert.equal(nonImportantRes.items.length, 1);
    assert.equal(nonImportantRes.unreadDelta, 1);

    const importantRes = mergeRealtimeNotificationState(
      existing,
      {
        id: 92,
        type: 'TASK_OVERDUE',
        title: 'Overdue',
        content: 'Overdue',
        isRead: false,
      },
      1,
      'important',
    );
    assert.equal(importantRes.items.length, 2);
    assert.equal(importantRes.items[0].id, 92);
    assert.equal(importantRes.unreadDelta, 1);
  });

  it('groups notifications by Asia/Ho_Chi_Minh calendar day around midnight UTC boundary', () => {
    // Now = 2026-11-17 10:00 +07:00
    const now = new Date('2026-11-17T03:00:00.000Z');
    assert.equal(getVietnamCalendarDateKey('2026-11-16T17:30:00.000Z'), '2026-11-17');

    const notifications = [
      // 00:30 VN on 2026-11-17 (is 17:30 UTC on 2026-11-16!) -> must be Hôm nay
      makeNotif({ id: 1, createdAt: '2026-11-16T17:30:00.000Z' }),
      // 23:50 VN on 2026-11-16 -> Hôm qua
      makeNotif({ id: 2, createdAt: '2026-11-16T16:50:00.000Z' }),
      // 12:00 VN on 2026-11-15 -> Trước đó
      makeNotif({ id: 3, createdAt: '2026-11-15T05:00:00.000Z' }),
    ];

    const groups = groupNotificationsByTime(notifications, now);
    assert.deepEqual(
      groups.map((g) => ({ key: g.key, label: g.label, ids: g.items.map((i) => i.id) })),
      [
        { key: 'today', label: 'Hôm nay', ids: [1] },
        { key: 'yesterday', label: 'Hôm qua', ids: [2] },
        { key: 'earlier', label: 'Trước đó', ids: [3] },
      ],
    );

    // Omits empty buckets cleanly
    const onlyEarlier = groupNotificationsByTime([notifications[2]], now);
    assert.equal(onlyEarlier.length, 1);
    assert.equal(onlyEarlier[0].key, 'earlier');
  });

  it('maps all 27 notification types to 4 restrained semantic tones and flags TASK_OVERDUE', () => {
    const allTypes: NotificationType[] = [
      'TASK_ASSIGNED',
      'TASK_UNASSIGNED',
      'TASK_STATUS_CHANGED',
      'TASK_COMPLETED',
      'TASK_RETURNED',
      'TASK_DEADLINE_CHANGED',
      'TASK_DEADLINE_SOON',
      'TASK_OVERDUE',
      'TASK_DELETED',
      'TASK_MOVED_TEAM',
      'TEAM_MEMBER_ADDED',
      'TEAM_MEMBER_REMOVED',
      'TEAM_ROLE_CHANGED',
      'TEAM_OWNERSHIP_TRANSFERRED',
      'TEAM_DELETED',
      'TEAM_INVITED',
      'DEADLINE_SOON',
      'TASK_COLLABORATOR_INVITED',
      'TASK_COLLABORATOR_ACCEPTED',
      'TASK_COLLABORATOR_DECLINED',
      'TASK_COLLABORATOR_REMOVED',
      'SUBTASK_ASSIGNED',
      'SUBTASK_UNASSIGNED',
      'SUBTASK_STATUS_CHANGED',
      'SUBTASK_COMPLETED',
      'SUBTASK_REOPENED',
    ];

    const tones = new Set(allTypes.map((t) => getNotificationVisualStyle(t).tone));
    assert.deepEqual(tones, new Set(['danger', 'warning', 'primary', 'success']));

    const overdueStyle = getNotificationVisualStyle('TASK_OVERDUE');
    assert.equal(overdueStyle.tone, 'danger');
    assert.equal(overdueStyle.isOverdue, true);

    assert.equal(getNotificationVisualStyle('TASK_ASSIGNED').isOverdue, false);
    assert.equal(getNotificationVisualStyle('TASK_COMPLETED').tone, 'success');
  });

  it('applies optimistic mark-read idempotently and rolls back only the target item on error', () => {
    const items = [
      makeNotif({ id: 1, isRead: false }),
      makeNotif({ id: 2, isRead: true }),
    ];

    const marked1 = applyOptimisticMarkRead(items, 1);
    assert.equal(marked1.didChange, true);
    assert.equal(marked1.items[0].isRead, true);

    const marked2 = applyOptimisticMarkRead(items, 2);
    assert.equal(marked2.didChange, false);
    assert.equal(marked2.items, items);

    // Concurrent item 2 was marked read, item 1 failed -> rollback only item 1
    const withBothRead = applyOptimisticMarkRead(
      [makeNotif({ id: 1, isRead: true }), makeNotif({ id: 2, isRead: false })],
      2,
    ).items;
    const rolledBack = rollbackOptimisticMarkRead(withBothRead, 1);
    assert.equal(rolledBack[0].isRead, false);
    assert.equal(rolledBack[1].isRead, true);
  });

  it('applies optimistic mark-all-read and rolls back only flipped IDs on failure', () => {
    const items = [
      makeNotif({ id: 1, isRead: false }),
      makeNotif({ id: 2, isRead: true }),
      makeNotif({ id: 3, isRead: false }),
    ];

    const applied = applyOptimisticMarkAllRead(items);
    assert.deepEqual(applied.flippedIds, [1, 3]);
    assert.equal(applied.items.every((item) => item.isRead), true);

    // No-op when all are already read preserves array reference
    const noop = applyOptimisticMarkAllRead(applied.items);
    assert.deepEqual(noop.flippedIds, []);
    assert.equal(noop.items, applied.items);

    // Simulate an already-read SSE arrival id: 4 while mark-all-read is in-flight
    const withNewItem = [makeNotif({ id: 4, isRead: true }), ...applied.items];
    const rolledBack = rollbackOptimisticMarkAllRead(withNewItem, applied.flippedIds);
    assert.deepEqual(
      rolledBack.map((item) => ({ id: item.id, isRead: item.isRead })),
      [
        { id: 4, isRead: true },
        { id: 1, isRead: false },
        { id: 2, isRead: true },
        { id: 3, isRead: false },
      ],
    );

    // On 'unread' tab, mark-all-read clears visible list so empty-unread state renders immediately
    const clearedUnreadTab = applyOptimisticMarkAllRead(items, 'unread');
    assert.deepEqual(clearedUnreadTab.items, []);
    assert.deepEqual(clearedUnreadTab.flippedIds, [1, 3]);
  });
});
