import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, POST_COMMIT_HOOKS } from '../../../database/prisma.service.js';
import { Prisma, NotificationType } from '@prisma/client';
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

      // 4. Determine entity links safely against concurrent task/subtask deletion
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

      const rawSubtaskId =
        'subtaskId' in event && typeof event.subtaskId === 'number' && event.subtaskId > 0
          ? event.subtaskId
          : null;
      let validSubtaskId = rawSubtaskId;
      if (validSubtaskId && tx.subtask?.findUnique) {
        const subtaskExists = await tx.subtask.findUnique({
          where: { id: validSubtaskId },
          select: { id: true },
        });
        if (!subtaskExists) {
          validSubtaskId = null;
        }
      }

      const teamId =
        'teamId' in event && typeof event.teamId === 'number' ? event.teamId : null;

      // 5. Prepare notification records for all recipients with deterministic, idempotent eventKey
      const notificationsData = recipientIds.map((recipientId) => {
        const eventKey = this.buildEventKey(
          event,
          recipientId,
          validTaskId,
          rawSubtaskId,
          teamId,
        );

        return {
          userId: recipientId,
          actorId: event.actorId > 0 ? event.actorId : null,
          type: event.type,
          title,
          content,
          taskId: validTaskId,
          subtaskId: validSubtaskId,
          teamId,
          eventKey,
          isRead: false,
        };
      });

      // 6. Pre-filter known duplicates
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

      // 7. Atomically insert and capture only rows actually created by THIS transaction
      // so concurrent duplicate requests NEVER emit phantom SSE events.
      type CreatedNotifSnapshot = {
        id?: number;
        userId: number;
        actorId: number | null;
        type: NotificationType;
        title: string;
        content: string;
        taskId: number | null;
        subtaskId: number | null;
        teamId: number | null;
        isRead: boolean;
        createdAt?: Date;
      };

      let insertedNotifications: CreatedNotifSnapshot[];
      if (typeof tx.notification.createManyAndReturn === 'function') {
        insertedNotifications = await tx.notification.createManyAndReturn({
          data: trulyNewNotifications,
          skipDuplicates: true,
          select: {
            id: true,
            userId: true,
            actorId: true,
            type: true,
            title: true,
            content: true,
            taskId: true,
            subtaskId: true,
            teamId: true,
            isRead: true,
            createdAt: true,
          },
        });
      } else {
        await tx.notification.createMany({
          data: trulyNewNotifications,
          skipDuplicates: true,
        });
        insertedNotifications = trulyNewNotifications;
      }

      if (insertedNotifications.length === 0) {
        return;
      }

      const emitRealtimeNotifications = () => {
        for (const notif of insertedNotifications) {
          void this.realtimeService.emit({
            type: 'NOTIFICATION_NEW',
            actorId: event.actorId > 0 ? event.actorId : undefined,
            targetUserIds: [notif.userId],
            teamId: notif.teamId,
            payload: {
              id: notif.id,
              title: notif.title,
              content: notif.content,
              taskId: notif.taskId,
              subtaskId: notif.subtaskId,
              teamId: notif.teamId,
              type: notif.type,
              isRead: notif.isRead,
              createdAt: notif.createdAt ? notif.createdAt.toISOString() : undefined,
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

  private formatTimestampTag(
    entityDate?: number | string | Date,
    fallbackTimestamp?: number,
  ): string {
    if (entityDate !== undefined && entityDate !== null) {
      return new Date(entityDate).toISOString();
    }
    if (fallbackTimestamp !== undefined && fallbackTimestamp !== null) {
      return String(Math.floor(fallbackTimestamp / 10000));
    }
    return '';
  }

  /**
   * Formats an activity tag ensuring no double `activity:` prefix
   * whether passed via activityLogId or idempotencyKey.
   */
  private formatActivityTag(
    activityLogId?: number,
    idempotencyKey?: string,
    fallback?: number,
  ): string {
    if (activityLogId !== undefined && activityLogId !== null) {
      return `activity:${activityLogId}`;
    }
    if (idempotencyKey) {
      return idempotencyKey.startsWith('activity:')
        ? idempotencyKey
        : `activity:${idempotencyKey}`;
    }
    return String(fallback ?? 0);
  }

  /**
   * Generates a deterministic idempotency `eventKey` without ever calling `Date.now()`.
   * Retries of the same logical mutation produce the exact same key, while distinct
   * business transitions or entity timestamps produce distinct keys.
   */
  private buildEventKey(
    event: DomainNotificationEvent,
    recipientId: number,
    validTaskId: number | null,
    subtaskId: number | null,
    teamId: number | null,
  ): string {
    // 1. Team activity events always preserve their domain attributes (newMemberId, newRole, etc.)
    // and format uniqueTag from activityLogId or idempotencyKey without double prefix.
    if (
      event.type === 'TEAM_MEMBER_ADDED' ||
      event.type === 'TEAM_MEMBER_REMOVED' ||
      event.type === 'TEAM_ROLE_CHANGED' ||
      event.type === 'TEAM_OWNERSHIP_TRANSFERRED'
    ) {
      const uniqueTag = this.formatActivityTag(
        event.activityLogId,
        event.idempotencyKey,
        event.timestamp ?? event.actorId,
      );
      if (event.type === 'TEAM_MEMBER_ADDED') {
        return `${event.type}:${recipientId}:${teamId}:${event.newMemberId}:${uniqueTag}`;
      }
      if (event.type === 'TEAM_MEMBER_REMOVED') {
        return `${event.type}:${recipientId}:${teamId}:${event.removedUserId}:${uniqueTag}`;
      }
      if (event.type === 'TEAM_ROLE_CHANGED') {
        return `${event.type}:${recipientId}:${teamId}:${event.targetUserId}:${event.newRole}:${uniqueTag}`;
      }
      if (event.type === 'TEAM_OWNERSHIP_TRANSFERRED') {
        return `${event.type}:${recipientId}:${teamId}:${event.newOwnerId}:${uniqueTag}`;
      }
    }

    // 2. Explicit idempotency key for task/subtask events
    if ('idempotencyKey' in event && event.idempotencyKey) {
      const sanitizedKey = event.idempotencyKey.replace(/^(activity:)+/, 'activity:');
      return `${event.type}:${recipientId}:${validTaskId ?? teamId ?? 'global'}:${subtaskId ?? ''}:${sanitizedKey}`;
    }

    switch (event.type) {
      case 'TASK_DEADLINE_SOON':
      case 'TASK_OVERDUE':
        return `${event.type}:${recipientId}:${validTaskId}:${event.dueDate}`;

      case 'TASK_COLLABORATOR_INVITED': {
        const timeTag = this.formatTimestampTag(event.invitedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.invitedUserId}:${timeTag}`;
      }

      case 'TASK_COLLABORATOR_ACCEPTED':
      case 'TASK_COLLABORATOR_DECLINED': {
        const timeTag = this.formatTimestampTag(event.respondedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.actorId}:${timeTag}`;
      }

      case 'TASK_COLLABORATOR_REMOVED': {
        const timeTag = this.formatTimestampTag(event.removedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.removedUserId}:${timeTag}`;
      }

      case 'SUBTASK_ASSIGNED': {
        const timeTag = this.formatTimestampTag(event.assignedAt, event.timestamp);
        const modeTag = event.isReassigned ? 'reassign' : 'assign';
        return `${event.type}:${recipientId}:${validTaskId}:${event.subtaskId}:${event.subtaskAssigneeId}:${modeTag}:${timeTag}`;
      }

      case 'SUBTASK_UNASSIGNED': {
        const timeTag = this.formatTimestampTag(event.unassignedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.subtaskId}:${event.previousAssigneeId}:${timeTag}`;
      }

      case 'SUBTASK_STATUS_CHANGED': {
        const timeTag = this.formatTimestampTag(event.changedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.subtaskId}:${event.oldStatus}->${event.newStatus}:${timeTag}`;
      }

      case 'SUBTASK_COMPLETED': {
        const timeTag = this.formatTimestampTag(event.completedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.subtaskId}:${event.completedById}:${timeTag}`;
      }

      case 'SUBTASK_REOPENED': {
        const timeTag = this.formatTimestampTag(event.reopenedAt, event.timestamp);
        return `${event.type}:${recipientId}:${validTaskId}:${event.subtaskId}:${event.newStatus}:${timeTag}`;
      }

      case 'TASK_STATUS_CHANGED':
        return `${event.type}:${recipientId}:${validTaskId}:${event.oldStatus}->${event.newStatus}:${event.timestamp ?? event.actorId}`;

      case 'TASK_DEADLINE_CHANGED':
        return `${event.type}:${recipientId}:${validTaskId}:${event.newDueDate ?? 'none'}:${event.timestamp ?? event.actorId}`;

      case 'TASK_MOVED_TEAM':
        return `${event.type}:${recipientId}:${validTaskId}:${event.targetTeamId}:${event.timestamp ?? event.actorId}`;

      case 'TASK_UNASSIGNED':
        return `${event.type}:${recipientId}:${validTaskId}:${event.previousAssigneeId}:${event.timestamp ?? event.actorId}`;

      case 'TASK_ASSIGNED':
        return `${event.type}:${recipientId}:${validTaskId}:${event.assigneeId}:${event.timestamp ?? event.actorId}`;

      case 'TASK_RETURNED':
        return `${event.type}:${recipientId}:${validTaskId}:${event.reason}:${event.timestamp ?? event.actorId}`;

      default: {
        const deterministicTag = event.timestamp ?? event.actorId;
        return `${event.type}:${recipientId}:${validTaskId ?? teamId ?? 'global'}:${deterministicTag}`;
      }
    }
  }
}
