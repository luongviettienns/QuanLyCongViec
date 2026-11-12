import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { TeamActivityService } from '../src/modules/team-activity/team-activity.service.js';
import { configureTestApp } from './test-app.helper.js';

interface SsePacket {
  type: string;
  actorId?: number;
  teamId?: number | null;
  payload?: Record<string, unknown>;
}

interface SseSubscription {
  events: SsePacket[];
  close: () => void;
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

        resolve({ events, close, waitFor });
      },
    );

    req.on('error', reject);
  });
}

describe('Team, Member, Activity & Category Realtime Sync (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let teamActivityService: TeamActivityService;
  let baseUrl = '';
  const ts = Date.now();

  let tokenOwner = '';
  let tokenMember = '';
  let tokenTarget = '';
  let tokenOutsider = '';

  let ownerId = 0;
  let memberId = 0;
  let targetId = 0;

  let teamId = 0;
  let targetMembershipId = 0;

  const activeStreams: SseSubscription[] = [];

  async function registerUser(tag: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `trs_${tag}_${ts}@test.local`,
        name: `User ${tag}`,
        password: 'StrongPassword123!',
      })
      .expect(201);
    return {
      token: res.body.accessToken as string,
      id: res.body.user.id as number,
    };
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
    teamActivityService = app.get(TeamActivityService);

    const owner = await registerUser('Owner');
    ownerId = owner.id;
    tokenOwner = owner.token;

    const member = await registerUser('Member');
    memberId = member.id;
    tokenMember = member.token;

    const target = await registerUser('Target');
    targetId = target.id;
    tokenTarget = target.token;

    const outsider = await registerUser('Outsider');
    tokenOutsider = outsider.token;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Realtime Sync Team ${ts}`, description: 'Initial' })
      .expect(201);
    teamId = teamRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `trs_Member_${ts}@test.local`, role: 'ADMIN' })
      .expect(201);
  });

  afterEach(() => {
    while (activeStreams.length > 0) {
      activeStreams.pop()?.close();
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('emits TEAM_UPDATED on PATCH /api/teams/:id only to team members', async () => {
    const streamMember = await connectSse(baseUrl, tokenMember);
    const streamOutsider = await connectSse(baseUrl, tokenOutsider);
    activeStreams.push(streamMember, streamOutsider);

    const waitMember = streamMember.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && Number(e.payload?.teamId) === teamId,
    );

    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Renamed Sync Team ${ts}` })
      .expect(200);

    const evt = await waitMember;
    expect(evt.actorId).toBe(ownerId);
    expect(evt.teamId).toBe(teamId);

    await new Promise((r) => setTimeout(r, 150));
    expect(
      streamOutsider.events.filter((e) => e.type === 'TEAM_UPDATED' && Number(e.payload?.teamId) === teamId),
    ).toHaveLength(0);
  });

  it('emits TEAM_UPDATED and TEAM_ACTIVITY_CREATED when adding a member, reaching both existing and invited users', async () => {
    const streamMember = await connectSse(baseUrl, tokenMember);
    const streamTarget = await connectSse(baseUrl, tokenTarget);
    const streamOutsider = await connectSse(baseUrl, tokenOutsider);
    activeStreams.push(streamMember, streamTarget, streamOutsider);

    const waitMemberUpdate = streamMember.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && Number(e.payload?.teamId) === teamId && e.payload?.action === 'ADD_MEMBER',
    );
    const waitMemberActivity = streamMember.waitFor(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED' && Number(e.payload?.teamId) === teamId && e.payload?.action === 'ADD_MEMBER',
    );
    const waitTargetUpdate = streamTarget.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && Number(e.payload?.teamId) === teamId && e.payload?.action === 'ADD_MEMBER',
    );

    const addRes = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `trs_Target_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);
    targetMembershipId = addRes.body.id as number;

    await Promise.all([waitMemberUpdate, waitMemberActivity, waitTargetUpdate]);

    await new Promise((r) => setTimeout(r, 150));
    expect(
      streamOutsider.events.filter((e) => Number(e.payload?.teamId) === teamId),
    ).toHaveLength(0);
  });

  it('emits TEAM_UPDATED and TEAM_ACTIVITY_CREATED only when role actually changes (skips idempotent no-op)', async () => {
    const streamTarget = await connectSse(baseUrl, tokenTarget);
    activeStreams.push(streamTarget);

    // 1. Idempotent same-role request (MEMBER -> MEMBER) must NOT emit events
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/members/${targetMembershipId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ role: 'MEMBER' })
      .expect(200);

    await new Promise((r) => setTimeout(r, 150));
    expect(
      streamTarget.events.filter((e) => e.type === 'TEAM_UPDATED' || e.type === 'TEAM_ACTIVITY_CREATED'),
    ).toHaveLength(0);

    // 2. Real role change (MEMBER -> ADMIN) emits both
    const waitUpdate = streamTarget.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && e.payload?.action === 'CHANGE_ROLE',
    );
    const waitActivity = streamTarget.waitFor(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED' && e.payload?.action === 'CHANGE_ROLE',
    );

    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/members/${targetMembershipId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ role: 'ADMIN' })
      .expect(200);

    await Promise.all([waitUpdate, waitActivity]);
  });

  it('emits TEAM_ACTIVITY_CREATED on task/subtask activity logs and suppresses phantom SSE on rollback', async () => {
    const streamMember = await connectSse(baseUrl, tokenMember);
    activeStreams.push(streamMember);

    const waitTaskActivity = streamMember.waitFor(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED' && e.payload?.action === 'TASK_CREATED',
    );

    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ title: `Realtime Activity Task ${ts}`, teamId })
      .expect(201);

    const evt = await waitTaskActivity;
    expect(Number(evt.payload?.teamId)).toBe(teamId);

    const countBeforeRollback = streamMember.events.filter(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED',
    ).length;

    await expect(
      prisma.$transaction(async (tx) => {
        await teamActivityService.logActivity(tx, {
          teamId,
          teamName: `Renamed Sync Team ${ts}`,
          actorId: ownerId,
          action: 'TASK_UPDATED',
          metadata: { taskId: 999999, taskTitle: 'Should Rollback' },
        });
        throw new Error('Force rollback after logActivity');
      }),
    ).rejects.toThrow('Force rollback after logActivity');

    await new Promise((r) => setTimeout(r, 150));
    const countAfterRollback = streamMember.events.filter(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED',
    ).length;
    expect(countAfterRollback).toBe(countBeforeRollback);
  });

  it('emits TEAM_CATEGORY_CHANGED for team category CRUD and omits for personal categories', async () => {
    const streamMember = await connectSse(baseUrl, tokenMember);
    const streamOutsider = await connectSse(baseUrl, tokenOutsider);
    activeStreams.push(streamMember, streamOutsider);

    const waitCreate = streamMember.waitFor(
      (e) => e.type === 'TEAM_CATEGORY_CHANGED' && Number(e.payload?.teamId) === teamId,
    );

    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `RT Cat ${ts}`, color: '#1677ff', teamId })
      .expect(201);
    const catId = catRes.body.id as number;
    await waitCreate;

    const waitUpdate = streamMember.waitFor(
      (e) => e.type === 'TEAM_CATEGORY_CHANGED' && Number(e.payload?.categoryId) === catId && e.payload?.action === 'UPDATED',
    );
    await request(app.getHttpServer())
      .put(`/api/categories/${catId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `RT Cat Updated ${ts}` })
      .expect(200);
    await waitUpdate;

    const waitDelete = streamMember.waitFor(
      (e) => e.type === 'TEAM_CATEGORY_CHANGED' && Number(e.payload?.categoryId) === catId && e.payload?.action === 'DELETED',
    );
    await request(app.getHttpServer())
      .delete(`/api/categories/${catId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .expect(200);
    await waitDelete;

    // Personal category must not trigger TEAM_CATEGORY_CHANGED
    const countBeforePersonal = streamMember.events.filter((e) => e.type === 'TEAM_CATEGORY_CHANGED').length;
    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Personal Cat ${ts}`, color: '#52c41a' })
      .expect(201);

    await new Promise((r) => setTimeout(r, 150));
    expect(streamMember.events.filter((e) => e.type === 'TEAM_CATEGORY_CHANGED')).toHaveLength(
      countBeforePersonal,
    );
    expect(streamOutsider.events.filter((e) => e.type === 'TEAM_CATEGORY_CHANGED')).toHaveLength(0);
  });

  it('emits TEAM_UPDATED to removed user & remaining members on removeMember, and restricts TEAM_ACTIVITY_CREATED to remaining members', async () => {
    const streamMember = await connectSse(baseUrl, tokenMember);
    const streamTarget = await connectSse(baseUrl, tokenTarget);
    activeStreams.push(streamMember, streamTarget);

    const waitMemberUpdate = streamMember.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && e.payload?.action === 'REMOVE_MEMBER',
    );
    const waitMemberActivity = streamMember.waitFor(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED' && e.payload?.action === 'REMOVE_MEMBER',
    );
    const waitTargetUpdate = streamTarget.waitFor(
      (e) =>
        e.type === 'TEAM_UPDATED' &&
        e.payload?.action === 'REMOVE_MEMBER' &&
        Number(e.payload?.removedUserId) === targetId,
    );

    await request(app.getHttpServer())
      .delete(`/api/teams/${teamId}/members/${targetMembershipId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .expect(200);

    await Promise.all([waitMemberUpdate, waitMemberActivity, waitTargetUpdate]);

    // Removed user must NOT receive REMOVE_MEMBER team activity log or subsequent team events
    expect(
      streamTarget.events.filter(
        (e) => e.type === 'TEAM_ACTIVITY_CREATED' && Number(e.payload?.teamId) === teamId,
      ),
    ).toHaveLength(0);
  });

  it('emits TEAM_UPDATED and TEAM_ACTIVITY_CREATED on ownership transfer', async () => {
    // Re-add Target and transfer ownership on a clean team
    const transferTeamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Transfer RT Team ${ts}` })
      .expect(201);
    const transferTeamId = transferTeamRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/teams/${transferTeamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `trs_Member_${ts}@test.local`, role: 'ADMIN' })
      .expect(201);

    const streamMember = await connectSse(baseUrl, tokenMember);
    activeStreams.push(streamMember);

    const waitUpdate = streamMember.waitFor(
      (e) => e.type === 'TEAM_UPDATED' && Number(e.payload?.teamId) === transferTeamId && e.payload?.action === 'TRANSFER_OWNER',
    );
    const waitActivity = streamMember.waitFor(
      (e) => e.type === 'TEAM_ACTIVITY_CREATED' && Number(e.payload?.teamId) === transferTeamId && e.payload?.action === 'TRANSFER_OWNER',
    );

    await request(app.getHttpServer())
      .patch(`/api/teams/${transferTeamId}/transfer-ownership`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ newOwnerId: memberId })
      .expect(200);

    await Promise.all([waitUpdate, waitActivity]);
  });

  it('emits TEAM_DELETED to all members captured before team row deletion', async () => {
    const deleteTeamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Delete RT Team ${ts}` })
      .expect(201);
    const deleteTeamId = deleteTeamRes.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/teams/${deleteTeamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `trs_Member_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);

    const streamMember = await connectSse(baseUrl, tokenMember);
    const streamOutsider = await connectSse(baseUrl, tokenOutsider);
    activeStreams.push(streamMember, streamOutsider);

    const waitDeleted = streamMember.waitFor(
      (e) => e.type === 'TEAM_DELETED' && Number(e.payload?.teamId) === deleteTeamId,
    );

    await request(app.getHttpServer())
      .delete(`/api/teams/${deleteTeamId}`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .expect(200);

    const evt = await waitDeleted;
    expect(evt.actorId).toBe(ownerId);

    await new Promise((r) => setTimeout(r, 150));
    expect(
      streamOutsider.events.filter((e) => e.type === 'TEAM_DELETED' && Number(e.payload?.teamId) === deleteTeamId),
    ).toHaveLength(0);
  });
});
