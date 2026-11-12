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
  let memberToken: string;
  let memberId: number;

  let testTeamId: number;
  let secondTeamId: number;
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
    memberToken = memberRes.body.accessToken;
    memberId = memberRes.body.user.id;

    // 3. Create Team 1
    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Activity Test Team ${ts}` })
      .expect(201);
    testTeamId = teamRes.body.id;

    // 4. Create Team 2
    const team2Res = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Activity Test Team 2 ${ts}` })
      .expect(201);
    secondTeamId = team2Res.body.id;

    // 5. Add Member to Team 1 and Team 2
    await request(app.getHttpServer())
      .post(`/api/teams/${testTeamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `act_member_${ts}@test.local`, role: TeamRole.MEMBER })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${secondTeamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: `act_member_${ts}@test.local`, role: TeamRole.MEMBER })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.teamActivityLog.deleteMany({
      where: { teamIdSnapshot: { in: [testTeamId, secondTeamId] } },
    });
    await prisma.subtask.deleteMany({});
    await prisma.taskCollaborator.deleteMany({});
    await prisma.task.deleteMany({
      where: { teamId: { in: [testTeamId, secondTeamId] } },
    });
    await prisma.teamMember.deleteMany({
      where: { teamId: { in: [testTeamId, secondTeamId] } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: [testTeamId, secondTeamId] } },
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

    const subtaskRes = await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: `Subtask 1 of ${ts}` })
      .expect(201);
    const subtaskId = subtaskRes.body.id;

    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/subtasks/${subtaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.DONE })
      .expect(200);

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

    const idsPage1 = page1Res.body.data.map((l: any) => l.id);
    const idsPage2 = page2Res.body.data.map((l: any) => l.id);
    const commonIds = idsPage1.filter((id: number) => idsPage2.includes(id));
    expect(commonIds).toHaveLength(0);
  });

  it('5. Lọc theo action và actorId', async () => {
    const actionRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?action=TASK_CREATED`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(actionRes.body.data.length).toBeGreaterThanOrEqual(1);
    actionRes.body.data.forEach((l: any) => {
      expect(l.action).toBe('TASK_CREATED');
    });

    const actorRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?actorId=${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(actorRes.body.data.length).toBeGreaterThanOrEqual(1);
    actorRes.body.data.forEach((l: any) => {
      expect(l.actorId).toBe(ownerId);
    });
  });

  it('6. Mời collaborator, từ chối, mời lại, chấp nhận, gỡ ghi đủ log', async () => {
    // Owner creates a task
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Collab Task ${ts}`,
        teamId: testTeamId,
        assigneeId: ownerId,
        status: TaskStatus.TODO,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // 1. Mời collaborator -> COLLABORATOR_INVITED
    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);

    // 2. Member declines -> COLLABORATOR_DECLINED
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/collaborators/respond`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ action: 'DECLINE' })
      .expect(200);

    // 3. Mời lại collaborator -> COLLABORATOR_INVITED
    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: memberId })
      .expect(201);

    // 4. Member accepts -> COLLABORATOR_ACCEPTED
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/collaborators/respond`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ action: 'ACCEPT' })
      .expect(200);

    // 5. Owner removes collaborator -> COLLABORATOR_REMOVED
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}/collaborators/${memberId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?limit=50`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const actions = logsRes.body.data.map((l: any) => l.action);
    expect(actions).toContain('COLLABORATOR_INVITED');
    expect(actions).toContain('COLLABORATOR_DECLINED');
    expect(actions).toContain('COLLABORATOR_ACCEPTED');
    expect(actions).toContain('COLLABORATOR_REMOVED');
  });

  it('7. Trả lại task ghi log TASK_RETURNED với metadata đầy đủ', async () => {
    // Owner creates task assigned to member in IN_PROGRESS
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Returnable Task ${ts}`,
        teamId: testTeamId,
        assigneeId: memberId,
        status: TaskStatus.IN_PROGRESS,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // Member returns task
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/return`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ reason: 'Quá tải công việc' })
      .expect(200);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?action=TASK_RETURNED`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(logsRes.body.data.length).toBeGreaterThanOrEqual(1);
    const log = logsRes.body.data[0];
    expect(log.action).toBe('TASK_RETURNED');
    expect(log.actorId).toBe(memberId);
    expect(log.metadata.taskId).toBe(taskId);
    expect(log.metadata.reason).toBe('Quá tải công việc');
    expect(log.metadata.newStatus).toBe('TODO');
  });

  it('8. Chuyển task giữa nhóm và cá nhân ghi log TASK_MOVED_OUT và TASK_MOVED_IN', async () => {
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Transferable Task ${ts}`,
        teamId: testTeamId,
        assigneeId: ownerId,
        status: TaskStatus.TODO,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // Move task from Team 1 to Team 2
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/team`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ teamId: secondTeamId })
      .expect(200);

    // Team 1 should have TASK_MOVED_OUT
    const team1LogsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?action=TASK_MOVED_OUT`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(team1LogsRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(team1LogsRes.body.data[0].metadata.fromTeamId).toBe(testTeamId);
    expect(team1LogsRes.body.data[0].metadata.toTeamId).toBe(secondTeamId);

    // Team 2 should have TASK_MOVED_IN
    const team2LogsRes = await request(app.getHttpServer())
      .get(`/api/teams/${secondTeamId}/activity-logs?action=TASK_MOVED_IN`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(team2LogsRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(team2LogsRes.body.data[0].metadata.fromTeamId).toBe(testTeamId);
    expect(team2LogsRes.body.data[0].metadata.toTeamId).toBe(secondTeamId);

    // Move task from Team 2 to personal space
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}/team`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ teamId: null })
      .expect(200);

    const team2MovedOutRes = await request(app.getHttpServer())
      .get(`/api/teams/${secondTeamId}/activity-logs?action=TASK_MOVED_OUT`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(team2MovedOutRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(team2MovedOutRes.body.data[0].metadata.toTeamId).toBeNull();
  });

  it('9. Cập nhật nội dung task ghi log TASK_DEADLINE_CHANGED, TASK_PRIORITY_CHANGED, TASK_UPDATED', async () => {
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Content Task ${ts}`,
        teamId: testTeamId,
        priority: 'LOW',
        dueDate: '2026-11-20',
        status: TaskStatus.TODO,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // Update deadline, priority, title
    await request(app.getHttpServer())
      .patch(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Content Task Renamed ${ts}`,
        priority: 'HIGH',
        dueDate: '2026-12-25',
      })
      .expect(200);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?limit=50`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const actions = logsRes.body.data.map((l: any) => l.action);
    expect(actions).toContain('TASK_DEADLINE_CHANGED');
    expect(actions).toContain('TASK_PRIORITY_CHANGED');
    expect(actions).toContain('TASK_UPDATED');

    const deadlineLog = logsRes.body.data.find((l: any) => l.action === 'TASK_DEADLINE_CHANGED');
    expect(deadlineLog.metadata.oldDueDate).toBe('2026-11-20');
    expect(deadlineLog.metadata.newDueDate).toBe('2026-12-25');

    const priorityLog = logsRes.body.data.find((l: any) => l.action === 'TASK_PRIORITY_CHANGED');
    expect(priorityLog.metadata.oldPriority).toBe('LOW');
    expect(priorityLog.metadata.newPriority).toBe('HIGH');
  });

  it('10. Xóa và khôi phục task ghi log TASK_DELETED và TASK_RESTORED', async () => {
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Trash Task ${ts}`,
        teamId: testTeamId,
        status: TaskStatus.TODO,
      })
      .expect(201);
    const taskId = taskRes.body.id;

    // Delete task (soft delete)
    await request(app.getHttpServer())
      .delete(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    // Restore task
    await request(app.getHttpServer())
      .post(`/api/tasks/${taskId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?limit=50`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const actions = logsRes.body.data.map((l: any) => l.action);
    expect(actions).toContain('TASK_DELETED');
    expect(actions).toContain('TASK_RESTORED');
  });

  it('11. Bảo mật & validation: page > 100000 trả 400, member thường trả 403', async () => {
    // 1. page > 100000 returns 400
    const invalidPageRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs?page=100001`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    expect(invalidPageRes.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('Trang vượt quá giới hạn')]),
    );

    // 2. Regular member calling activity-logs returns 403
    await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);
  });

  it('12. Danh sách actors bao gồm cả người đã rời nhóm hoặc bị xóa', async () => {
    const logsRes = await request(app.getHttpServer())
      .get(`/api/teams/${testTeamId}/activity-logs`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(logsRes.body.actors).toBeDefined();
    const actorIds = logsRes.body.actors.map((a: any) => a.id);
    expect(actorIds).toContain(ownerId);
    expect(actorIds).toContain(memberId);
  });
});
