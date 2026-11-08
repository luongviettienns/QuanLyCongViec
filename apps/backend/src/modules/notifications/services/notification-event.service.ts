import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import type { Prisma } from '@prisma/client';
import { NotificationRecipientService } from './notification-recipient.service.js';
import { renderNotificationTemplate } from '../templates/notification-template.js';
import type { DomainNotificationEvent } from '../types/notification-event.types.js';

@Injectable()
export class NotificationEventService {
  private readonly logger = new Logger(NotificationEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipientService: NotificationRecipientService,
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

      // 5. Create notifications for each recipient with unique eventKey
      for (const recipientId of recipientIds) {
        let eventKey: string;
        if (event.type === 'TASK_DEADLINE_SOON' || event.type === 'TASK_OVERDUE') {
          eventKey = `${event.type}:${recipientId}:${taskId}:${event.dueDate}`;
        } else {
          const eventTimestamp = event.timestamp || Date.now();
          eventKey = `${event.type}:${recipientId}:${taskId ?? teamId ?? 'global'}:${eventTimestamp}`;
        }

        try {
          await tx.notification.create({
            data: {
              userId: recipientId,
              actorId: event.actorId > 0 ? event.actorId : null,
              type: event.type,
              title,
              content,
              taskId,
              teamId,
              eventKey,
              isRead: false,
            },
          });
        } catch (error: any) {
          // If unique constraint violation on eventKey, it's an idempotent retry - ignore safely
          if (error?.code === 'P2002') {
            this.logger.warn(`Idempotent duplicate notification skipped: eventKey=${eventKey}`);
          } else {
            throw error;
          }
        }
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
