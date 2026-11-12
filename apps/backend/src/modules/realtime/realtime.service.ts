import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable, interval, merge, map, filter, timer, takeUntil } from 'rxjs';
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
        const team = await this.prisma.team.findUnique({
          where: { id: event.teamId },
          select: {
            ownerId: true,
            members: { select: { userId: true } },
          },
        });
        if (team) {
          targetUserIds = [team.ownerId, ...team.members.map((m) => m.userId)];
        }
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
   * Subscribe a user to their relevant real-time event stream.
   * If `tokenExp` (UNIX expiration in seconds) is provided, the stream
   * automatically completes once the token expires, preventing expired
   * credentials from keeping a server-sent events stream open indefinitely.
   */
  subscribe(userId: number, tokenExp?: number): Observable<MessageEvent> {
    const userEvents$ = this.eventBus$.asObservable().pipe(
      filter((event) => {
        if (event.targetUserIds && event.targetUserIds.length > 0) {
          return event.targetUserIds.includes(userId);
        }
        // An toàn: Không bao giờ broadcast cho tất cả người dùng khi không có danh sách người nhận
        if (event.actorId) {
          return event.actorId === userId;
        }
        return false;
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

    let stream$: Observable<MessageEvent> = merge(userEvents$, heartbeat$);

    if (typeof tokenExp === 'number' && Number.isFinite(tokenExp)) {
      const expMs = tokenExp > 1e11 ? tokenExp : tokenExp * 1000;
      const remainingMs = Math.max(0, expMs - Date.now());
      stream$ = stream$.pipe(takeUntil(timer(remainingMs)));
    }

    return stream$;
  }
}
