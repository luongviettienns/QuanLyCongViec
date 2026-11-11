import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';
import { TaskStatus, TeamRole } from '@prisma/client';

describe('Team Task Activity Logging & Pagination (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let ownerToken: string;
  let ownerId: number;
  let _memberToken: string;
  let memberId: number;

  let testTeamId: number;
  const ts = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // 1. Register Owner
    const ownerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `act_owner_${ts}@test.local`,
        password: 'Password123!',
        name: 'Activity Owner',
      })
      .expect(201);
    ownerToken = ownerRes.body.accessToken;
    ownerId = ownerRes.body.user.id;

    // 2. Register Member
    const memberRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `act_member_${ts}@test.local`,
        password: 'Password123!',
        name: 'Activity Member',
      })
      .expect(201);
    _memberToken = memberRes.body.accessToken;
    memberId = memberRes.body.user.id;

    // 3. Create Team
    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Activity Test Team ${ts}` })
      .expect(201);
    testTeamId = teamRes.body.id;

    // 4. Add Member to Team
    await request(app.getHttpServer())
      .post(`/api/teams/${testTeamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `act_member_${ts}@test.local`, role: TeamRole.MEMBER })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.teamActivityLog.deleteMany({
      where: { teamIdSnapshot: testTeamId },
    });
    await prisma.subtask.deleteMany({});
    await prisma.taskCollaborator.deleteMany({});
    await prisma.task.deleteMany({
      where: { teamId: testTeamId },
    });
    await prisma.teamMember.deleteMany({
      where: { teamId: testTeamId },
    });
    await prisma.team.deleteMany({
      where: { id: testTeamId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, memberId] } },
    });
    await app.close();
  });

  it('1. Tạo task trong team ghi log TASK_CREATED và TASK_ASSIGNED', async () => {
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Team Task Alpha ${ts}`,
        teamId: testTeamId,
        assigneeId: memberId,
        status: TaskStatus.TODO,
      })
      .expect(201);

    const taskId = taskRes.body.id;

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const logs = logsRes.body.data;
    const actions = logs.map((l: any) => l.action);
    expect(actions).toContain('TASK_CREATED');
    expect(actions).toContain('TASK_ASSIGNED');

    const createdLog = logs.find((l: any) => l.action === 'TASK_CREATED');
    expect(createdLog.actorId).toBe(ownerId);
    expect(createdLog.metadata.taskId).toBe(taskId);
    expect(createdLog.metadata.taskTitle).toBe(`Team Task Alpha ${ts}`);
  });

  it('2. Đổi trạng thái task ghi log TASK_STATUS_CHANGED', async () => {
    // Member creates task 2
    const task2Res = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Team Task Beta ${ts}`,
        teamId: testTeamId,
        status: TaskStatus.TODO,
      })
      .expect(201);
    const taskId = task2Res.body.id;

    // Change status to IN_PROGRESS
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?action=TASK_STATUS_CHANGED`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const logs = logsRes.body.data;
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].action).toBe('TASK_STATUS_CHANGED');
    expect(logs[0].metadata.taskId).toBe(taskId);
    expect(logs[0].metadata.oldStatus).toBe('TODO');
    expect(logs[0].metadata.newStatus).toBe('IN_PROGRESS');
  });

  it('3. Hoàn thành và mở lại Subtask ghi log SUBTASK_COMPLETED và SUBTASK_REOPENED', async () => {
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Team Task Gamma ${ts}`,
        teamId: testTeamId,
        status: TaskStatus.IN_PROGRESS,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // Create subtask
    const subtaskRes = await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Subtask 1 of ${ts}` })
      .expect(201);
    const subtaskId = subtaskRes.body.id;

    // Move subtask to IN_PROGRESS first (workflow rule: cannot jump TODO -> DONE directly)
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    // Complete subtask (IN_PROGRESS -> DONE)
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.DONE })
      .expect(200);

    // Reopen subtask
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.TODO })
      .expect(200);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const logs = logsRes.body.data;
    const actions = logs.map((l: any) => l.action);
    expect(actions).toContain('SUBTASK_COMPLETED');
    expect(actions).toContain('SUBTASK_REOPENED');

    const completedLog = logs.find((l: any) => l.action === 'SUBTASK_COMPLETED');
    expect(completedLog.metadata.subtaskId).toBe(subtaskId);
    expect(completedLog.metadata.subtaskTitle).toBe(`Subtask 1 of ${ts}`);
  });

  it('4. Phân trang 4 hàng/trang hoạt động chính xác (page=1&limit=4, page=2&limit=4)', async () => {
    const page1Res = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?page=1&limit=4`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(page1Res.body.data).toHaveLength(4);
    expect(page1Res.body.page).toBe(1);
    expect(page1Res.body.limit).toBe(4);
    expect(page1Res.body.total).toBeGreaterThanOrEqual(6);
    expect(page1Res.body.totalPages).toBeGreaterThanOrEqual(2);

    const page2Res = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?page=2&limit=4`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(page2Res.body.page).toBe(2);
    expect(page2Res.body.data.length).toBeGreaterThanOrEqual(1);

    // Check that items on page 1 and page 2 are distinct
    const idsPage1 = page1Res.body.data.map((l: any) => l.id);
    const idsPage2 = page2Res.body.data.map((l: any) => l.id);
    const commonIds = idsPage1.filter((id: number) => idsPage2.includes(id));
    expect(commonIds).toHaveLength(0);
  });

  it('5. Lọc theo action và actorId', async () => {
    // Filter by action TASK_CREATED
    const actionRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?action=TASK_CREATED`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(actionRes.body.data.length).toBeGreaterThanOrEqual(1);
    actionRes.body.data.forEach((l: any) => {
      expect(l.action).toBe('TASK_CREATED');
    });

    // Filter by actorId ownerId
    const actorRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?actorId=${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(actorRes.body.data.length).toBeGreaterThanOrEqual(1);
    actorRes.body.data.forEach((l: any) => {
      expect(l.actorId).toBe(ownerId);
    });
  });
});
