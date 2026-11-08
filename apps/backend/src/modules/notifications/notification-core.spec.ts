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
        },
        'Chủ Nhóm',
      );
      expect(template.title).toBe('Thay đổi vai trò trong nhóm');
      expect(template.content).toContain('Quản trị viên (ADMIN)');
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

  describe('NotificationEventService Transactional Idempotency', () => {
    it('skips duplicate insert when P2002 unique constraint on eventKey occurs', async () => {
      const mockRecipientService = {
        resolveRecipients: vi.fn().mockResolvedValue([2]),
      };
      const mockTx = {
        user: { findUnique: vi.fn().mockResolvedValue({ name: 'Sender' }) },
        notification: {
          create: vi.fn().mockRejectedValue({ code: 'P2002' }), // unique eventKey collision
        },
      };
      const mockPrisma = {
        $transaction: vi.fn((cb) => cb(mockTx)),
      } as any;

      const eventService = new NotificationEventService(mockPrisma, mockRecipientService as any);

      // Should not throw, handles gracefully
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
    });
  });
});
