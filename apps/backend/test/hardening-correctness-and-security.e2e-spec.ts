import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Hardening, Correctness & Security Specifications', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ts = Date.now();
  let ownerToken: string;
  let _ownerId: number;
  let memberToken: string;
  let memberId: number;
  let outsiderToken: string;
  let _outsiderId: number;

  let teamId: number;
  let teamMemberRecordId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    // Register 3 users: Owner, Member, Outsider
    const ownerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `h_owner_${ts}@test.local`,
        name: `Owner ${ts}`,
        password: 'Password123!',
      })
      .expect(201);
    ownerToken = ownerRes.body.accessToken;
    _ownerId = ownerRes.body.user.id;

    const memberRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `h_member_${ts}@test.local`,
        name: `Member ${ts}`,
        password: 'Password123!',
      })
      .expect(201);
    memberToken = memberRes.body.accessToken;
    memberId = memberRes.body.user.id;

    const outsiderRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: `h_outsider_${ts}@test.local`,
        name: `Outsider ${ts}`,
        password: 'Password123!',
      })
      .expect(201);
    outsiderToken = outsiderRes.body.accessToken;
    _outsiderId = outsiderRes.body.user.id;

    // Create Team
    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: `Hardening Team ${ts}`,
      })
      .expect(201);
    teamId = teamRes.body.id;

    // Add Member
    const addMemberRes = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        email: `h_member_${ts}@test.local`,
        role: 'MEMBER',
      })
      .expect(201);
    teamMemberRecordId = addMemberRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Item 5: Outsider cannot probe task titles of other teams', () => {
    it('returns 404 for existing title and 404 for non-existent title when caller is not team member', async () => {
      // 1. Owner creates a task with secret title
      const secretTitle = `Top Secret Strategy ${ts}`;
      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: secretTitle,
          teamId,
          status: 'TODO',
        })
        .expect(201);

      // 2. Outsider tries to create task with the EXACT existing secret title -> MUST BE 404 Not Found (NOT 409 Conflict)
      const conflictProbeRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          title: secretTitle,
          teamId,
          status: 'TODO',
        })
        .expect(404);

      expect(conflictProbeRes.body.message).toContain('Không tìm thấy nhóm');

      // 3. Outsider tries to create task with a random non-existent title -> Also 404 Not Found
      const randomProbeRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .send({
          title: `Completely Random Title ${ts}`,
          teamId,
          status: 'TODO',
        })
        .expect(404);

      expect(randomProbeRes.body.message).toContain('Không tìm thấy nhóm');
    });
  });

  describe('Item C.1: Idempotent updateMemberRole', () => {
    it('returns immediately without logging or notifying when target role matches current role', async () => {
      // Check current activity logs count
      const logsBefore = await prisma.teamActivityLog.count({
        where: { teamIdSnapshot: teamId },
      });

      // 1. First role update to ADMIN
      await request(app.getHttpServer())
        .patch(`/api/teams/${teamId}/members/${teamMemberRecordId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      const logsAfterFirst = await prisma.teamActivityLog.count({
        where: { teamIdSnapshot: teamId },
      });
      expect(logsAfterFirst).toBe(logsBefore + 1);

      // 2. Second role update to ADMIN again (same role)
      const res = await request(app.getHttpServer())
        .patch(`/api/teams/${teamId}/members/${teamMemberRecordId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(res.body.role).toBe('ADMIN');

      // Verify NO new activity log was created
      const logsAfterSecond = await prisma.teamActivityLog.count({
        where: { teamIdSnapshot: teamId },
      });
      expect(logsAfterSecond).toBe(logsAfterFirst);
    });
  });

  describe('Item C.2: Idempotent updateAssignee', () => {
    it('returns task directly without database mutation when new assignee matches current assignee', async () => {
      // 1. Create a task assigned to Member
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: `Assignee Idempotent Test ${ts}`,
          teamId,
          assigneeId: memberId,
        })
        .expect(201);
      const taskId = taskRes.body.id;

      const notifsBefore = await prisma.notification.count({
        where: { taskId },
      });

      // 2. Re-assign to Member again (same assignee)
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/assignee`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ assigneeId: memberId })
        .expect(200);

      expect(res.body.assigneeId).toBe(memberId);

      // Verify no extra notifications published
      const notifsAfter = await prisma.notification.count({
        where: { taskId },
      });
      expect(notifsAfter).toBe(notifsBefore);
    });
  });

  describe('Item C.3: TaskCollaboratorService.remove allows only PENDING or ACCEPTED', () => {
    it('returns 404 when trying to remove a DECLINED or REVOKED collaborator record', async () => {
      // 1. Create task
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          title: `Collab Removal Constraints ${ts}`,
          teamId,
        })
        .expect(201);
      const taskId = taskRes.body.id;

      // 2. Invite member as collaborator
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/collaborators`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ userId: memberId })
        .expect(201);

      // 3. Member declines invitation
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ action: 'DECLINE' })
        .expect(200);

      // Verify status is DECLINED
      const collab = await prisma.taskCollaborator.findUnique({
        where: { taskId_userId: { taskId, userId: memberId } },
      });
      expect(collab?.status).toBe('DECLINED');

      // 4. Removing a DECLINED collaborator record MUST fail with 404 Not Found!
      await request(app.getHttpServer())
        .delete(`/api/tasks/${taskId}/collaborators/${memberId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });
  });

  describe('Item 9: PrismaClientExceptionFilter handles database errors', () => {
    it('returns 409 Conflict when unique constraint P2002 is violated on register', async () => {
      // Try to register with already existing owner email
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `h_owner_${ts}@test.local`,
          name: 'Duplicate Owner',
          password: 'Password123!',
        })
        .expect(409);

      expect(res.body.statusCode).toBe(409);
      expect(res.body.message).toContain('Email này đã được sử dụng');
    });
  });
});
