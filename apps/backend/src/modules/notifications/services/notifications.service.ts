import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { QueryNotificationsDto } from '../dto/query-notifications.dto.js';
import type { Prisma } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves inbox notifications for the authenticated user using cursor-based pagination.
   */
  async findAllForUser(userId: number, query: QueryNotificationsDto) {
    const limit = query.limit || 20;
    const where: Prisma.NotificationWhereInput = {
      userId,
    };

    if (query.filter === 'unread') {
      where.isRead = false;
    }

    if (query.type) {
      where.type = query.type;
    }

    const items = await this.prisma.notification.findMany({
      where,
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      orderBy: { id: 'desc' },
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    let nextCursor: number | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    const unreadCount = await this.getUnreadCount(userId);

    return {
      items,
      nextCursor,
      unreadCount,
    };
  }

  /**
   * Returns unread notifications count for the authenticated user.
   */
  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Marks a single notification as read (idempotent, ownership enforced).
   */
  async markAsRead(userId: number, notificationId: number) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    // Enforce strict ownership - return 404 if not found or belongs to another user
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }

    if (notification.isRead) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Marks all unread notifications of the user as read.
   */
  async markAllAsRead(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }

  /**
   * Marks a list of notification IDs as read (only those owned by the user).
   */
  async markBulkAsRead(userId: number, ids: number[]) {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      success: true,
      updatedCount: result.count,
    };
  }
}
