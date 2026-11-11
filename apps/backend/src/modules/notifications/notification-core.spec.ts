import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderNotificationTemplate } from './templates/notification-template.js';
import { NotificationRecipientService } from './services/notification-recipient.service.js';
import { NotificationsService } from './services/notifications.service.js';
import { NotificationEventService } from './services/notification-event.service.js';
import { TaskStatus, TeamRole } from '@prisma/client';

describe('Notification Core Module Unit Tests', () => {
  describe('Notification Templates', () => {
    it('renders TASK_ASSIGNED template correctly', () => {
      const template = renderNotificationTemplate(
        {
          type: 'TASK_ASSIGNED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Thiết kế Database',
          assigneeId: 2,
        },
        'Nguyễn Văn A',
      );
      expect(template.title).toContain('Bạn được phân công công việc mới');
      expect(template.content).toContain('Nguyễn Văn A đã phân công công việc "Thiết kế Database" cho bạn.');
    });

    it('renders TASK_STATUS_CHANGED template with Vietnamese statuses', () => {
      const template = renderNotificationTemplate(
        {
          type: 'TASK_STATUS_CHANGED',
          actorId: 2,
          taskId: 10,
          taskTitle: 'Viết API',
          oldStatus: TaskStatus.TODO,
          newStatus: TaskStatus.IN_PROGRESS,
          creatorId: 1,
        },
        'Trần B',
      );
      expect(template.title).toBe('Cập nhật trạng thái công việc');
      expect(template.content).toContain('từ Cần làm (TODO) sang Đang làm (IN_PROGRESS)');
    });

    it('renders TASK_RETURNED template with reason', () => {
      const template = renderNotificationTemplate(
        {
          type: 'TASK_RETURNED',
          actorId: 2,
          taskId: 10,
          taskTitle: 'Làm UI',
          creatorId: 1,
          reason: 'Thiếu tài liệu đặc tả',
        },
        'Trần B',
      );
      expect(template.title).toBe('Công việc bị trả lại');
      expect(template.content).toContain('Lý do: Thiếu tài liệu đặc tả');
    });

    it('renders TEAM_ROLE_CHANGED template with Vietnamese roles', () => {
      const template = renderNotificationTemplate(
        {
          type: 'TEAM_ROLE_CHANGED',
          actorId: 1,
          teamId: 5,
          teamName: 'Frontend Team',
          targetUserId: 3,
          newRole: TeamRole.ADMIN,
          activityLogId: 10,
        },
        'Chủ Nhóm',
      );
      expect(template.title).toBe('Thay đổi vai trò trong nhóm');
      expect(template.content).toContain('Quản trị viên (ADMIN)');
    });

    it('renders SUBTASK_ASSIGNED (fresh vs reassigned), SUBTASK_UNASSIGNED, SUBTASK_STATUS_CHANGED, SUBTASK_COMPLETED, SUBTASK_REOPENED', () => {
      const freshAssign = renderNotificationTemplate(
        {
          type: 'SUBTASK_ASSIGNED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          subtaskAssigneeId: 2,
          isReassigned: false,
        },
        'Quản lý',
      );
      expect(freshAssign.title).toContain('việc con');
      expect(freshAssign.title).not.toContain('giao lại');
      expect(freshAssign.content).toContain('Việc con A');
      expect(freshAssign.content).toContain('Task Chính');

      const reassigned = renderNotificationTemplate(
        {
          type: 'SUBTASK_ASSIGNED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          subtaskAssigneeId: 3,
          previousAssigneeId: 2,
          isReassigned: true,
        },
        'Quản lý',
      );
      expect(reassigned.title).toContain('giao lại');
      expect(reassigned.content).toContain('giao lại việc con');

      const unassigned = renderNotificationTemplate(
        {
          type: 'SUBTASK_UNASSIGNED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          previousAssigneeId: 2,
        },
        'Quản lý',
      );
      expect(unassigned.title).toContain('Hủy phân công');
      expect(unassigned.content).toContain('Việc con A');

      const inProgress = renderNotificationTemplate(
        {
          type: 'SUBTASK_STATUS_CHANGED',
          actorId: 3,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          oldStatus: TaskStatus.TODO,
          newStatus: TaskStatus.IN_PROGRESS,
          creatorId: 1,
        },
        'Cộng tác viên',
      );
      expect(inProgress.content).toContain('Cần làm (TODO)');
      expect(inProgress.content).toContain('Đang làm (IN_PROGRESS)');

      const completed = renderNotificationTemplate(
        {
          type: 'SUBTASK_COMPLETED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          creatorId: 2,
          assigneeId: 3,
          subtaskAssigneeId: 4,
          completedById: 1,
        },
        'Quản lý B',
      );
      expect(completed.content).toContain('Quản lý B');
      expect(completed.content).toContain('hoàn thành việc con');

      const reopened = renderNotificationTemplate(
        {
          type: 'SUBTASK_REOPENED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Task Chính',
          subtaskId: 21,
          subtaskTitle: 'Việc con A',
          newStatus: TaskStatus.IN_PROGRESS,
          creatorId: 2,
          subtaskAssigneeId: 3,
        },
        'Quản lý B',
      );
      expect(reopened.title).toContain('mở lại');
      expect(reopened.content).toContain('mở lại việc con');
    });
  });

  describe('NotificationRecipientService', () => {
    let mockPrisma: any;
    let recipientService: NotificationRecipientService;

    beforeEach(() => {
      mockPrisma = {
        team: {
          findUnique: vi.fn(),
        },
        teamMember: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
        },
      };
      recipientService = new NotificationRecipientService(mockPrisma);
    });

    it('TASK_ASSIGNED: excludes actor from recipients', async () => {
      // User 1 assigns task to User 2 -> User 2 receives
      const recipients = await recipientService.resolveRecipients({
        type: 'TASK_ASSIGNED',
        actorId: 1,
        taskId: 10,
        taskTitle: 'Task A',
        assigneeId: 2,
      });
      expect(recipients).toEqual([2]);

      // Self-assignment: User 1 assigns task to User 1 -> 0 recipients
      const selfRecipients = await recipientService.resolveRecipients({
        type: 'TASK_ASSIGNED',
        actorId: 1,
        taskId: 10,
        taskTitle: 'Task A',
        assigneeId: 1,
      });
      expect(selfRecipients).toEqual([]);
    });

    it('TASK_COMPLETED: deduplicates user with multiple roles and excludes actor', async () => {
      // Team Owner is User 1, Creator is User 1, Assignee is User 2.
      // Actor is User 2 (Assignee completes task)
      mockPrisma.team.findUnique.mockResolvedValue({ ownerId: 1, members: [{ userId: 2 }] });

      const recipients = await recipientService.resolveRecipients({
        type: 'TASK_COMPLETED',
        actorId: 2,
        taskId: 10,
        taskTitle: 'Task B',
        creatorId: 1,
        assigneeId: 2,
        teamId: 5,
      });

      // User 1 is both Creator and Owner -> must only appear ONCE
      expect(recipients).toEqual([1]);
    });

    it('TASK_RETURNED: falls back to Team Owner if Creator left the team', async () => {
      // Creator (User 10) is NO LONGER a member of Team 5
      mockPrisma.teamMember.findUnique.mockResolvedValue(null);
      // Team 5 Owner is User 1
      mockPrisma.team.findUnique.mockResolvedValue({ ownerId: 1, members: [{ userId: 2 }] });

      const recipients = await recipientService.resolveRecipients({
        type: 'TASK_RETURNED',
        actorId: 2,
        taskId: 10,
        taskTitle: 'Task C',
        creatorId: 10,
        teamId: 5,
        reason: 'Out of scope',
      });

      expect(recipients).toEqual([1]);
    });

    it('TEAM_DELETED: notifies all remaining members except actor', async () => {
      mockPrisma.teamMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
      ]);

      const recipients = await recipientService.resolveRecipients({
        type: 'TEAM_DELETED',
        actorId: 1, // Owner is deleting
        teamId: 5,
        teamName: 'Dev Team',
      });

      expect(recipients).toEqual([2, 3]);
    });

    it('TASK_STATUS_CHANGED: filters out creator if they are no longer in the team', async () => {
      // Creator (User 10) left the team. Active members are Owner (User 1) and Assignee (User 2).
      // Actor is User 2 (Assignee updates status).
      mockPrisma.team.findUnique.mockResolvedValue({
        ownerId: 1,
        members: [{ userId: 2 }],
      });

      const recipients = await recipientService.resolveRecipients({
        type: 'TASK_STATUS_CHANGED',
        actorId: 2,
        taskId: 10,
        taskTitle: 'Private Task',
        oldStatus: TaskStatus.TODO,
        newStatus: TaskStatus.IN_PROGRESS,
        creatorId: 10, // Not in team!
        assigneeId: 2,
        teamId: 5,
      });

      // User 10 was filtered out because they have no access to Team 5.
      expect(recipients).toEqual([]);
    });

    it('SUBTASK_COMPLETED & SUBTASK_REOPENED: notifies creator, main assignee, and subtask assignee without actor or non-members', async () => {
      // Active members in Team 5: Owner 1, User 2, User 3, User 4. Non-member: 10.
      mockPrisma.team.findUnique.mockResolvedValue({
        ownerId: 1,
        members: [{ userId: 2 }, { userId: 3 }, { userId: 4 }],
      });

      // Manager (User 2) completes subtask assigned to Collaborator (User 4) on task created by User 1 and Main Assignee User 3
      const completedRecipients = await recipientService.resolveRecipients({
        type: 'SUBTASK_COMPLETED',
        actorId: 2,
        taskId: 10,
        taskTitle: 'Parent',
        subtaskId: 50,
        subtaskTitle: 'Sub',
        creatorId: 1,
        assigneeId: 3,
        subtaskAssigneeId: 4,
        completedById: 2,
        teamId: 5,
      });
      // Main Assignee 3, Creator 1, Subtask Assignee 4 notified (actor 2 excluded)
      expect(completedRecipients.sort((a, b) => a - b)).toEqual([1, 3, 4]);

      // Reopen where Creator === Actor 1 -> notifies Main Assignee 3 & Subtask Assignee 4
      const reopenRecipients = await recipientService.resolveRecipients({
        type: 'SUBTASK_REOPENED',
        actorId: 1,
        taskId: 10,
        taskTitle: 'Parent',
        subtaskId: 50,
        subtaskTitle: 'Sub',
        newStatus: TaskStatus.IN_PROGRESS,
        creatorId: 1,
        assigneeId: 3,
        subtaskAssigneeId: 4,
        teamId: 5,
      });
      expect(reopenRecipients.sort((a, b) => a - b)).toEqual([3, 4]);
    });
  });

  describe('NotificationsService Security & Idempotency', () => {
    let mockPrisma: any;
    let notificationsService: NotificationsService;

    beforeEach(() => {
      mockPrisma = {
        notification: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          count: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      };
      notificationsService = new NotificationsService(mockPrisma);
    });

    it('markAsRead: throws NotFoundException when notification belongs to another user (IDOR prevention)', async () => {
      // Notification 99 belongs to User 2
      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 99,
        userId: 2,
        isRead: false,
      });

      // User 1 attempts to mark it as read
      await expect(notificationsService.markAsRead(1, 99)).rejects.toThrow(
        'Không tìm thấy thông báo',
      );
    });

    it('markAsRead: idempotent when notification already read', async () => {
      const existingReadDate = new Date('2026-11-01T10:00:00Z');
      mockPrisma.notification.findUnique.mockResolvedValue({
        id: 10,
        userId: 1,
        isRead: true,
        readAt: existingReadDate,
      });

      const res = await notificationsService.markAsRead(1, 10);
      expect(res.isRead).toBe(true);
      expect(res.readAt).toBe(existingReadDate);
      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
    });

    it('findAllForUser: cursor pagination correctly sets nextCursor to the last item returned without skipping', async () => {
      // Mock 4 records returned when limit is 3 (limit + 1)
      const mockItems = [
        { id: 10, userId: 1, isRead: false },
        { id: 9, userId: 1, isRead: false },
        { id: 8, userId: 1, isRead: false },
        { id: 7, userId: 1, isRead: false }, // 4th peek item
      ];
      mockPrisma.notification.findMany.mockResolvedValue([...mockItems]);
      mockPrisma.notification.count.mockResolvedValue(10);

      const res = await notificationsService.findAllForUser(1, { limit: 3 });

      // Page 1 should return items [10, 9, 8] and nextCursor should be 8 (the last returned item)
      expect(res.items.map((i) => i.id)).toEqual([10, 9, 8]);
      expect(res.nextCursor).toBe(8);
      expect(res.unreadCount).toBe(10);
    });
  });

  describe('NotificationEventService Transactional Idempotency and Post-Commit Delivery', () => {
    it('uses createMany with skipDuplicates: true to safely handle idempotent events without aborting transaction', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([2]),
      };
      const mockTx = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Sender' }) },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;
      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      await expect(
        eventService.publish(
          {
            type: 'TASK_ASSIGNED',
            actorId: 1,
            taskId: 10,
            taskTitle: 'Retry Task',
            assigneeId: 2,
          },
          mockTx as any,
        ),
      ).resolves.not.toThrow();

      expect(mockTx.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: 2,
            type: 'TASK_ASSIGNED',
            taskId: 10,
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it('defers realtime emission until post-commit and does NOT emit inside transaction', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([2]),
      };
      const postCommitHooks: Array<() => void> = [];
      const mockTx: any = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Sender' }) },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      // Attach post commit collector as PrismaService.$transaction does
      const { POST_COMMIT_HOOKS } = await import('../../database/prisma.service.js');
      mockTx[POST_COMMIT_HOOKS] = postCommitHooks;

      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;
      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      await eventService.publish(
        {
          type: 'TASK_ASSIGNED',
          actorId: 1,
          taskId: 10,
          taskTitle: 'Post-commit Task',
          assigneeId: 2,
        },
        mockTx,
      );

      // Verify that realtimeService.emit has NOT been called yet while transaction is open
      expect(mockRealtimeService.emit).not.toHaveBeenCalled();
      expect(postCommitHooks).toHaveLength(1);

      // Simulate transaction commit
      postCommitHooks[0]();

      // Now it must be called
      expect(mockRealtimeService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOTIFICATION_NEW',
          targetUserIds: [2],
          payload: expect.objectContaining({
            title: expect.stringContaining('phân công'),
          }),
        }),
      );
    });

    it('filters out duplicate records and does NOT emit SSE for skipped notifications', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([2]),
      };
      const postCommitHooks: Array<() => void> = [];
      const { POST_COMMIT_HOOKS } = await import('../../database/prisma.service.js');
      const mockTx: any = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Sender' }) },
        notification: {
          // Simulate database already having this eventKey
          findMany: vi.fn().mockResolvedValue([
            { eventKey: 'TASK_DEADLINE_SOON:2:10:2026-11-15' },
          ]),
          createMany: vi.fn(),
        },
      };
      mockTx[POST_COMMIT_HOOKS] = postCommitHooks;

      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;
      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      await eventService.publish(
        {
          type: 'TASK_DEADLINE_SOON',
          actorId: 0,
          taskId: 10,
          taskTitle: 'Duplicate Deadline Task',
          dueDate: '2026-11-15',
          creatorId: 1,
          assigneeId: 2,
        },
        mockTx,
      );

      // Should skip insert and register no post-commit hook
      expect(mockTx.notification.createMany).not.toHaveBeenCalled();
      expect(postCommitHooks).toHaveLength(0);
      expect(mockRealtimeService.emit).not.toHaveBeenCalled();
    });

    it('uses deterministic eventKey (retry-stable) and emits ZERO phantom SSE when createManyAndReturn skips concurrent duplicate', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([2]),
      };
      const postCommitHooks: Array<() => void> = [];
      const { POST_COMMIT_HOOKS } = await import('../../database/prisma.service.js');
      const capturedData: Array<Array<{ eventKey?: string }>> = [];
      const createManyAndReturnMock = vi.fn().mockImplementation(({ data }) => {
        capturedData.push(data);
        // Simulate unique conflict ignored concurrently by PostgreSQL -> 0 rows returned
        return Promise.resolve([]);
      });
      const mockTx: any = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Manager A' }) },
        task: { findUnique: vi.fn().mockResolvedValue({ id: 10 }) },
        subtask: { findUnique: vi.fn().mockResolvedValue({ id: 77 }) },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: createManyAndReturnMock,
        },
      };
      mockTx[POST_COMMIT_HOOKS] = postCommitHooks;

      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;
      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      const baseEvent = {
        type: 'SUBTASK_COMPLETED' as const,
        actorId: 1,
        taskId: 10,
        taskTitle: 'Parent Task',
        subtaskId: 77,
        subtaskTitle: 'Subtask X',
        creatorId: 2,
        completedById: 1,
        completedAt: 1700000000000,
      };

      await eventService.publish(baseEvent, mockTx);
      await eventService.publish(baseEvent, mockTx);

      // Concurrent skip must emit zero phantom SSE and register zero hooks
      expect(postCommitHooks).toHaveLength(0);
      expect(mockRealtimeService.emit).not.toHaveBeenCalled();

      // Same semantic operation yields identical deterministic eventKey across retries
      expect(capturedData).toHaveLength(2);
      expect(capturedData[0][0].eventKey).toBe(capturedData[1][0].eventKey);
      expect(capturedData[0][0].eventKey).toContain('SUBTASK_COMPLETED:2:10:77:');

      // Distinct timestamp/operation yields a distinct eventKey and emits subtaskId post-commit
      const createdAt = new Date('2026-11-11T10:00:00.000Z');
      createManyAndReturnMock.mockImplementationOnce(({ data }) => {
        capturedData.push(data);
        return Promise.resolve([
          {
            id: 501,
            userId: 2,
            actorId: 1,
            type: 'SUBTASK_COMPLETED',
            title: 'Hoàn thành việc con',
            content: 'Manager A đã hoàn thành việc con...',
            taskId: 10,
            subtaskId: 77,
            teamId: null,
            isRead: false,
            createdAt,
          },
        ]);
      });

      await eventService.publish(
        {
          ...baseEvent,
          completedAt: 1700000005000,
        },
        mockTx,
      );

      expect(capturedData[2][0].eventKey).not.toBe(capturedData[0][0].eventKey);
      expect(postCommitHooks).toHaveLength(1);
      postCommitHooks[0]();

      expect(mockRealtimeService.emit).toHaveBeenCalledTimes(1);
      expect(mockRealtimeService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOTIFICATION_NEW',
          targetUserIds: [2],
          payload: expect.objectContaining({
            id: 501,
            taskId: 10,
            subtaskId: 77,
            isRead: false,
          }),
        }),
      );
    });

    it('guarantees distinct eventKey per recipient for multi-recipient events and avoids double activity: prefix', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([101, 102]), // two recipients
      };
      const postCommitHooks: Array<() => void> = [];
      const { POST_COMMIT_HOOKS } = await import('../../database/prisma.service.js');
      let createdData: any[] = [];
      const mockTx: any = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Owner A' }) },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockImplementation(({ data }) => {
            createdData = data;
            return Promise.resolve(data.map((d: any, idx: number) => ({ id: idx + 1, ...d })));
          }),
        },
      };
      mockTx[POST_COMMIT_HOOKS] = postCommitHooks;

      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;
      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      // Pass activityLogId AND idempotencyKey starting with activity:
      await eventService.publish(
        {
          type: 'TEAM_OWNERSHIP_TRANSFERRED',
          actorId: 101,
          teamId: 5,
          teamName: 'Core Team',
          newOwnerId: 102,
          previousOwnerId: 101,
          activityLogId: 999,
          idempotencyKey: 'activity:999',
        },
        mockTx,
      );

      expect(createdData).toHaveLength(2);
      // Recipient 101
      expect(createdData[0].userId).toBe(101);
      expect(createdData[0].eventKey).toContain('TEAM_OWNERSHIP_TRANSFERRED:101:5:102:activity:999');
      // Recipient 102
      expect(createdData[1].userId).toBe(102);
      expect(createdData[1].eventKey).toContain('TEAM_OWNERSHIP_TRANSFERRED:102:5:102:activity:999');
      // Must NOT collide
      expect(createdData[0].eventKey).not.toBe(createdData[1].eventKey);
      // Must NOT contain double prefix
      expect(createdData[0].eventKey).not.toContain('activity:activity:');
      expect(createdData[1].eventKey).not.toContain('activity:activity:');
    });

    it('publishes without txClient by wrapping in $transaction and executing post-commit hook', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([5]),
      };
      const { POST_COMMIT_HOOKS } = await import('../../database/prisma.service.js');
      const mockTx: any = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Admin' }) },
        notification: {
          findMany: vi.fn().mockResolvedValue([]),
          createManyAndReturn: vi.fn().mockResolvedValue([
            {
              id: 777,
              userId: 5,
              actorId: 1,
              type: 'TEAM_MEMBER_ADDED',
              title: 'Chào mừng thành viên',
              content: 'Nội dung',
              teamId: 3,
              isRead: false,
            },
          ]),
        },
      };

      const mockRealtimeService = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      // Simulate PrismaService.$transaction which executes post-commit hooks after commit
      const mockPrisma = {
        $transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => {
          const hooks: Array<() => void> = [];
          mockTx[POST_COMMIT_HOOKS] = hooks;
          const res = await cb(mockTx);
          for (const hook of hooks) {
            hook();
          }
          return res;
        }),
      } as any;

      const eventService = new NotificationEventService(
        mockPrisma,
        mockRecipientService as any,
        mockRealtimeService as any,
      );

      // Call publish WITHOUT txClient
      await eventService.publish({
        type: 'TEAM_MEMBER_ADDED',
        actorId: 1,
        teamId: 3,
        teamName: 'Designers',
        newMemberId: 5,
        role: TeamRole.MEMBER,
        activityLogId: 888,
      });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // Realtime emit should have fired via post-commit hook
      expect(mockRealtimeService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NOTIFICATION_NEW',
          targetUserIds: [5],
          payload: expect.objectContaining({
            id: 777,
            teamId: 3,
          }),
        }),
      );
    });
  });
});
