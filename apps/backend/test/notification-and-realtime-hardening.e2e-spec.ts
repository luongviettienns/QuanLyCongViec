import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NotificationEventService } from '../src/modules/notifications/services/notification-event.service.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { configureTestApp } from './test-app.helper.js';
import { JwtService } from '@nestjs/jwt';

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  content: string;
  taskId: number | null;
  subtaskId: number | null;
  teamId: number | null;
  actorId: number | null;
  eventKey: string | null;
  isRead: boolean;
}

interface SsePacket {
  type: string;
  actorId: number;
  teamId?: number | null;
  payload?: Record<string, unknown>;
}

interface SseSubscription {
  events: SsePacket[];
  close: () => void;
  isClosed: () => boolean;
  waitFor: (
    predicate: (evt: SsePacket) => boolean,
    timeoutMs?: number,
  ) => Promise<SsePacket>;
}

function connectSse(baseUrl: string, token: string): Promise<SseSubscription> {
  return new Promise((resolve, reject) => {
    const events: SsePacket[] = [];
    const waiters: Array<{
      predicate: (evt: SsePacket) => boolean;
      resolve: (evt: SsePacket) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }> = [];

    const req = http.get(
      `${baseUrl}/api/realtime/stream`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
      (res) => {
      if (res.statusCode !== 200) {
        req.destroy();
        reject(new Error(`SSE connection rejected with status ${res.statusCode ?? 'unknown'}`));
        return;
      }

      let buffer = '';
      let ended = false;
      res.on('end', () => {
        ended = true;
      });
      res.on('close', () => {
        ended = true;
      });
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const jsonText = line.slice(5).trim();
            if (!jsonText) continue;
            try {
              const parsed = JSON.parse(jsonText) as SsePacket;
              events.push(parsed);
              for (let i = waiters.length - 1; i >= 0; i -= 1) {
                const waiter = waiters[i];
                if (waiter.predicate(parsed)) {
                  clearTimeout(waiter.timer);
                  waiters.splice(i, 1);
                  waiter.resolve(parsed);
                }
              }
            } catch {
              // ignore heartbeat / non-json comments
            }
          }
        }
      });

      const close = () => {
        for (const waiter of waiters.splice(0, waiters.length)) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error('SSE stream closed before matching event'));
        }
        res.destroy();
        req.destroy();
      };

      const waitFor = (predicate: (evt: SsePacket) => boolean, timeoutMs = 4000) => {
        const existing = events.find(predicate);
        if (existing) {
          return Promise.resolve(existing);
        }
        return new Promise<SsePacket>((resWaiter, rejWaiter) => {
          const timer = setTimeout(() => {
            const idx = waiters.findIndex((w) => w.timer === timer);
            if (idx >= 0) waiters.splice(idx, 1);
            rejWaiter(new Error(`Timed out waiting for SSE event after ${timeoutMs}ms`));
          }, timeoutMs);
          waiters.push({ predicate, resolve: resWaiter, reject: rejWaiter, timer });
        });
      };

      resolve({ events, close, isClosed: () => ended, waitFor });
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

