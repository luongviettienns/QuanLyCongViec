import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, interval, merge, map, filter } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { RealtimeBroadcastEvent } from './realtime.types.js';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly eventBus$ = new Subject<RealtimeBroadcastEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Broadcast an event to target users or team members
   */
  async emit(event: Omit<RealtimeBroadcastEvent, 'timestamp'>): Promise<void> {
    try {
      let targetUserIds = event.targetUserIds ? [...event.targetUserIds] : [];

      if (event.teamId && targetUserIds.length === 0) {
        const members = await this.prisma.teamMember.findMany({
          where: { teamId: event.teamId },
          select: { userId: true },
        });
        targetUserIds = members.map((m) => m.userId);
      }

      const fullEvent: RealtimeBroadcastEvent = {
        ...event,
        targetUserIds: targetUserIds.length > 0 ? Array.from(new Set(targetUserIds)) : undefined,
        timestamp: Date.now(),
      };

      this.eventBus$.next(fullEvent);
    } catch (err) {
      this.logger.error(`Error emitting realtime event: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Subscribe a user to their relevant real-time event stream
   */
  subscribe(userId: number): Observable<MessageEvent> {
    const userEvents$ = this.eventBus$.asObservable().pipe(
      filter((event) => {
        if (event.targetUserIds && event.targetUserIds.length > 0) {
          return event.targetUserIds.includes(userId);
        }
        return true;
      }),
      map((event) => ({
        type: event.type,
        data: {
          type: event.type,
          actorId: event.actorId,
          teamId: event.teamId,
          payload: event.payload,
          timestamp: event.timestamp,
        },
        id: String(event.timestamp),
      })),
    );

    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        type: 'HEARTBEAT',
        data: { time: Date.now() },
      })),
    );

    return merge(userEvents$, heartbeat$);
  }
}
