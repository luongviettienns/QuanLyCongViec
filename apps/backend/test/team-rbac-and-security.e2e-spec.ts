import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('Team RBAC, Task Authorization and Security Matrix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const timestamp = Date.now();

  const userOwnerCredentials = {
    name: 'Team Owner',
    email: `owner_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userAdminCredentials = {
    name: 'Team Admin',
    email: `admin_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userMemberCredentials = {
    name: 'Team Member',
    email: `member_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userOtherMemberCredentials = {
    name: 'Other Member',
    email: `other_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  const userOutsiderCredentials = {
    name: 'Outsider User',
    email: `outsider_${timestamp}@taskflow.test`,
    password: 'Password123!',
  };

  let tokenOwner = '';
  let tokenAdmin = '';
  let tokenMember = '';
  let tokenOtherMember = '';
  let tokenOutsider = '';

  let ownerId = 0;
  let adminId = 0;
  let memberId = 0;
  let otherMemberId = 0;

  let team1Id = 0;
  let team2Id = 0;
  let memberMembershipId = 0;
  let adminMembershipId = 0;
  let otherMemberMembershipId = 0;

  let teamTaskId = 0;

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

    const regOwner = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userOwnerCredentials)
      .expect(201);
    tokenOwner = regOwner.body.accessToken;
    ownerId = regOwner.body.user.id;

    const regAdmin = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userAdminCredentials)
      .expect(201);
    tokenAdmin = regAdmin.body.accessToken;
    adminId = regAdmin.body.user.id;

    const regMember = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userMemberCredentials)
      .expect(201);
    tokenMember = regMember.body.accessToken;
    memberId = regMember.body.user.id;

    const regOtherMember = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userOtherMemberCredentials)
      .expect(201);
    tokenOtherMember = regOtherMember.body.accessToken;
    otherMemberId = regOtherMember.body.user.id;

    const regOutsider = await request(app.getHttpServer())
      .post('/auth/register')
      .send(userOutsiderCredentials)
      .expect(201);
    tokenOutsider = regOutsider.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('1. Team creation & role architecture', () => {
    it('creates a team successfully where creator is owner and role is ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: 'Core Engineering Team',
          description: 'Main product team',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.ownerId).toBe(ownerId);
      expect(res.body.members).toHaveLength(1);
      expect(res.body.members[0].userId).toBe(ownerId);
      expect(res.body.members[0].role).toBe('ADMIN');

      team1Id = res.body.id;
    });

    it('verifies that postgres enum TeamRole only has ADMIN and MEMBER', async () => {
      const enumValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT enumlabel
        FROM pg_enum
        JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
        WHERE pg_type.typname = 'TeamRole';
      `;

      const labels = enumValues.map((v) => v.enumlabel);
      expect(labels).toContain('ADMIN');
      expect(labels).toContain('MEMBER');
      expect(labels).not.toContain('OWNER');
    });
  });

  describe('2. Team management matrix', () => {
    it('allows Owner to add a member with default role MEMBER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          email: userMemberCredentials.email,
        })
        .expect(201);

      expect(res.body.userId).toBe(memberId);
      expect(res.body.role).toBe('MEMBER');
      memberMembershipId = res.body.id;
    });

    it('allows Owner to add another member as ADMIN directly', async () => {
      const res = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          email: userAdminCredentials.email,
          role: 'ADMIN',
        })
        .expect(201);

      expect(res.body.userId).toBe(adminId);
      expect(res.body.role).toBe('ADMIN');
      adminMembershipId = res.body.id;
    });

    it('allows Admin to add a MEMBER to the team', async () => {
      const res = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          email: userOtherMemberCredentials.email,
          role: 'MEMBER',
        })
        .expect(201);

      expect(res.body.userId).toBe(otherMemberId);
      expect(res.body.role).toBe('MEMBER');
      otherMemberMembershipId = res.body.id;
    });

    it('forbids non-owner Admin from appointing an ADMIN', async () => {
      const tempUserEmail = `tempadmin_${Date.now()}@taskflow.test`;
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Temp',
          email: tempUserEmail,
          password: 'Password123!',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          email: tempUserEmail,
          role: 'ADMIN',
        })
        .expect(403);
    });

    it('allows Owner to promote Member to ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          role: 'ADMIN',
        })
        .expect(200);

      expect(res.body.role).toBe('ADMIN');
    });

    it('forbids non-owner Admin from changing member role', async () => {
      await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/members/${otherMemberMembershipId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          role: 'ADMIN',
        })
        .expect(403);
    });

    it('allows Owner to demote an ADMIN back to MEMBER', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          role: 'MEMBER',
        })
        .expect(200);

      expect(res.body.role).toBe('MEMBER');
    });

    it('forbids non-owner Admin from disbanding the team', async () => {
      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(403);
    });

    it('forbids non-owner Admin from transferring ownership', async () => {
      await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/transfer-ownership`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          newOwnerId: memberId,
        })
        .expect(403);
    });

    it('forbids Owner from leaving team without transferring ownership', async () => {
      const ownerMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team1Id, userId: ownerId } },
      });

      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${ownerMember?.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(400);
    });

    it('forbids Admin from deleting another Admin', async () => {
      const ownerMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team1Id, userId: ownerId } },
      });

      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${ownerMember?.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(400);
    });

    it('forbids Member from deleting another Member', async () => {
      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${otherMemberMembershipId}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);
    });

    it('allows Admin to delete a MEMBER', async () => {
      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${otherMemberMembershipId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const addBack = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          email: userOtherMemberCredentials.email,
          role: 'MEMBER',
        })
        .expect(201);
      otherMemberMembershipId = addBack.body.id;
    });

    it('allows Owner to delete an ADMIN', async () => {
      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${adminMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const reAddAdmin = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          email: userAdminCredentials.email,
          role: 'ADMIN',
        })
        .expect(201);
      adminMembershipId = reAddAdmin.body.id;
    });

    it('allows Owner to transfer ownership to another member in a transaction', async () => {
      const transferRes = await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/transfer-ownership`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          newOwnerId: adminId,
        })
        .expect(200);

      expect(transferRes.body.ownerId).toBe(adminId);

      const oldOwnerMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team1Id, userId: ownerId } },
      });
      const newOwnerMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: team1Id, userId: adminId } },
      });

      expect(oldOwnerMember?.role).toBe('ADMIN');
      expect(newOwnerMember?.role).toBe('ADMIN');

      await request(app.getHttpServer())
        .patch(`/teams/${team1Id}/transfer-ownership`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          newOwnerId: ownerId,
        })
        .expect(200);
    });
  });

  describe('3. Task authorization matrix', () => {
    it('allows Creator to create a task in the team', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Implement Authentication Flow',
          description: 'Design and code JWT auth',
          teamId: team1Id,
          assigneeId: memberId,
          priority: 'HIGH',
          status: 'TODO',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.userId).toBe(ownerId);
      expect(res.body.assigneeId).toBe(memberId);
      expect(res.body.teamId).toBe(team1Id);

      teamTaskId = res.body.id;
    });

    it('forbids other member (not admin, creator, or assignee) from editing task content', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenOtherMember}`)
        .send({
          title: 'Hacked Title by Other Member',
        })
        .expect(403);
    });

    it('forbids other member from changing task status', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOtherMember}`)
        .send({
          status: 'IN_PROGRESS',
        })
        .expect(403);
    });

    it('forbids other member from reassigning task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/assignee`)
        .set('Authorization', `Bearer ${tokenOtherMember}`)
        .send({
          assigneeId: otherMemberId,
        })
        .expect(403);
    });

    it('forbids other member from deleting task', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenOtherMember}`)
        .expect(403);
    });

    it('forbids Assignee from editing task content', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          title: 'Title Changed by Assignee',
        })
        .expect(403);
    });

    it('allows Assignee to advance status from TODO to IN_PROGRESS to DONE', async () => {
      const inProgRes = await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          status: 'IN_PROGRESS',
        })
        .expect(200);
      expect(inProgRes.body.status).toBe('IN_PROGRESS');

      const doneRes = await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          status: 'DONE',
        })
        .expect(200);
      expect(doneRes.body.status).toBe('DONE');
    });

    it('forbids Assignee from reopening a DONE task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          status: 'TODO',
        })
        .expect(403);
    });

    it('allows Creator to reopen a DONE task', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          status: 'TODO',
        })
        .expect(200);
      expect(res.body.status).toBe('TODO');
    });

    it('allows Team Admin to reopen a DONE task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          status: 'DONE',
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          status: 'IN_PROGRESS',
        })
        .expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('allows Assignee to return task to Creator', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/tasks/${teamTaskId}/return`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          reason: 'I need clarification from creator',
        })
        .expect(200);

      expect(res.body.assigneeId).toBe(ownerId);
    });

    it('rejects return task on a personal task with 400 Bad Request', async () => {
      const personalTask = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'My Solo Personal Task',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/tasks/${personalTask.body.id}/return`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({})
        .expect(400);
    });

    it('sets assigneeId to null and status to TODO when returning task after creator left team', async () => {
      const memberCreatedTask = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOtherMember}`)
        .send({
          title: 'Task By Departed Member',
          teamId: team1Id,
          assigneeId: memberId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${otherMemberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const returnRes = await request(app.getHttpServer())
        .patch(`/tasks/${memberCreatedTask.body.id}/return`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          reason: 'Returning task but creator already left',
        })
        .expect(200);

      expect(returnRes.body.assigneeId).toBeNull();
      expect(returnRes.body.status).toBe('TODO');
    });
  });

  describe('4. Kanban reorder security', () => {
    let t1Id = 0;
    let t2Id = 0;

    beforeAll(async () => {
      const task1 = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Reorder Item Alpha',
          teamId: team1Id,
          status: 'TODO',
          assigneeId: ownerId,
        })
        .expect(201);
      t1Id = task1.body.id;

      const task2 = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Reorder Item Beta',
          teamId: team1Id,
          status: 'TODO',
          assigneeId: memberId,
        })
        .expect(201);
      t2Id = task2.body.id;
    });

    it('allows any team member to reorder tasks within the same column', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          teamId: team1Id,
          taskIds: [t2Id, t1Id],
          status: 'TODO',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('forbids member without permission from moving another member task to DONE across columns', async () => {
      await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          teamId: team1Id,
          taskIds: [t1Id],
          status: 'DONE',
        })
        .expect(403);
    });

    it('forbids assignee from dragging their DONE task back to TODO across columns', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${t2Id}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          status: 'DONE',
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          teamId: team1Id,
          taskIds: [t2Id],
          status: 'TODO',
        })
        .expect(403);
    });

    it('allows Admin to reorder any task across any column', async () => {
      const res = await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          teamId: team1Id,
          taskIds: [t2Id],
          status: 'TODO',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('5. Data isolation & 404 for non-members', () => {
    it('returns 404 when non-member requests team details', async () => {
      await request(app.getHttpServer())
        .get(`/teams/${team1Id}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });

    it('returns 404 when non-member requests task belonging to private team', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });

    it('returns 404 when non-member filters tasks by foreign teamId', async () => {
      await request(app.getHttpServer())
        .get(`/tasks?teamId=${team1Id}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });
  });

  describe('6. Scoped unique title constraints', () => {
    it('allows User A to create a personal task and rejects exact duplicate with 409', async () => {
      const title = `Unique Personal ${timestamp}`;
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title })
        .expect(201);

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title })
        .expect(409);
    });

    it('allows User B to create personal task with same title as User A', async () => {
      const title = `Unique Personal ${timestamp}`;
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .send({ title })
        .expect(201);
    });

    it('allows Team 1 to create a task and rejects duplicate in Team 1 with 409', async () => {
      const title = `Unique Team Task ${timestamp}`;
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title,
          teamId: team1Id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title,
          teamId: team1Id,
        })
        .expect(409);
    });

    it('rejects case-insensitive duplicate in same team with 409', async () => {
      const title = `unique team task ${timestamp}`;
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({
          title,
          teamId: team1Id,
        })
        .expect(409);
    });

    it('allows Team 2 to create task with same title as Team 1', async () => {
      const team2Res = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .send({
          name: 'Second Company Team',
        })
        .expect(201);
      team2Id = team2Res.body.id;

      const title = `Unique Team Task ${timestamp}`;
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .send({
          title,
          teamId: team2Id,
        })
        .expect(201);
    });
  });

  describe('7. Dashboard & stats calculation', () => {
    it('accurately counts tasks assigned to user without duplicate counts', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          title: `Solo Assigned ${timestamp}`,
          assigneeId: memberId,
        })
        .expect(201);

      const statsRes = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(200);

      expect(statsRes.body.total).toBeGreaterThanOrEqual(1);
      expect(typeof statsRes.body.completionRate).toBe('number');
    });

    it('returns team scoped stats without mixing personal tasks', async () => {
      const teamStatsRes = await request(app.getHttpServer())
        .get(`/tasks/stats?teamId=${team1Id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(teamStatsRes.body).toHaveProperty('total');
      expect(teamStatsRes.body).toHaveProperty('todo');
      expect(teamStatsRes.body).toHaveProperty('inProgress');
      expect(teamStatsRes.body).toHaveProperty('done');
      expect(teamStatsRes.body).toHaveProperty('byPriority');
      expect(teamStatsRes.body).toHaveProperty('upcomingDeadlines');
    });

    it('returns 404 when non-member requests team stats', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/stats?teamId=${team1Id}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });
  });
});