describe('Phase 2 & 3: Notification & Realtime Hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let notificationEventService: NotificationEventService;
  let realtimeService: RealtimeService;
  let baseUrl = '';
  const ts = Date.now();

  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let tokenM = '';
  let tokenO = '';

  let userAId = 0;
  let userBId = 0;
  let userCId = 0;
  let userMId = 0;
  let userOId = 0;

  let teamId = 0;
  let secondaryTeamId = 0;
  let taskId = 0;

  const activeStreams: SseSubscription[] = [];

  async function registerUser(tag: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `p23_${tag}_${ts}@test.local`,
        name: `User ${tag}`,
        password: 'StrongPassword123!',
      })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as number,
    };
  }

  async function fetchNotifications(token: string): Promise<NotificationRow[]> {
    const res = await request(app.getHttpServer())
      .get('/api/notifications?limit=50')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.items as NotificationRow[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.listen(0);

    const address = (app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    notificationEventService = app.get(NotificationEventService);
    realtimeService = app.get(RealtimeService);

    const a = await registerUser('CreatorA');
    userAId = a.id;
    tokenA = a.token;

    const b = await registerUser('AssigneeB');
    userBId = b.id;
    tokenB = b.token;

    const c = await registerUser('CollabC');
    userCId = c.id;
    tokenC = c.token;

    const m = await registerUser('MemberM');
    userMId = m.id;
    tokenM = m.token;

    const o = await registerUser('OutsiderO');
    userOId = o.id;
    tokenO = o.token;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `P23 Primary Team ${ts}` })
      .expect(201);
    teamId = teamRes.body.id as number;

    for (const member of [
      { email: `p23_AssigneeB_${ts}@test.local`, role: 'MEMBER' },
      { email: `p23_CollabC_${ts}@test.local`, role: 'MEMBER' },
      { email: `p23_MemberM_${ts}@test.local`, role: 'MEMBER' },
    ]) {
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send(member)
        .expect(201);
    }

    const secondTeamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `P23 Secondary Team ${ts}` })
      .expect(201);
    secondaryTeamId = secondTeamRes.body.id as number;

    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        title: `P23 Parent Task ${ts}`,
        teamId,
        assigneeId: userBId,
      })
      .expect(201);
    taskId = taskRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/collaborators`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ userId: userCId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/collaborators/respond`)
      .set('Authorization', `Bearer ${tokenC}`)
      .send({ action: 'ACCEPT' })
      .expect(201);
  });

  afterEach(() => {
    while (activeStreams.length > 0) {
      activeStreams.pop()?.close();
    }
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Phase 2: Subtask Notification Lifecycle & Recipient Matrix', () => {
    let lifecycleSubtaskId = 0;

    it('creates assigned subtask with subtaskId populated, notifying only assignee (not actor)', async () => {
      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          title: 'Subtask Alpha Lifecycle',
          assigneeId: userCId,
        })
        .expect(201);

      lifecycleSubtaskId = subRes.body.id as number;

      const notifsC = await fetchNotifications(tokenC);
      const assignedC = notifsC.find(
        (n) => n.type === 'SUBTASK_ASSIGNED' && n.taskId === taskId && n.subtaskId === lifecycleSubtaskId,
      );
      expect(assignedC).toBeDefined();
      expect(assignedC?.content).toContain('Subtask Alpha Lifecycle');
      expect(assignedC?.content).toContain(`P23 Parent Task ${ts}`);

      const notifsB = await fetchNotifications(tokenB);
      expect(notifsB.some((n) => n.subtaskId === lifecycleSubtaskId && n.type === 'SUBTASK_ASSIGNED')).toBe(
        false,
      );
    });

    it('notifies Creator A & Main Assignee B (not actor C or unrelated Member M) on TODO -> IN_PROGRESS', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}/status`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const [notifsA, notifsB, notifsC, notifsM] = await Promise.all([
        fetchNotifications(tokenA),
        fetchNotifications(tokenB),
        fetchNotifications(tokenC),
        fetchNotifications(tokenM),
      ]);

      expect(
        notifsA.some(
          (n) =>
            n.type === 'SUBTASK_STATUS_CHANGED' &&
            n.taskId === taskId &&
            n.subtaskId === lifecycleSubtaskId,
        ),
      ).toBe(true);
      expect(
        notifsB.some(
          (n) =>
            n.type === 'SUBTASK_STATUS_CHANGED' &&
            n.taskId === taskId &&
            n.subtaskId === lifecycleSubtaskId,
        ),
      ).toBe(true);
      expect(
        notifsC.some((n) => n.type === 'SUBTASK_STATUS_CHANGED' && n.subtaskId === lifecycleSubtaskId),
      ).toBe(false);
      expect(
        notifsM.some((n) => n.taskId === taskId && n.subtaskId === lifecycleSubtaskId),
      ).toBe(false);
    });

    it('notifies Creator A & Main Assignee B with completer identity on IN_PROGRESS -> DONE', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}/status`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ status: 'DONE' })
        .expect(200);

      const [notifsA, notifsB, notifsC, notifsM] = await Promise.all([
        fetchNotifications(tokenA),
        fetchNotifications(tokenB),
        fetchNotifications(tokenC),
        fetchNotifications(tokenM),
      ]);

      const completedForB = notifsB.find(
        (n) =>
          n.type === 'SUBTASK_COMPLETED' &&
          n.taskId === taskId &&
          n.subtaskId === lifecycleSubtaskId,
      );
      expect(completedForB).toBeDefined();
      expect(completedForB?.actorId).toBe(userCId);
      expect(completedForB?.content).toContain('User CollabC');
      expect(completedForB?.content).toContain('Subtask Alpha Lifecycle');

      expect(
        notifsA.some(
          (n) =>
            n.type === 'SUBTASK_COMPLETED' &&
            n.taskId === taskId &&
            n.subtaskId === lifecycleSubtaskId,
        ),
      ).toBe(true);
      expect(
        notifsC.some((n) => n.type === 'SUBTASK_COMPLETED' && n.subtaskId === lifecycleSubtaskId),
      ).toBe(false);
      expect(notifsM.some((n) => n.type === 'SUBTASK_COMPLETED')).toBe(false);
    });

    it('forbids unauthorized Collaborator C and Member M from reopening DONE subtask and creates no notifications', async () => {
      const beforeCount = await prisma.notification.count({
        where: { taskId, subtaskId: lifecycleSubtaskId, type: 'SUBTASK_REOPENED' },
      });

      // Collaborator C tries to reopen DONE subtask -> 400 workflow block
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}/status`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);

      // Regular non-collaborator Member M tries -> 403 Forbidden
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}/status`)
        .set('Authorization', `Bearer ${tokenM}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);

      const afterCount = await prisma.notification.count({
        where: { taskId, subtaskId: lifecycleSubtaskId, type: 'SUBTASK_REOPENED' },
      });
      expect(afterCount).toBe(beforeCount);
    });

    it('notifies Assignee C and Creator A with reopen text when Manager B reopens DONE -> IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}/status`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.completedById).toBeNull();
      expect(res.body.completedAt).toBeNull();

      const [notifsA, notifsC, notifsB] = await Promise.all([
        fetchNotifications(tokenA),
        fetchNotifications(tokenC),
        fetchNotifications(tokenB),
      ]);

      const reopenC = notifsC.find(
        (n) =>
          n.type === 'SUBTASK_REOPENED' &&
          n.taskId === taskId &&
          n.subtaskId === lifecycleSubtaskId,
      );
      expect(reopenC).toBeDefined();
      expect(reopenC?.content.toLowerCase()).toContain('mở lại');

      expect(
        notifsA.some(
          (n) =>
            n.type === 'SUBTASK_REOPENED' &&
            n.taskId === taskId &&
            n.subtaskId === lifecycleSubtaskId,
        ),
      ).toBe(true);
      expect(
        notifsB.some((n) => n.type === 'SUBTASK_REOPENED' && n.subtaskId === lifecycleSubtaskId),
      ).toBe(false);
    });

    it('distinguishes Manager completing subtask on behalf of Collaborator C', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${lifecycleSubtaskId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ status: 'DONE' })
        .expect(200);

      const notifsC = await fetchNotifications(tokenC);
      const completedOnBehalf = notifsC.find(
        (n) =>
          n.type === 'SUBTASK_COMPLETED' &&
          n.subtaskId === lifecycleSubtaskId &&
          n.actorId === userBId,
      );
      expect(completedOnBehalf).toBeDefined();
      expect(completedOnBehalf?.content).toContain('User AssigneeB');
    });

    it('handles reassign (C -> B) with old assignee unassigned notice & new assignee reassigned notice, and handles unassign (B -> null)', async () => {
      const reassignSub = await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Subtask Reassign Flow', assigneeId: userCId })
        .expect(201);
      const subId = reassignSub.body.id as number;

      // Same-assignee PATCH must emit no extra assignment/unassignment notifications
      const beforeSameCount = await prisma.notification.count({
        where: { taskId, subtaskId: subId },
      });
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${subId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: userCId })
        .expect(200);
      const afterSameCount = await prisma.notification.count({
        where: { taskId, subtaskId: subId },
      });
      expect(afterSameCount).toBe(beforeSameCount);

      // Reassign C -> Main Assignee B (actor is Creator A, so both C and B get notified)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${subId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: userBId })
        .expect(200);

      const [notifsC, notifsB] = await Promise.all([
        fetchNotifications(tokenC),
        fetchNotifications(tokenB),
      ]);

      const unassignedForC = notifsC.find(
        (n) => n.type === 'SUBTASK_UNASSIGNED' && n.subtaskId === subId,
      );
      expect(unassignedForC).toBeDefined();

      const reassignedForB = notifsB.find(
        (n) => n.type === 'SUBTASK_ASSIGNED' && n.subtaskId === subId,
      );
      expect(reassignedForB).toBeDefined();
      expect(reassignedForB?.title.toLowerCase()).toContain('giao lại');

      // Unassign B -> null (actor is A)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/subtasks/${subId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: null })
        .expect(200);

      const notifsBAfter = await fetchNotifications(tokenB);
      expect(
        notifsBAfter.some(
          (n) => n.type === 'SUBTASK_UNASSIGNED' && n.subtaskId === subId && n.actorId === userAId,
        ),
      ).toBe(true);
    });

    it('notifies affected subtask recipients on Main Assignee handover AND suppresses notifications/SSE on rollback', async () => {
      const handoverTaskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `P23 Handover Task ${ts}`, teamId, assigneeId: userBId })
        .expect(201);
      const handoverTaskId = handoverTaskRes.body.id as number;

      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${handoverTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Handover Active Subtask', assigneeId: userBId })
        .expect(201);
      const handoverSubId = subRes.body.id as number;

      // Change Main Assignee B -> Member M (actor is Owner A)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${handoverTaskId}/assignee`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: userMId })
        .expect(200);

      const [notifsB, notifsM] = await Promise.all([
        fetchNotifications(tokenB),
        fetchNotifications(tokenM),
      ]);

      expect(
        notifsB.some((n) => n.type === 'SUBTASK_UNASSIGNED' && n.subtaskId === handoverSubId),
      ).toBe(true);
      expect(
        notifsM.some((n) => n.type === 'SUBTASK_ASSIGNED' && n.subtaskId === handoverSubId),
      ).toBe(true);

      // Rollback guarantee: failed transaction saves 0 notifications & emits 0 SSE events
      const emitSpy = vi.spyOn(realtimeService, 'emit');
      const countBeforeRollback = await prisma.notification.count({
        where: { taskId: handoverTaskId },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await notificationEventService.publish(
            {
              type: 'SUBTASK_COMPLETED',
              actorId: userMId,
              taskId: handoverTaskId,
              subtaskId: handoverSubId,
              taskTitle: `P23 Handover Task ${ts}`,
              subtaskTitle: 'Handover Active Subtask',
              creatorId: userAId,
              assigneeId: userMId,
              teamId,
              completedById: userMId,
              idempotencyKey: `rollback-${Date.now()}`,
            },
            tx,
          );
          throw new Error('Simulated transaction failure');
        }),
      ).rejects.toThrow('Simulated transaction failure');

      const countAfterRollback = await prisma.notification.count({
        where: { taskId: handoverTaskId },
      });
      expect(countAfterRollback).toBe(countBeforeRollback);
      expect(emitSpy).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2: Atomic Idempotency & Zero Phantom SSE', () => {
    it('prevents concurrent duplicate inserts AND emits ZERO phantom SSE events for duplicate eventKey', async () => {
      const emitSpy = vi.spyOn(realtimeService, 'emit');
      const fixedStamp = `conc-${Date.now()}`;

      await Promise.all([
        notificationEventService.publish({
          type: 'SUBTASK_COMPLETED',
          actorId: userCId,
          taskId,
          subtaskId: 99991,
          taskTitle: `P23 Parent Task ${ts}`,
          subtaskTitle: 'Concurrent Atomic Check',
          creatorId: userAId,
          assigneeId: userBId,
          teamId,
          idempotencyKey: fixedStamp,
        } as never),
        notificationEventService.publish({
          type: 'SUBTASK_COMPLETED',
          actorId: userCId,
          taskId,
          subtaskId: 99991,
          taskTitle: `P23 Parent Task ${ts}`,
          subtaskTitle: 'Concurrent Atomic Check',
          creatorId: userAId,
          assigneeId: userBId,
          teamId,
          idempotencyKey: fixedStamp,
        } as never),
      ]);

      const dbCount = await prisma.notification.count({
        where: {
          taskId,
          eventKey: { contains: fixedStamp },
        },
      });
      // A and B are recipients (2 notifications once, NOT 4)
      expect(dbCount).toBe(2);

      const notifCalls = emitSpy.mock.calls.filter(([evt]) => evt.type === 'NOTIFICATION_NEW');
      expect(notifCalls).toHaveLength(2);
    });
  });

  describe('Phase 3: Realtime Completeness, Multi-User Sync & SSE Security', () => {
    it('rejects unauthenticated, invalid JWT, or JWT without exp from connecting to SSE', async () => {
      await expect(connectSse(baseUrl, '')).rejects.toThrow(/401/);
      await expect(connectSse(baseUrl, 'invalid.jwt.token')).rejects.toThrow(/401/);

      // Token without exp claim must be rejected with 401 on SSE endpoint
      const rawJwtService = new JwtService({ secret: process.env.JWT_SECRET });
      const tokenWithoutExp = rawJwtService.sign({
        sub: userAId,
        email: `p23_CreatorA_${ts}@test.local`,
      });
      await expect(connectSse(baseUrl, tokenWithoutExp)).rejects.toThrow(/401/);

      expect(userOId).toBeGreaterThan(0);
    });

    it('emits TASK_ASSIGNED and TASK_RETURNED realtime events post-commit on dedicated endpoints', async () => {
      const streamA = await connectSse(baseUrl, tokenA);
      const streamB = await connectSse(baseUrl, tokenB);
      const streamO = await connectSse(baseUrl, tokenO);
      activeStreams.push(streamA, streamB, streamO);

      // Dedicated task created by A for reassignment & return testing
      const tRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: `P23 Assign Return ${ts}`,
          teamId,
          assigneeId: userCId,
        })
        .expect(201);
      const rtTaskId = tRes.body.id as number;

      // Change main assignee via PATCH /api/tasks/:id/assignee -> MUST emit TASK_ASSIGNED
      await request(app.getHttpServer())
        .patch(`/api/tasks/${rtTaskId}/assignee`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: userBId })
        .expect(200);

      const assignedEvt = await streamB.waitFor(
        (evt) =>
          evt.type === 'TASK_ASSIGNED' &&
          Number((evt.payload as { taskId?: number })?.taskId) === rtTaskId,
      );
      expect(assignedEvt.actorId).toBe(userAId);

      // Return task via PATCH /api/tasks/:id/return -> MUST emit TASK_RETURNED
      await request(app.getHttpServer())
        .patch(`/api/tasks/${rtTaskId}/return`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ reason: 'Thiếu thông tin chi tiết' })
        .expect(200);

      const returnedEvt = await streamA.waitFor(
        (evt) =>
          evt.type === 'TASK_RETURNED' &&
          Number((evt.payload as { taskId?: number })?.taskId) === rtTaskId,
      );
      expect(returnedEvt.actorId).toBe(userBId);

      // Outsider O MUST NOT receive any of those team task events
      expect(streamO.events.some((e) => Number(e.payload?.taskId) === rtTaskId)).toBe(false);
    });

    it('notifies source team members when a task is moved out to another team (so source UI drops stale card)', async () => {
      const movableRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `P23 Movable Task ${ts}`, teamId })
        .expect(201);
      const movableId = movableRes.body.id as number;

      const streamM = await connectSse(baseUrl, tokenM);
      activeStreams.push(streamM);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${movableId}/team`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ teamId: secondaryTeamId })
        .expect(200);

      const sourceTeamEvt = await streamM.waitFor(
        (evt) =>
          (evt.type === 'TASK_UPDATED' || evt.type === 'TASK_DELETED') &&
          Number(evt.payload?.taskId) === movableId,
      );
      expect(sourceTeamEvt).toBeDefined();
    });

    it('delivers bulk subtask unassignment notices when collaborator with active subtasks is removed', async () => {
      const bulkTaskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `P23 Bulk Unassign Task ${ts}`, teamId, assigneeId: userBId })
        .expect(201);
      const bulkTaskId = bulkTaskRes.body.id as number;

      await request(app.getHttpServer())
        .post(`/api/tasks/${bulkTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userCId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${bulkTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${bulkTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Bulk Affected Subtask', assigneeId: userCId })
        .expect(201);
      const bulkSubId = subRes.body.id as number;

      // Owner revokes Collaborator C -> should clear subtask assigneeId AND notify C + emit SUBTASK_UPDATED
      const streamB = await connectSse(baseUrl, tokenB);
      activeStreams.push(streamB);

      await request(app.getHttpServer())
        .delete(`/api/tasks/${bulkTaskId}/collaborators/${userCId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await streamB.waitFor(
        (evt) =>
          evt.type === 'SUBTASK_UPDATED' &&
          Number(evt.payload?.taskId) === bulkTaskId &&
          Number(evt.payload?.subtaskId) === bulkSubId,
      );

      const notifsC = await fetchNotifications(tokenC);
      expect(
        notifsC.some((n) => n.type === 'SUBTASK_UNASSIGNED' && n.subtaskId === bulkSubId),
      ).toBe(true);
    });

    it('minimizes movedOut payload & blocks source member/removed collaborator from post-move SSE events', async () => {
      const movableRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `P23 Isolation Move Task ${ts}`, teamId, assigneeId: userBId })
        .expect(201);
      const secMoveId = movableRes.body.id as number;

      await request(app.getHttpServer())
        .post(`/api/tasks/${secMoveId}/collaborators`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: userCId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${secMoveId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenC}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      const streamM = await connectSse(baseUrl, tokenM);
      const streamC = await connectSse(baseUrl, tokenC);
      activeStreams.push(streamM, streamC);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${secMoveId}/team`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ teamId: secondaryTeamId })
        .expect(200);

      const moveSignal = await streamM.waitFor(
        (evt) =>
          evt.type === 'TASK_UPDATED' &&
          Number(evt.payload?.taskId) === secMoveId,
      );
      expect(moveSignal.payload).toEqual({ taskId: secMoveId, movedOut: true });

      const countMBeforePostMove = streamM.events.length;
      const countCBeforePostMove = streamC.events.length;

      // Update task and create subtask in destination secondaryTeamId (neither M nor C belongs here)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${secMoveId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Post Move Secret Title' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/tasks/${secMoveId}/subtasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Post Move Secret Subtask' })
        .expect(201);

      await new Promise((r) => setTimeout(r, 150));

      const leakedForM = streamM.events
        .slice(countMBeforePostMove)
        .filter((e) => Number(e.payload?.taskId) === secMoveId && !e.payload?.movedOut);
      const leakedForC = streamC.events
        .slice(countCBeforePostMove)
        .filter((e) => Number(e.payload?.taskId) === secMoveId && !e.payload?.movedOut);

      expect(leakedForM).toEqual([]);
      expect(leakedForC).toEqual([]);
    });

    it('stops delivering team task SSE events after member removal AND clears assigned subtasks', async () => {
      const removed = await registerUser('RemovedR');
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ email: `p23_RemovedR_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      const removedMembership = await prisma.teamMember.findFirstOrThrow({
        where: { teamId, userId: removed.id },
      });

      const streamR = await connectSse(baseUrl, removed.token);
      const streamB = await connectSse(baseUrl, tokenB);
      activeStreams.push(streamR, streamB);

      const remTaskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `P23 Removal Task ${ts}`, teamId, assigneeId: removed.id })
        .expect(201);
      const remTaskId = remTaskRes.body.id as number;

      await streamR.waitFor(
        (evt) => evt.type === 'TASK_CREATED' && Number(evt.payload?.taskId) === remTaskId,
      );

      const remSubRes = await request(app.getHttpServer())
        .post(`/api/tasks/${remTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Removed Member Subtask', assigneeId: removed.id })
        .expect(201);
      const remSubId = remSubRes.body.id as number;

      // Also invite user R as collaborator on taskId (status: PENDING)
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ userId: removed.id })
        .expect(201);

      // Remove user R from team -> clears subtask assigneeId, revokes collaborators & emits realtime events
      await request(app.getHttpServer())
        .delete(`/api/teams/${teamId}/members/${removedMembership.id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Stream B (Manager) must receive TASK_COLLABORATORS_CHANGED with REVOKED status
      await streamB.waitFor(
        (evt) =>
          evt.type === 'TASK_COLLABORATORS_CHANGED' &&
          Number(evt.payload?.taskId) === taskId &&
          Number(evt.payload?.userId) === removed.id &&
          evt.payload?.status === 'REVOKED',
      );

      const revokedCollab = await prisma.taskCollaborator.findFirst({
        where: { taskId, userId: removed.id },
      });
      expect(revokedCollab?.status).toBe('REVOKED');

      await streamB.waitFor(
        (evt) =>
          evt.type === 'SUBTASK_UPDATED' &&
          Number(evt.payload?.taskId) === remTaskId &&
          Number(evt.payload?.subtaskId) === remSubId,
      );

      const countRBeforeFuture = streamR.events.length;

      // Future task creation & updates in teamId must NOT reach removed user R
      const secretRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `Post Removal Secret Task ${ts}`, teamId })
        .expect(201);
      const secretTaskId = secretRes.body.id as number;

      await request(app.getHttpServer())
        .patch(`/api/tasks/${remTaskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: `Updated After Member Removal ${ts}` })
        .expect(200);

      await new Promise((r) => setTimeout(r, 150));

      const leakedR = streamR.events
        .slice(countRBeforeFuture)
        .filter(
          (e) =>
            Number(e.payload?.taskId) === secretTaskId ||
            Number(e.payload?.taskId) === remTaskId,
        );
      expect(leakedR).toEqual([]);

      // Verify subtask assigneeId was cleared in DB
      const subListRes = await request(app.getHttpServer())
        .get(`/api/tasks/${remTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const subAfter = (subListRes.body as Array<{ id: number; assigneeId: number | null }>).find(
        (s) => s.id === remSubId,
      );
      expect(subAfter?.assigneeId).toBeNull();

      // User removed from team receives TEAM_MEMBER_REMOVED
      // and ZERO subtask unassignment notifications (no spam, no data leak)
      const notifsR = await fetchNotifications(removed.token);
      expect(notifsR.some((n) => n.type === 'TEAM_MEMBER_REMOVED')).toBe(true);
      expect(notifsR.filter((n) => n.type === 'SUBTASK_UNASSIGNED')).toHaveLength(0);
    });

    it('automatically terminates SSE stream when token exp is reached', async () => {
      const jwtService = app.get(JwtService);
      const shortLivedToken = jwtService.sign(
        { sub: userAId, email: `p23_CreatorA_${ts}@test.local` },
        { expiresIn: '1s' },
      );

      const stream = await connectSse(baseUrl, shortLivedToken);
      activeStreams.push(stream);

      expect(stream.isClosed()).toBe(false);

      // Wait until token expires (1s + margin)
      await new Promise((r) => setTimeout(r, 1400));
      expect(stream.isClosed()).toBe(true);
    });
  });
});
