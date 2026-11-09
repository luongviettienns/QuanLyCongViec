import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, POST_COMMIT_HOOKS } from '../../../database/prisma.service.js';
import { Prisma } from '@prisma/client';
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
   *
   * Realtime SSE emissions are registered as a post-commit hook on `tx[POST_COMMIT_HOOKS]`,
   * guaranteeing that notifications are only broadcast to clients AFTER the database
   * transaction has successfully committed. If the transaction rolls back, no SSE is sent.
   * Furthermore, duplicate notifications ignored by PostgreSQL are filtered out prior
   * to emission so that users never receive phantom SSE events.
   */
  async publish(
    event: DomainNotificationEvent,
    txClient?: Prisma.TransactionClient,
  ): Promise<(() => void) | void> {
    let pendingEmit: (() => void) | undefined;

    const execute = async (tx: Prisma.TransactionClient): Promise<(() => void) | undefined> => {
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

      // 4. Determine entity links safely against concurrent task deletion
      let validTaskId = 'taskId' in event ? event.taskId : null;
      if (validTaskId && tx.task?.findUnique) {
        const taskExists = await tx.task.findUnique({
          where: { id: validTaskId },
          select: { id: true },
        });
        if (!taskExists) {
          validTaskId = null;
        }
      }
      const teamId = 'teamId' in event ? event.teamId : null;

      // 5. Prepare notification records for all recipients
      const notificationsData = recipientIds.map((recipientId) => {
        let eventKey: string;
        if (event.type === 'TASK_DEADLINE_SOON' || event.type === 'TASK_OVERDUE') {
          eventKey = `${event.type}:${recipientId}:${validTaskId}:${event.dueDate}`;
        } else {
          const eventTimestamp = event.timestamp || Date.now();
          eventKey = `${event.type}:${recipientId}:${validTaskId ?? teamId ?? 'global'}:${eventTimestamp}`;
        }

        return {
          userId: recipientId,
          actorId: event.actorId > 0 ? event.actorId : null,
          type: event.type,
          title,
          content,
          taskId: validTaskId,
          teamId,
          eventKey,
          isRead: false,
        };
      });

      // 6. Filter out duplicates so that skipDuplicates does NOT cause phantom SSE emissions
      const candidateKeys = notificationsData
        .map((n) => n.eventKey)
        .filter((k): k is string => typeof k === 'string' && k.length > 0);

      let existingKeys = new Set<string>();
      if (candidateKeys.length > 0) {
        const existingRecords = await tx.notification.findMany({
          where: { eventKey: { in: candidateKeys } },
          select: { eventKey: true },
        });
        existingKeys = new Set(
          existingRecords
            .map((r) => r.eventKey)
            .filter((k): k is string => typeof k === 'string'),
        );
      }

      const trulyNewNotifications = notificationsData.filter(
        (n) => !n.eventKey || !existingKeys.has(n.eventKey),
      );

      if (trulyNewNotifications.length === 0) {
        return;
      }

      // 7. Atomically insert only truly new notifications with skipDuplicates: true
      await tx.notification.createMany({
        data: trulyNewNotifications,
        skipDuplicates: true,
      });

      const emitRealtimeNotifications = () => {
        for (const notif of trulyNewNotifications) {
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

      // 8. Register post-commit hook on transaction context
      const hooks = (tx as any)[POST_COMMIT_HOOKS];
      if (hooks && Array.isArray(hooks)) {
        hooks.push(emitRealtimeNotifications);
      } else {
        (tx as any)[POST_COMMIT_HOOKS] = [emitRealtimeNotifications];
      }

      return emitRealtimeNotifications;
    };

    if (txClient) {
      pendingEmit = await execute(txClient);
    } else {
      await this.prisma.$transaction(async (tx) => {
        pendingEmit = await execute(tx);
      });
    }

    return pendingEmit;
  }
}
