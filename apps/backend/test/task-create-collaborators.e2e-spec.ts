import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Task Create with Atomic Collaborators (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: number;
  let memberAToken: string;
  let memberAId: number;
  let memberBId: number;
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

    const owner = await register('collab_create_owner');
    const memberA = await register('collab_create_a');
    const memberB = await register('collab_create_b');
    const outsider = await register('collab_create_outsider');

    ownerToken = owner.token;
    ownerId = owner.id;
    memberAToken = memberA.token;
    memberAId = memberA.id;
    memberBId = memberB.id;
    outsiderId = outsider.id;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Collab Create Team ${runId}` });
    teamId = teamRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberA.email });

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: memberB.email });
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates task and invites deduplicated collaborators atomically with activity log & notification', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Atomic Collab Task ${runId}`,
        teamId,
        assigneeId: memberAId,
        collaboratorIds: [memberBId, memberBId],
      })
      .expect(201);

    const taskId = res.body.id as number;
    expect(taskId).toBeGreaterThan(0);
    expect(res.body.teamId).toBe(teamId);
    expect(res.body.assigneeId).toBe(memberAId);

    const collabs = await prisma.taskCollaborator.findMany({
      where: { taskId },
    });
    expect(collabs).toHaveLength(1);
    expect(collabs[0].userId).toBe(memberBId);
    expect(collabs[0].status).toBe('PENDING');
    expect(collabs[0].invitedById).toBe(ownerId);

    const logs = await prisma.teamActivityLog.findMany({
      where: { teamId, action: 'COLLABORATOR_INVITED', targetUserId: memberBId },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);

    const notif = await prisma.notification.findFirst({
      where: {
        userId: memberBId,
        type: 'TASK_COLLABORATOR_INVITED',
        taskId,
      },
    });
    expect(notif).not.toBeNull();
  });

  it('rejects collaboratorIds on personal task (no teamId) and leaves no task created', async () => {
    const title = `Personal Collab Fail ${runId}`;
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title,
        collaboratorIds: [memberBId],
      })
      .expect(400);

    const task = await prisma.task.findFirst({ where: { title } });
    expect(task).toBeNull();
  });

  it('rejects self-invitation in collaboratorIds and rolls back task creation', async () => {
    const title = `Self Collab Fail ${runId}`;
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${memberAToken}`)
      .send({
        title,
        teamId,
        assigneeId: memberBId,
        collaboratorIds: [memberAId],
      })
      .expect(400);

    const task = await prisma.task.findFirst({ where: { title } });
    expect(task).toBeNull();
  });

  it('rejects primary assignee in collaboratorIds and rolls back task creation', async () => {
    const title = `Assignee Collab Fail ${runId}`;
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title,
        teamId,
        assigneeId: memberAId,
        collaboratorIds: [memberAId, memberBId],
      })
      .expect(400);

    const task = await prisma.task.findFirst({ where: { title } });
    expect(task).toBeNull();
  });

  it('rejects non-member outsider in collaboratorIds and rolls back task creation', async () => {
    const title = `Outsider Collab Fail ${runId}`;
    await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title,
        teamId,
        assigneeId: memberAId,
        collaboratorIds: [memberBId, outsiderId],
      })
      .expect(400);

    const task = await prisma.task.findFirst({ where: { title } });
    expect(task).toBeNull();
  });
});
