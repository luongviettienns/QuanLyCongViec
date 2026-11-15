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

  it('supports deadlineFilter matching stats, sortBy nulls-last & priority order, and scope=pending_invites', async () => {
    // Compute VN today & relative ISO YYYY-MM-DD strings
    const vnFmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = vnFmt.format(new Date());
    const shiftDays = (days: number) => {
      const [y, m, d] = todayStr.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d + days));
      return dt.toISOString().slice(0, 10);
    };

    const createTask = (payload: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ teamId, ...payload });

    const overdueRes = await createTask({
      title: `Overdue ${runId}`,
      priority: 'LOW',
      dueDate: shiftDays(-2),
    });
    const todayRes = await createTask({
      title: `Today ${runId}`,
      priority: 'HIGH',
      dueDate: todayStr,
    });
    const soonRes = await createTask({
      title: `Soon ${runId}`,
      priority: 'MEDIUM',
      dueDate: shiftDays(3),
    });
    const noDueRes = await createTask({
      title: `NoDue ${runId}`,
      priority: 'HIGH',
    });

    // Invite member as collaborator on soonRes (stays PENDING)
    await request(app.getHttpServer())
      .post(`/api/tasks/${soonRes.body.id}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);

    const overdueList = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&deadlineFilter=overdue`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(overdueList.body.map((t: { id: number }) => t.id)).toContain(overdueRes.body.id);
    expect(overdueList.body.map((t: { id: number }) => t.id)).not.toContain(todayRes.body.id);

    const dueSoonList = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&deadlineFilter=due_soon`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const dueSoonIds = dueSoonList.body.map((t: { id: number }) => t.id);
    expect(dueSoonIds).toContain(todayRes.body.id);
    expect(dueSoonIds).toContain(soonRes.body.id);
    expect(dueSoonIds).not.toContain(overdueRes.body.id);

    const noDueList = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&deadlineFilter=no_due_date`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(noDueList.body.map((t: { id: number }) => t.id)).toContain(noDueRes.body.id);

    // sortBy=due_date_asc puts tasks without dueDate last
    const sortedDueAsc = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&sortBy=due_date_asc`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const ascIds = sortedDueAsc.body.map((t: { id: number }) => t.id);
    expect(ascIds.indexOf(overdueRes.body.id)).toBeLessThan(ascIds.indexOf(todayRes.body.id));
    expect(ascIds.indexOf(soonRes.body.id)).toBeLessThan(ascIds.indexOf(noDueRes.body.id));

    // sortBy=priority_desc orders HIGH before MEDIUM before LOW
    const sortedPriority = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&sortBy=priority_desc`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const prioIds = sortedPriority.body.map((t: { id: number }) => t.id);
    expect(prioIds.indexOf(todayRes.body.id)).toBeLessThan(prioIds.indexOf(soonRes.body.id));
    expect(prioIds.indexOf(soonRes.body.id)).toBeLessThan(prioIds.indexOf(overdueRes.body.id));

    // scope=pending_invites returns only tasks with PENDING collaborator invite for member
    const pendingRes = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&scope=pending_invites`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(pendingRes.body.map((t: { id: number }) => t.id)).toEqual([soonRes.body.id]);
  });

  it('GET /api/tasks?personalOnly=true returns only personal tasks (teamId === null) and excludes team tasks', async () => {
    const personalRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Personal Active ${runId}` })
      .expect(201);

    const teamTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Team Active ${runId}`, teamId })
      .expect(201);

    const outsiderPersonalRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ title: `Outsider Personal ${runId}` })
      .expect(201);

    const personalOnlyList = await request(app.getHttpServer())
      .get('/api/tasks?personalOnly=true')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const personalTasks = personalOnlyList.body as Array<{ id: number; teamId: number | null }>;
    const personalIds = personalTasks.map((t) => t.id);
    expect(personalIds).toContain(personalRes.body.id);
    expect(personalIds).not.toContain(teamTaskRes.body.id);
    expect(personalIds).not.toContain(outsiderPersonalRes.body.id);
    expect(personalTasks.every((t) => t.teamId === null)).toBe(true);

    const allList = await request(app.getHttpServer())
      .get('/api/tasks?personalOnly=false')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const allIds = (allList.body as Array<{ id: number }>).map((t) => t.id);
    expect(allIds).toContain(personalRes.body.id);
    expect(allIds).toContain(teamTaskRes.body.id);

    await request(app.getHttpServer())
      .get('/api/tasks?personalOnly=invalid')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('GET /api/tasks/trash?personalOnly=true returns only soft-deleted personal tasks (teamId === null)', async () => {
    const personalTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Personal Trash ${runId}` })
      .expect(201);

    const teamTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Team Trash ${runId}`, teamId })
      .expect(201);

    const outsiderTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ title: `Outsider Trash ${runId}` })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/tasks/${personalTaskRes.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/tasks/${teamTaskRes.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/tasks/${outsiderTaskRes.body.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);

    const personalTrashRes = await request(app.getHttpServer())
      .get('/api/tasks/trash?personalOnly=true')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const personalTrash = personalTrashRes.body as Array<{ id: number; teamId: number | null }>;
    const personalTrashIds = personalTrash.map((t) => t.id);
    expect(personalTrashIds).toContain(personalTaskRes.body.id);
    expect(personalTrashIds).not.toContain(teamTaskRes.body.id);
    expect(personalTrashIds).not.toContain(outsiderTaskRes.body.id);
    expect(personalTrash.every((t) => t.teamId === null)).toBe(true);

    const fullTrashRes = await request(app.getHttpServer())
      .get('/api/tasks/trash')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const fullTrashIds = (fullTrashRes.body as Array<{ id: number }>).map((t) => t.id);
    expect(fullTrashIds).toContain(personalTaskRes.body.id);
    expect(fullTrashIds).toContain(teamTaskRes.body.id);
  });

  it('rejects combining teamId and personalOnly=true with 400 BadRequestException', async () => {
    const tasksRes = await request(app.getHttpServer())
      .get(`/api/tasks?teamId=${teamId}&personalOnly=true`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    expect(tasksRes.body.message).toContain('Không thể đồng thời lọc theo nhóm và chỉ công việc cá nhân');

    const trashRes = await request(app.getHttpServer())
      .get(`/api/tasks/trash?teamId=${teamId}&personalOnly=true`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    expect(trashRes.body.message).toContain('Không thể đồng thời lọc theo nhóm và chỉ công việc cá nhân');
  });
});
