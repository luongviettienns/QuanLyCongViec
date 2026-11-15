import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Profile, Password & Bulk Task Actions (E2E)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let ownerId: number;
  let ownerEmail: string;
  let memberToken: string;
  let memberId: number;
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

    const owner = await register('bulk_owner');
    const member = await register('bulk_member');
    ownerToken = owner.token;
    ownerId = owner.id;
    ownerEmail = owner.email;
    memberToken = member.token;
    memberId = member.id;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Bulk Team ${runId}` });
    teamId = teamRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: member.email });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.notification.deleteMany({
        where: {
          OR: [{ teamId }, { userId: { in: [ownerId, memberId] } }],
        },
      });
      await prisma.teamActivityLog.deleteMany({
        where: {
          OR: [
            { teamId },
            { teamIdSnapshot: teamId },
            { actorId: { in: [ownerId, memberId] } },
          ],
        },
      });
      await prisma.task.deleteMany({
        where: {
          OR: [{ teamId }, { userId: { in: [ownerId, memberId] } }],
        },
      });
      await prisma.category.deleteMany({
        where: {
          OR: [{ teamId }, { userId: { in: [ownerId, memberId] } }],
        },
      });
      await prisma.teamMember.deleteMany({ where: { teamId } });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId] } } });
    }
    await app.close();
  });

  describe('Auth Profile & Password Management', () => {
    it('rejects unauthenticated profile update and invalid name payloads', async () => {
      await request(app.getHttpServer())
        .patch('/api/auth/profile')
        .send({ name: 'New Name' })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '   ' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'A' })
        .expect(400);
    });

    it('updates profile display name cleanly and persists on /api/auth/me', async () => {
      const updateRes = await request(app.getHttpServer())
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: '  Owner Updated  ' })
        .expect(200);

      expect(updateRes.body.name).toBe('Owner Updated');

      const meRes = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(meRes.body.name).toBe('Owner Updated');
    });

    it('enforces currentPassword verification and strong newPassword on password change', async () => {
      await request(app.getHttpServer())
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          currentPassword: 'WrongPassword123!',
          newPassword: 'NewPassword456!',
        })
        .expect(401);

      await request(app.getHttpServer())
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'Password123!',
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'short',
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/api/auth/password')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          currentPassword: 'Password123!',
          newPassword: 'NewPassword456!',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: 'Password123!' })
        .expect(401);

      const loginNew = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: ownerEmail, password: 'NewPassword456!' })
        .expect(200);

      ownerToken = loginNew.body.accessToken as string;
    });
  });

  describe('Bulk Task Operations & Empty Trash', () => {
    let taskAId: number;
    let taskBId: number;
    let personalTaskId: number;

    beforeAll(async () => {
      const tA = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: `Bulk Task A ${runId}`, teamId })
        .expect(201);
      const tB = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: `Bulk Task B ${runId}`, teamId })
        .expect(201);
      const tPersonal = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: `Bulk Personal ${runId}` })
        .expect(201);

      taskAId = tA.body.id;
      taskBId = tB.body.id;
      personalTaskId = tPersonal.body.id;
    });

    it('bulk-status updates authorized tasks and isolates unauthorized ones in failed', async () => {
      // Member cannot change status of owner-created unassigned tasks
      const deniedRes = await request(app.getHttpServer())
        .patch('/api/tasks/bulk-status')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ taskIds: [taskAId, taskBId], status: 'DONE' })
        .expect(200);

      expect(deniedRes.body.succeededIds).toEqual([]);
      expect(deniedRes.body.failed).toHaveLength(2);

      // Owner can bulk-update status to DONE
      const okRes = await request(app.getHttpServer())
        .patch('/api/tasks/bulk-status')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: [taskAId, taskBId], status: 'DONE' })
        .expect(200);

      expect(okRes.body.succeededIds).toEqual([taskAId, taskBId]);
      expect(okRes.body.failed).toEqual([]);
    });

    it('bulk-delete soft deletes DONE team tasks and trash bulk-restore / empty trash honor RBAC & team scope', async () => {
      // Bulk soft-delete both DONE team tasks
      const delRes = await request(app.getHttpServer())
        .post('/api/tasks/bulk-delete')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: [taskAId, taskBId] })
        .expect(200);

      expect(delRes.body.succeededIds).toEqual([taskAId, taskBId]);
      expect(delRes.body.failed).toEqual([]);

      // Member cannot bulk-restore team tasks
      const memberRestore = await request(app.getHttpServer())
        .post('/api/tasks/trash/bulk-restore')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ taskIds: [taskAId] })
        .expect(200);
      expect(memberRestore.body.succeededIds).toEqual([]);
      expect(memberRestore.body.failed).toHaveLength(1);

      // Owner restores taskAId, deletes personalTaskId to trash too
      const ownerRestore = await request(app.getHttpServer())
        .post('/api/tasks/trash/bulk-restore')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: [taskAId] })
        .expect(200);
      expect(ownerRestore.body.succeededIds).toEqual([taskAId]);

      await request(app.getHttpServer())
        .delete(`/api/tasks/${personalTaskId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Now taskBId (teamId) and personalTaskId (personal) are in trash.
      // Emptying trash scoped to teamId should delete ONLY taskBId and preserve personalTaskId.
      const emptyTeamRes = await request(app.getHttpServer())
        .delete(`/api/tasks/trash/empty?teamId=${teamId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(emptyTeamRes.body.succeededIds).toEqual([taskBId]);

      const remainingTrash = await request(app.getHttpServer())
        .get('/api/tasks/trash')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(remainingTrash.body.map((t: { id: number }) => t.id)).toEqual([personalTaskId]);

      // Empty remaining personal trash via bulk-permanent-delete
      const permRes = await request(app.getHttpServer())
        .post('/api/tasks/trash/bulk-permanent-delete')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ taskIds: [personalTaskId] })
        .expect(200);

      expect(permRes.body.succeededIds).toEqual([personalTaskId]);
    });
  });
});
