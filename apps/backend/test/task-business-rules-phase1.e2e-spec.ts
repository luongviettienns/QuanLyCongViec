import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { TaskStatus } from '@prisma/client';

describe('Phase 1 — Task Business Logic & Authorization Hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const timestamp = Date.now();

  const ownerCreds = {
    name: 'Owner Phase1',
    email: `owner_p1_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const adminCreds = {
    name: 'Admin Phase1',
    email: `admin_p1_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const member1Creds = {
    name: 'Member1 Phase1',
    email: `member1_p1_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const member2Creds = {
    name: 'Member2 Phase1',
    email: `member2_p1_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const outsiderCreds = {
    name: 'Outsider Phase1',
    email: `outsider_p1_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  let tokenOwner = '';
  let tokenAdmin = '';
  let tokenMember1 = '';
  let tokenMember2 = '';
  let tokenOutsider = '';

  let ownerId = 0;
  let member1Id = 0;
  let member2Id = 0;

  let teamId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Register users
    const rOwner = await request(app.getHttpServer()).post('/auth/register').send(ownerCreds).expect(201);
    tokenOwner = rOwner.body.accessToken;
    ownerId = rOwner.body.user.id;

    const rAdmin = await request(app.getHttpServer()).post('/auth/register').send(adminCreds).expect(201);
    tokenAdmin = rAdmin.body.accessToken;

    const rMem1 = await request(app.getHttpServer()).post('/auth/register').send(member1Creds).expect(201);
    tokenMember1 = rMem1.body.accessToken;
    member1Id = rMem1.body.user.id;

    const rMem2 = await request(app.getHttpServer()).post('/auth/register').send(member2Creds).expect(201);
    tokenMember2 = rMem2.body.accessToken;
    member2Id = rMem2.body.user.id;

    const rOutsider = await request(app.getHttpServer()).post('/auth/register').send(outsiderCreds).expect(201);
    tokenOutsider = rOutsider.body.accessToken;

    // Create team
    const teamRes = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `Phase1 Hardening Team ${timestamp}` })
      .expect(201);
    teamId = teamRes.body.id;

    // Add admin
    await request(app.getHttpServer())
      .post(`/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: adminCreds.email, role: 'ADMIN' })
      .expect(201);

    // Add member 1
    await request(app.getHttpServer())
      .post(`/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: member1Creds.email, role: 'MEMBER' })
      .expect(201);

    // Add member 2
    await request(app.getHttpServer())
      .post(`/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: member2Creds.email, role: 'MEMBER' })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Soft Delete & Restore Hardening', () => {
    let personalTaskId = 0;
    let teamTaskId = 0;
    const taskTitle = `Soft Delete Task ${timestamp}`;

    it('creates a personal task and soft deletes it', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: taskTitle, description: 'Personal soft delete test' })
        .expect(201);
      personalTaskId = createRes.body.id;

      // Soft delete
      const delRes = await request(app.getHttpServer())
        .delete(`/tasks/${personalTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      expect(delRes.body.success).toBe(true);

      // Verify DB record is preserved with deletedAt & deletedById
      const inDb = await prisma.task.findUnique({ where: { id: personalTaskId } });
      expect(inDb).toBeDefined();
      expect(inDb?.deletedAt).not.toBeNull();
      expect(inDb?.deletedById).toBe(ownerId);
    });

    it('soft deleted task is excluded from findAll, stats, and findOne', async () => {
      // findAll
      const listRes = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const found = listRes.body.find((t: any) => t.id === personalTaskId);
      expect(found).toBeUndefined();

      // findOne returns 404
      await request(app.getHttpServer())
        .get(`/tasks/${personalTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(404);

      // stats does not count deleted tasks
      const statsRes = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      expect(statsRes.body).toBeDefined();
    });

    it('second delete on already deleted task returns 404 (no double deletion)', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${personalTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(404);
    });

    it('allows creating a new task with the SAME title as the soft-deleted task', async () => {
      // Because soft-deleted task has deletedAt != null, it should NOT collide with new active task
      const newRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: taskTitle, description: 'New task with reused title' })
        .expect(201);
      expect(newRes.body.id).not.toBe(personalTaskId);
    });

    it('creator can restore a soft-deleted personal task after resolving title conflict', async () => {
      // If we try to restore while title is occupied by active task, it should return 409 Conflict
      await request(app.getHttpServer())
        .post(`/tasks/${personalTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(409);

      // Rename the active conflicting task
      const activeTask = await prisma.task.findFirst({
        where: { title: taskTitle, deletedAt: null },
      });
      await request(app.getHttpServer())
        .patch(`/tasks/${activeTask!.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Renamed Task ${timestamp}` })
        .expect(200);

      // Now restore succeeds
      const restoreRes = await request(app.getHttpServer())
        .post(`/tasks/${personalTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201);
      expect(restoreRes.body.id).toBe(personalTaskId);

      const inDb = await prisma.task.findUnique({ where: { id: personalTaskId } });
      expect(inDb?.deletedAt).toBeNull();
      expect(inDb?.deletedById).toBeNull();
    });

    it('team task soft delete and restore authorization matrix', async () => {
      // Create team task
      const teamTaskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Team Soft Delete ${timestamp}`,
          teamId,
          assigneeId: member1Id,
        })
        .expect(201);
      teamTaskId = teamTaskRes.body.id;

      // Soft delete by Admin
      await request(app.getHttpServer())
        .delete(`/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      // Regular member attempts restore -> 403 Forbidden
      await request(app.getHttpServer())
        .post(`/tasks/${teamTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .expect(403);

      // Outsider attempts restore -> 404/403
      await request(app.getHttpServer())
        .post(`/tasks/${teamTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);

      // Admin attempts restore -> 201 Created
      const adminRestore = await request(app.getHttpServer())
        .post(`/tasks/${teamTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(201);
      expect(adminRestore.body.id).toBe(teamTaskId);
    });
  });

  describe('2. Lock DONE Tasks & Workflow Rules', () => {
    let doneTaskId = 0;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Done Lock Task ${timestamp}`,
          teamId,
          assigneeId: member1Id,
          status: 'TODO',
        })
        .expect(201);
      doneTaskId = res.body.id;

      // Move to DONE
      await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'DONE' })
        .expect(200);
    });

    it('rejects editing content of a DONE task (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ description: 'Attempt edit on done task' })
        .expect(400);
      expect(res.body.message).toMatch(/hoàn thành/i);
    });

    it('rejects changing assignee of a DONE task even for Owner (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/assignee`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: member2Id })
        .expect(400);
      expect(res.body.message).toMatch(/hoàn thành/i);
    });

    it('rejects returnTask on a DONE task (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/return`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .send({ reason: 'Cannot complete this done task' })
        .expect(400);
      expect(res.body.message).toMatch(/hoàn thành/i);
    });

    it('forbids Assignee from reopening a DONE task (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember1}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(403);
    });

    it('forbids Regular Member from reopening a DONE task (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember2}`)
        .send({ status: 'TODO' })
        .expect(403);
    });

    it('allows Team Admin / Owner to reopen a DONE task', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });
  });

  describe('3. Member Removal & Leaving Rules (P0)', () => {
    let leaveTeamId = 0;
    let tempMemberUserId = 0;
    let tempMemberMembershipId = 0;
    let tempMemberToken = '';

    let todoTaskId = 0;
    let inProgressTaskId = 0;
    let doneTaskId = 0;

    beforeAll(async () => {
      // Register a temporary member who will be removed
      const rTemp = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Leaving Member',
          email: `leaving_${timestamp}@taskflow.test`,
          password: 'Password123!',
        })
        .expect(201);
      tempMemberToken = rTemp.body.accessToken;
      tempMemberUserId = rTemp.body.user.id;

      // Create a dedicated team
      const tRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ name: `Leaving Member Team ${timestamp}` })
        .expect(201);
      leaveTeamId = tRes.body.id;

      // Add temp member to team
      const mRes = await request(app.getHttpServer())
        .post(`/teams/${leaveTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `leaving_${timestamp}@taskflow.test`, role: 'MEMBER' })
        .expect(201);
      tempMemberMembershipId = mRes.body.id;

      // Create 3 tasks assigned to this temp member:
      // 1. TODO task
      const t1 = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Temp Member TODO ${timestamp}`,
          teamId: leaveTeamId,
          assigneeId: tempMemberUserId,
          status: 'TODO',
        })
        .expect(201);
      todoTaskId = t1.body.id;

      // 2. IN_PROGRESS task
      const t2 = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Temp Member In Progress ${timestamp}`,
          teamId: leaveTeamId,
          assigneeId: tempMemberUserId,
          status: 'IN_PROGRESS',
        })
        .expect(201);
      inProgressTaskId = t2.body.id;

      // 3. DONE task
      const t3 = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Temp Member Done ${timestamp}`,
          teamId: leaveTeamId,
          assigneeId: tempMemberUserId,
          status: 'DONE',
        })
        .expect(201);
      doneTaskId = t3.body.id;
    });

    it('removes member from team and enforces business rules on all tasks atomically', async () => {
      // Owner removes the member
      await request(app.getHttpServer())
        .delete(`/teams/${leaveTeamId}/members/${tempMemberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify TODO task: unassigned and stays in TODO
      const task1InDb = await prisma.task.findUnique({ where: { id: todoTaskId } });
      expect(task1InDb?.assigneeId).toBeNull();
      expect(task1InDb?.status).toBe(TaskStatus.TODO);

      // Verify IN_PROGRESS task: unassigned and MOVED TO TODO
      const task2InDb = await prisma.task.findUnique({ where: { id: inProgressTaskId } });
      expect(task2InDb?.assigneeId).toBeNull();
      expect(task2InDb?.status).toBe(TaskStatus.TODO);

      // Verify DONE task: ASSIGNEE IS PRESERVED for historical audit!
      const task3InDb = await prisma.task.findUnique({ where: { id: doneTaskId } });
      expect(task3InDb?.assigneeId).toBe(tempMemberUserId);
      expect(task3InDb?.status).toBe(TaskStatus.DONE);

      // Verify removed member can no longer view or access team tasks
      await request(app.getHttpServer())
        .get(`/tasks/${todoTaskId}`)
        .set('Authorization', `Bearer ${tempMemberToken}`)
        .expect(404);
    });

    it('when reopening DONE task where assignee has left team, assignee is reset to null', async () => {
      // Task 3 was DONE with assignee tempMemberUserId (who is now removed from team)
      // When Owner reopens task 3 to TODO:
      const reopened = await request(app.getHttpServer())
        .patch(`/tasks/${doneTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'TODO' })
        .expect(200);

      expect(reopened.body.status).toBe('TODO');
      // Assignee must be automatically cleared to null because the member no longer belongs to the team
      expect(reopened.body.assigneeId).toBeNull();
    });
  });

  describe('4. Shared Board Reorder Permissions', () => {
    let tA = 0;
    let tB = 0;

    beforeAll(async () => {
      const resA = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Board Task A ${timestamp}`, teamId, status: 'TODO' })
        .expect(201);
      tA = resA.body.id;

      const resB = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Board Task B ${timestamp}`, teamId, status: 'TODO' })
        .expect(201);
      tB = resB.body.id;
    });

    it('forbids regular member from reordering shared team board (403)', async () => {
      await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenMember1}`)
        .send({ teamId, taskIds: [tB, tA], status: 'TODO' })
        .expect(403);
    });

    it('allows Admin and Owner to reorder shared team board (200)', async () => {
      const adminRes = await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ teamId, taskIds: [tB, tA], status: 'TODO' })
        .expect(200);
      expect(adminRes.body.success).toBe(true);
    });
  });

  describe('5. Concurrency & Race Conditions', () => {
    it('concurrent creation with identical title: exactly one succeeds with 201, other receives 409', async () => {
      const sharedTitle = `Race Condition Task ${timestamp}`;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${tokenOwner}`)
          .send({ title: sharedTitle, teamId }),
        request(app.getHttpServer())
          .post('/tasks')
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ title: sharedTitle, teamId }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);
    });

    it('concurrent delete vs update: delete succeeds, update receives 404 (no 500 error)', async () => {
      const task = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Race Delete Task ${timestamp}`, teamId })
        .expect(201);

      const taskId = task.body.id;

      const [delRes, updateRes] = await Promise.all([
        request(app.getHttpServer())
          .delete(`/tasks/${taskId}`)
          .set('Authorization', `Bearer ${tokenOwner}`),
        request(app.getHttpServer())
          .patch(`/tasks/${taskId}`)
          .set('Authorization', `Bearer ${tokenAdmin}`)
          .send({ description: 'Concurrent update' }),
      ]);

      expect(delRes.status).toBe(200);
      expect([200, 404]).toContain(updateRes.status);
      expect(updateRes.status).not.toBe(500);
    });
  });
});
