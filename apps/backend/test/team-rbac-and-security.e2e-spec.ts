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
          status: 'IN_PROGRESS',
        })
        .expect(200);

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

    it('restricts board reorder to team managers (forbids regular member, allows owner/admin)', async () => {
      // Regular member receives 403 Forbidden
      await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          teamId: team1Id,
          taskIds: [t2Id, t1Id],
          status: 'TODO',
        })
        .expect(403);

      // Owner receives 200 OK
      const res = await request(app.getHttpServer())
        .patch('/tasks/reorder')
        .set('Authorization', `Bearer ${tokenOwner}`)
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
          status: 'IN_PROGRESS',
        })
        .expect(200);

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

    it('excludes team tasks from findAll and stats after creator has left team', async () => {
      const leaverEmail = `leaver_${Date.now()}@taskflow.test`;
      const leaverReg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Team Leaver',
          email: leaverEmail,
          password: 'Password123!',
        })
        .expect(201);
      const leaverToken = leaverReg.body.accessToken;

      const addRes = await request(app.getHttpServer())
        .post(`/teams/${team1Id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          email: leaverEmail,
          role: 'MEMBER',
        })
        .expect(201);
      const leaverMemberId = addRes.body.id;

      const teamTaskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${leaverToken}`)
        .send({
          title: `Leaver Team Task ${Date.now()}`,
          teamId: team1Id,
        })
        .expect(201);
      const taskCreatedByLeaverId = teamTaskRes.body.id;

      const personalTaskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${leaverToken}`)
        .send({
          title: `Leaver Personal Task ${Date.now()}`,
        })
        .expect(201);
      const personalTaskId = personalTaskRes.body.id;

      await request(app.getHttpServer())
        .delete(`/teams/${team1Id}/members/${leaverMemberId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const allTasksRes = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${leaverToken}`)
        .expect(200);
      const allTaskIds = allTasksRes.body.map((t: { id: number }) => t.id);
      expect(allTaskIds).toContain(personalTaskId);
      expect(allTaskIds).not.toContain(taskCreatedByLeaverId);

      const createdTasksRes = await request(app.getHttpServer())
        .get('/tasks?scope=created_by_me')
        .set('Authorization', `Bearer ${leaverToken}`)
        .expect(200);
      const createdTaskIds = createdTasksRes.body.map((t: { id: number }) => t.id);
      expect(createdTaskIds).toContain(personalTaskId);
      expect(createdTaskIds).not.toContain(taskCreatedByLeaverId);

      const leaverStatsRes = await request(app.getHttpServer())
        .get('/tasks/stats')
        .set('Authorization', `Bearer ${leaverToken}`)
        .expect(200);
      expect(leaverStatsRes.body.total).toBe(1);
    });
  });

  describe('8. Cross-team and Team-to-Personal transfer integrity', () => {
    let transferTaskId = 0;

    beforeAll(async () => {
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Movable Task ${Date.now()}`,
          teamId: team1Id,
          assigneeId: memberId,
        })
        .expect(201);
      transferTaskId = taskRes.body.id;
    });

    it('rejects moving task to another team with assignee who is not member of target team', async () => {
      const teamBRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Team B Target ${Date.now()}`,
        })
        .expect(201);
      const teamBId = teamBRes.body.id;

      await request(app.getHttpServer())
        .put(`/tasks/${transferTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: teamBId,
          assigneeId: memberId,
        })
        .expect(400);
    });

    it('auto-clears non-member assignee when transferring task to another team without assignee param', async () => {
      const teamCRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Team C Target ${Date.now()}`,
        })
        .expect(201);
      const teamCId = teamCRes.body.id;

      const movedRes = await request(app.getHttpServer())
        .put(`/tasks/${transferTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: teamCId,
        })
        .expect(200);

      expect(movedRes.body.teamId).toBe(teamCId);
      expect(movedRes.body.assigneeId).toBeNull();
    });

    it('rejects converting team task to personal task with another user as assignee', async () => {
      await request(app.getHttpServer())
        .put(`/tasks/${transferTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: null,
          assigneeId: memberId,
        })
        .expect(400);
    });

    it('auto-clears assignee when converting team task to personal task without assignee param', async () => {
      const movedPersonal = await request(app.getHttpServer())
        .put(`/tasks/${transferTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: null,
        })
        .expect(200);

      expect(movedPersonal.body.teamId).toBeNull();
      expect(movedPersonal.body.assigneeId).toBeNull();
    });

    it('allows dedicated PATCH /tasks/:id/team endpoint to move task to another team', async () => {
      const teamDRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Team D Target ${Date.now()}`,
        })
        .expect(201);
      const teamDId = teamDRes.body.id;

      const patchTeamRes = await request(app.getHttpServer())
        .patch(`/tasks/${transferTaskId}/team`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: teamDId,
        })
        .expect(200);

      expect(patchTeamRes.body.teamId).toBe(teamDId);
      expect(patchTeamRes.body.assigneeId).toBeNull();
    });
  });

  describe('Team Categories (GitHub-Style Labels) and Task Scoping', () => {
    let teamCategoryId = 0;
    let personalCategoryId = 0;

    it('allows team admin/owner to create a team category', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Team Bug ${Date.now()}`,
          color: '#ff4d4f',
          teamId: team1Id,
        })
        .expect(201);

      expect(res.body.teamId).toBe(team1Id);
      expect(res.body.name).toContain('Team Bug');
      teamCategoryId = res.body.id;
    });

    it('forbids normal team member from creating team category', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({
          name: `Member Cat ${Date.now()}`,
          color: '#52c41a',
          teamId: team1Id,
        })
        .expect(403);
    });

    it('allows all team members to view team categories via GET /categories?teamId=', async () => {
      const res = await request(app.getHttpServer())
        .get(`/categories?teamId=${team1Id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const catIds = res.body.map((c: { id: number }) => c.id);
      expect(catIds).toContain(teamCategoryId);
    });

    it('creates personal category with teamId null', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Personal Notes ${Date.now()}`,
          color: '#1890ff',
        })
        .expect(201);

      expect(res.body.teamId).toBeNull();
      personalCategoryId = res.body.id;
    });

    it('allows creating team task with valid team category', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Team Task With Category ${Date.now()}`,
          teamId: team1Id,
          categoryId: teamCategoryId,
        })
        .expect(201);

      expect(res.body.teamId).toBe(team1Id);
      expect(res.body.categoryId).toBe(teamCategoryId);
      expect(res.body.category.name).toContain('Team Bug');
    });

    it('rejects creating team task with personal category (must use team category)', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Invalid Scope Task ${Date.now()}`,
          teamId: team1Id,
          categoryId: personalCategoryId,
        })
        .expect(400);

      expect(res.body.message).toContain('không thuộc nhóm này');
    });

    it('rejects creating personal task with team category', async () => {
      await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Invalid Personal Task ${Date.now()}`,
          categoryId: teamCategoryId,
        })
        .expect(404);
    });

    it('rejects invalid teamId query parameter on GET /categories with 400', async () => {
      await request(app.getHttpServer())
        .get('/categories?teamId=1abc')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/categories?scope=invalid_scope')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(400);
    });

    it('clears categoryId when moving team task to personal space', async () => {
      // 1. Create a task in team 1 with team 1's category
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Move Task Test ${Date.now()}`,
          teamId: team1Id,
          categoryId: teamCategoryId,
        })
        .expect(201);

      expect(taskRes.body.categoryId).toBe(teamCategoryId);

      // 2. Move task to personal space (teamId: null), which does not own this team category
      const patchRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskRes.body.id}/team`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: null,
        })
        .expect(200);

      expect(patchRes.body.teamId).toBeNull();
      expect(patchRes.body.categoryId).toBeNull();
    });

    it('allows updating teamId and categoryId in the same PATCH /tasks/:id request when category belongs to target team', async () => {
      // 1. Create a target team owned by Owner
      const targetTeamRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Target Team Alpha ${Date.now()}`,
        })
        .expect(201);
      const targetTeamId = targetTeamRes.body.id;

      // 2. Create a category in targetTeam
      const targetTeamCatRes = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Alpha Feature ${Date.now()}`,
          color: '#52c41a',
          teamId: targetTeamId,
        })
        .expect(201);
      const targetTeamCatId = targetTeamCatRes.body.id;

      // 3. Create task in team1 with team1's category
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Move Team And Category Task ${Date.now()}`,
          teamId: team1Id,
          categoryId: teamCategoryId,
        })
        .expect(201);

      // 4. Move task to targetTeam AND set targetTeam's category in the same request
      const patchRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: targetTeamId,
          categoryId: targetTeamCatId,
        })
        .expect(200);

      expect(patchRes.body.teamId).toBe(targetTeamId);
      expect(patchRes.body.categoryId).toBe(targetTeamCatId);
    });

    it('rejects updating teamId and categoryId in the same request if category does not belong to target team', async () => {
      // 1. Create target team
      const targetTeamRes = await request(app.getHttpServer())
        .post('/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Target Team Beta ${Date.now()}`,
        })
        .expect(201);
      const targetTeamId = targetTeamRes.body.id;

      // 2. Create task in team1 with team1's category
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Invalid Target Cat Task ${Date.now()}`,
          teamId: team1Id,
          categoryId: teamCategoryId,
        })
        .expect(201);

      // 3. Try moving to targetTeam while keeping team1's category (which does NOT belong to targetTeam)
      const patchRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: targetTeamId,
          categoryId: teamCategoryId, // Belongs to team1, not targetTeam!
        })
        .expect(400);

      expect(patchRes.body.message).toContain('không thuộc nhóm này');

      // Verify task in DB was rolled back and is unchanged
      const checkRes = await request(app.getHttpServer())
        .get(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(checkRes.body.teamId).toBe(team1Id);
      expect(checkRes.body.categoryId).toBe(teamCategoryId);
    });

    it('allows moving team task to personal space and setting personal category in the same request', async () => {
      // 1. Create task in team1 with team1's category
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Move To Personal Task ${Date.now()}`,
          teamId: team1Id,
          categoryId: teamCategoryId,
        })
        .expect(201);

      // 2. Move to personal space (teamId: null) and assign personal category in the same request
      const patchRes = await request(app.getHttpServer())
        .patch(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: null,
          categoryId: personalCategoryId,
        })
        .expect(200);

      expect(patchRes.body.teamId).toBeNull();
      expect(patchRes.body.categoryId).toBe(personalCategoryId);
    });

    it('rejects moving team task to personal space if category is a team category', async () => {
      // 1. Create task in team1
      const taskRes = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Personal With Team Cat Task ${Date.now()}`,
          teamId: team1Id,
        })
        .expect(201);

      // 2. Try moving to personal while assigning team1's category
      await request(app.getHttpServer())
        .patch(`/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          teamId: null,
          categoryId: teamCategoryId,
        })
        .expect(404);
    });

    it('rejects JWT via URL query parameter on standard REST endpoints', async () => {
      await request(app.getHttpServer())
        .get(`/tasks?token=${tokenOwner}`)
        .expect(401);
    });

    it('rejects /realtime/stream when token is missing', async () => {
      await request(app.getHttpServer())
        .get('/realtime/stream')
        .expect(401);
    });
  });
});
