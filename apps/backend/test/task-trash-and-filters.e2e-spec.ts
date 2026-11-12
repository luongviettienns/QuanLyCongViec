import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Task Trash, Permanent Delete & Advanced Filters (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  let ownerToken: string;
  let ownerId: number;
  let adminToken: string;
  let adminId: number;
  let memberToken: string;
  let memberId: number;
  let outsiderToken: string;
  let outsiderId: number;
  let teamId: number;
  const runId = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestApp(app);
    await app.init();
    await app.listen(0);
    const addr = (app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
    prisma = app.get(PrismaService);

    const register = async (prefix: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `${prefix}_${runId}@example.com`,
          name: `${prefix} User`,
          password: 'Password123!',
        });
      return {
        token: res.body.accessToken as string,
        id: res.body.user.id as number,
        email: res.body.user.email as string,
      };
    };

    const owner = await register('trash_owner');
    const admin = await register('trash_admin');
    const member = await register('trash_member');
    const outsider = await register('trash_outsider');
    ownerToken = owner.token;
    ownerId = owner.id;
    adminToken = admin.token;
    adminId = admin.id;
    memberToken = member.token;
    memberId = member.id;
    outsiderToken = outsider.token;
    outsiderId = outsider.id;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Trash Team ${runId}` });
    teamId = teamRes.body.id;

    const addAdminRes = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: admin.email });
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/members/${addAdminRes.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'ADMIN' });

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: member.email });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { teamId },
            { userId: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.teamActivityLog.deleteMany({
        where: {
          OR: [
            { teamId },
            { teamIdSnapshot: teamId },
            { actorId: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.taskCollaborator.deleteMany({
        where: {
          OR: [
            { task: { teamId } },
            { userId: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.subtask.deleteMany({
        where: {
          OR: [
            { task: { teamId } },
            { createdById: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.task.deleteMany({
        where: {
          OR: [
            { teamId },
            { userId: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.category.deleteMany({
        where: {
          OR: [
            { teamId },
            { userId: { in: [ownerId, adminId, memberId, outsiderId] } },
          ],
        },
      });
      await prisma.teamMember.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.user.deleteMany({
        where: { id: { in: [ownerId, adminId, memberId, outsiderId] } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  it('GET /api/tasks/trash lists soft-deleted tasks with deletedBy and enforces team isolation', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: `Trash Item ${runId}`, teamId });
    const taskId = createRes.body.id as number;

    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    const ownerTrash = await request(app.getHttpServer())
      .get(`/api/tasks/trash?teamId=${teamId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const found = (ownerTrash.body as Array<{ id: number; deletedBy?: { id: number } }>).find(
      (t) => t.id === taskId,
    );
    expect(found).toBeDefined();
    expect(found?.deletedBy?.id).toBe(memberId);

    await request(app.getHttpServer())
      .get(`/api/tasks/trash?teamId=${teamId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it('DELETE /api/tasks/:id/permanent requires soft-delete, enforces RBAC, cascades subtasks, and emits SSE', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: `Permanent Delete Target ${runId}`, teamId });
    const taskId = createRes.body.id as number;

    // Active task cannot be permanently deleted directly
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}/permanent`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    // Soft-delete first
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);

    // Regular member (even creator) cannot permanently delete team task
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}/permanent`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);

    // Outsider gets 404
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}/permanent`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    // Listen for SSE TASK_DELETED with permanent: true
    const sseReceived = new Promise<{ payload?: { taskId?: number; permanent?: boolean } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SSE timeout')), 5000);
      const req = http.get(
        `${baseUrl}/api/realtime/stream`,
        { headers: { authorization: `Bearer ${ownerToken}` } },
        (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            buf += chunk;
            const frames = buf.split('\n\n');
            buf = frames.pop() ?? '';
            for (const frame of frames) {
              for (const line of frame.split('\n')) {
                if (!line.startsWith('data:')) continue;
                try {
                  const evt = JSON.parse(line.slice(5).trim());
                  if (evt.type === 'TASK_DELETED' && evt.payload?.taskId === taskId) {
                    clearTimeout(timer);
                    req.destroy();
                    resolve(evt);
                    return;
                  }
                } catch {
                  // ignore keepalive
                }
              }
            }
          });
        },
      );
      req.on('error', () => {
        // destroyed intentionally after resolve
      });
    });

    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}/permanent`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const evt = await sseReceived;
    expect(evt.payload?.permanent).toBe(true);

    const dbTask = await prisma.task.findUnique({ where: { id: taskId } });
    expect(dbTask).toBeNull();
  });
});
