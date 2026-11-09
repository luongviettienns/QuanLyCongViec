import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '@prisma/client';
import { NotificationRecipientService } from './notification-recipient.service.js';
import { renderNotificationTemplate } from '../templates/notification-template.js';
import type { DomainNotificationEvent } from '../types/notification-event.types.js';
import { RealtimeService } from '../../realtime/realtime.service.js';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipientService: NotificationRecipientService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Publishes a domain event and creates notifications for all recipients.
   * MUST be executed inside an existing Prisma transaction client `tx`
   * or will execute inside a new transaction if not provided.
   */
  async publish(
    event: DomainNotificationEvent,
    txClient?: Prisma.TransactionClient,
  ): Promise<void> {
    const execute = async (tx: Prisma.TransactionClient) => {
      // 1. Resolve recipients (deduplicated & actor excluded)
      const recipientIds = await this.recipientService.resolveRecipients(event, tx);
      if (recipientIds.length === 0) {
        return;
      }

      // 2. Fetch actor name
      let actorName = 'Người dùng';
      if (event.actorId > 0) {
        const actor = await tx.user.findUnique({
          where: { id: event.actorId },
          select: { name: true },
        });
        if (actor?.name) {
          actorName = actor.name;
        }
      }

      // 3. Render template
      const { title, content } = renderNotificationTemplate(event, actorName);

      // 4. Determine entity links
      const taskId = 'taskId' in event ? event.taskId : null;
      const teamId = 'teamId' in event ? event.teamId : null;

      // 5. Prepare notification records for all recipients
      const notificationsData = recipientIds.map((recipientId) => {
        let eventKey: string;
        if (event.type === 'TASK_DEADLINE_SOON' || event.type === 'TASK_OVERDUE') {
          eventKey = `${event.type}:${recipientId}:${taskId}:${event.dueDate}`;
        } else {
          const eventTimestamp = event.timestamp || Date.now();
          eventKey = `${event.type}:${recipientId}:${taskId ?? teamId ?? 'global'}:${eventTimestamp}`;
        }

        return {
          userId: recipientId,
          actorId: event.actorId > 0 ? event.actorId : null,
          type: event.type,
          title,
          content,
          taskId,
          teamId,
          eventKey,
          isRead: false,
        };
      });

      // 6. Atomically insert with skipDuplicates: true (PostgreSQL ON CONFLICT DO NOTHING)
      // This guarantees that idempotent duplicates do NOT trigger PostgreSQL constraint violations,
      // preventing "current transaction is aborted" errors in PostgreSQL.
      await tx.notification.createMany({
        data: notificationsData,
        skipDuplicates: true,
      });

      for (const notif of notificationsData) {
        void this.realtimeService.emit({
          type: 'NOTIFICATION_NEW',
          actorId: event.actorId > 0 ? event.actorId : undefined,
          targetUserIds: [notif.userId],
          teamId: notif.teamId,
          payload: {
            title: notif.title,
            content: notif.content,
            taskId: notif.taskId,
            teamId: notif.teamId,
            type: notif.type,
          },
        });
      }
    };

    if (txClient) {
      await execute(txClient);
    } else {
      await this.prisma.$transaction(async (tx) => {
        await execute(tx);
      });
    }
  }
}
