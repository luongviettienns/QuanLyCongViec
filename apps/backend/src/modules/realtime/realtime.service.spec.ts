import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeService } from './realtime.service.js';
import { firstValueFrom } from 'rxjs';

describe('RealtimeService', () => {
  let service: RealtimeService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      team: {
        findUnique: vi.fn(),
      },
      teamMember: {
        findMany: vi.fn(),
      },
    };
    service = new RealtimeService(mockPrisma);
  });

  it('delivers events to target user matching userId', async () => {
    const userId = 10;
    const stream$ = service.subscribe(userId);

    const receivedPromise = firstValueFrom(stream$);

    await service.emit({
      type: 'TASK_STATUS_CHANGED',
      actorId: 2,
      targetUserIds: [10, 20],
      payload: { taskId: 1, status: 'DONE' },
    });

    const received = await receivedPromise;
    expect(received.type).toBe('TASK_STATUS_CHANGED');
    expect(received.data).toEqual(
      expect.objectContaining({
        type: 'TASK_STATUS_CHANGED',
        actorId: 2,
        payload: { taskId: 1, status: 'DONE' },
      }),
    );
  });

  it('filters out events when user is not in targetUserIds', async () => {
    const userA = 10;
    const userB = 20;

    const streamB$ = service.subscribe(userB);

    let receivedB = false;
    const sub = streamB$.subscribe(() => {
      receivedB = true;
    });

    // Emit event targeted only to userA
    await service.emit({
      type: 'TASK_STATUS_CHANGED',
      actorId: 1,
      targetUserIds: [userA],
      payload: { taskId: 99 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(receivedB).toBe(false);
    sub.unsubscribe();
  });

  it('resolves team members automatically when teamId is provided without targetUserIds', async () => {
    mockPrisma.team.findUnique.mockResolvedValue({
      ownerId: 50,
      members: [
        { userId: 100 },
        { userId: 200 },
      ],
    });

    const stream$ = service.subscribe(100);
    const receivedPromise = firstValueFrom(stream$);

    await service.emit({
      type: 'TASK_UPDATED',
      actorId: 100,
      teamId: 5,
      payload: { taskId: 12 },
    });

    expect(mockPrisma.team.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: {
        ownerId: true,
        members: { select: { userId: true } },
      },
    });

    const received = await receivedPromise;
    expect(received.type).toBe('TASK_UPDATED');
    expect((received.data as any).payload.taskId).toBe(12);
  });

  it('does NOT broadcast to non-recipients when targetUserIds is empty and no teamId is provided', async () => {
    const userUnrelated = 999;
    const stream$ = service.subscribe(userUnrelated);

    let received = false;
    const sub = stream$.subscribe(() => {
      received = true;
    });

    await service.emit({
      type: 'TASK_UPDATED',
      actorId: 1,
      targetUserIds: [],
      payload: { taskId: 10 },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(received).toBe(false);
    sub.unsubscribe();
  });
});
