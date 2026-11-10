import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('Task Collaboration & Subtasks P0 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ts = Date.now();

  let tokenOwner = '';
  let tokenAdmin = '';
  let tokenAssignee = '';
  let tokenCollab = '';
  let tokenMember = '';
  let tokenOutsider = '';

  let ownerId = 0;
  let adminId = 0;
  let assigneeId = 0;
  let collabId = 0;
  let memberId = 0;
  let outsiderId = 0;

  let teamId = 0;
  let teamTaskId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    async function reg(prefix: string) {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          email: `p0_${prefix}_${ts}@test.local`,
          name: `User ${prefix}`,
          password: 'StrongPassword123!',
        })
        .expect(201);
      return { token: res.body.accessToken as string, id: res.body.user.id as number };
    }

    const o = await reg('owner');
    ownerId = o.id;
    tokenOwner = o.token;

    const ad = await reg('admin');
    adminId = ad.id;
    tokenAdmin = ad.token;

    const asg = await reg('assignee');
    assigneeId = asg.id;
    tokenAssignee = asg.token;

    const col = await reg('collab');
    collabId = col.id;
    tokenCollab = col.token;

    const mem = await reg('member');
    memberId = mem.id;
    tokenMember = mem.token;

    const out = await reg('outsider');
    outsiderId = out.id;
    tokenOutsider = out.token;

    // Create Team
    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ name: `P0 Collab Team ${ts}` })
      .expect(201);
    teamId = teamRes.body.id;

    // Add members to team
    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `p0_admin_${ts}@test.local`, role: 'ADMIN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `p0_assignee_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `p0_collab_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({ email: `p0_member_${ts}@test.local`, role: 'MEMBER' })
      .expect(201);

    // Create a Team Task with Assignee
    const taskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokenOwner}`)
      .send({
        title: `P0 Team Task ${ts}`,
        teamId,
        assigneeId,
      })
      .expect(201);
    teamTaskId = taskRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('P0.1 — Task Collaborator Lifecycle & Authorization', () => {
    it('1. Owner / Admin / Main Assignee can invite a team member as collaborator -> PENDING', async () => {
      // Main Assignee invites Collab
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ userId: collabId })
        .expect(201);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.userId).toBe(collabId);
      expect(res.body.invitedById).toBe(assigneeId);
    });

    it('2. Re-inviting while PENDING returns 409 Conflict', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(409);

      expect(res.body.message).toContain('chờ phản hồi');
    });

    it('3. Inviting self is rejected with 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ userId: assigneeId })
        .expect(400);
    });

    it('4. Inviting Main Assignee is rejected with 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: assigneeId })
        .expect(400);
    });

    it('5. Inviting non-team member is rejected with 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: outsiderId })
        .expect(400);
    });

    it('6. Regular team member cannot invite collaborators -> 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ userId: collabId })
        .expect(403);
    });

    it('7. Invitee can ACCEPT the invitation -> status ACCEPTED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.respondedAt).toBeDefined();
    });

    it('8. Accepting twice is rejected with 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(400);
    });

    it('9. Another user cannot respond on behalf of the invitee', async () => {
      // Member tries to respond for an invitation they do not have
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ action: 'ACCEPT' })
        .expect(404);
    });

    it('10. Re-inviting an ACCEPTED collaborator returns 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(409);
    });

    it('11. Collaborator can view collaborators list', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: any) => c.userId === collabId && c.status === 'ACCEPTED')).toBe(true);
    });

    it('12. Revoking collaborator sets status to REVOKED and allows re-inviting', async () => {
      // Admin revokes Collab
      await request(app.getHttpServer())
        .delete(`/api/tasks/${teamTaskId}/collaborators/${collabId}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      // Verify status is REVOKED
      const list = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const revokedItem = list.body.find((c: any) => c.userId === collabId);
      expect(revokedItem.status).toBe('REVOKED');

      // Re-inviting revoked collaborator succeeds -> PENDING
      const reInvite = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(201);
      expect(reInvite.body.status).toBe('PENDING');

      // Collab declines invitation -> DECLINED
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'DECLINE' })
        .expect(201);

      // Re-inviting declined collaborator succeeds -> PENDING, and Collab accepts
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ userId: collabId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);
    });
  });

  describe('P0.2 — Subtask Management, Assignment & Roles', () => {
    let subtaskId1 = 0;
    let subtaskId2 = 0;

    it('1. Owner / Admin / Main Assignee can create a Subtask', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({
          title: 'Subtask 1 - Setup API',
          description: 'Detailed specs',
          assigneeId: collabId, // ACCEPTED Collaborator
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Subtask 1 - Setup API');
      expect(res.body.assigneeId).toBe(collabId);
      expect(res.body.status).toBe('TODO');
      subtaskId1 = res.body.id;
    });

    it('2. Subtask can be assigned to Main Assignee directly', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Subtask 2 - Write Documentation',
          assigneeId: assigneeId,
        })
        .expect(201);

      expect(res.body.assigneeId).toBe(assigneeId);
      subtaskId2 = res.body.id;
    });

    it('3. Subtask cannot be assigned to non-collaborator or member without accepted invitation', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Invalid Assignment',
          assigneeId: memberId, // member of team but NOT an accepted collaborator
        })
        .expect(400);
    });

    it('4. Collaborator cannot create subtasks -> 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({
          title: 'Collab trying to create subtask',
        })
        .expect(403);
    });

    it('5. Collaborator cannot edit subtask title or reassign -> 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({
          title: 'Hacked title',
        })
        .expect(403);
    });

    it('6. Assigned Collaborator CAN update their own subtask status -> IN_PROGRESS / DONE', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}/status`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({
          status: 'IN_PROGRESS',
        })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('7. Collaborator cannot update subtask assigned to someone else -> 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId2}/status`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({
          status: 'DONE',
        })
        .expect(403);
    });

    it('8. Manager can reorder subtasks', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/reorder`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({
          subtaskIds: [subtaskId2, subtaskId1],
        })
        .expect(200);

      expect(res.body[0].id).toBe(subtaskId2);
      expect(res.body[1].id).toBe(subtaskId1);
    });
  });

  describe('P0.2 — Concurrency & Invariants: Parent DONE Rule', () => {
    it('1. Cannot mark Parent Task as DONE while subtasks are not DONE -> 400', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          status: 'DONE',
        })
        .expect(400);

      expect(res.body.message).toContain('công việc con chưa hoàn thành');
    });

    it('2. Mark all subtasks as DONE, then Parent Task CAN be marked as DONE -> 200', async () => {
      // Get all subtasks
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      for (const st of subtasks.body) {
        await request(app.getHttpServer())
          .patch(`/api/tasks/${teamTaskId}/subtasks/${st.id}/status`)
          .set('Authorization', `Bearer ${tokenOwner}`)
          .send({ status: 'DONE' })
          .expect(200);
      }

      // Now parent task can transition to DONE
      const doneTask = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'DONE' })
        .expect(200);

      expect(doneTask.body.status).toBe('DONE');
    });

    it('3. While Parent Task is DONE, creating a new Subtask is rejected -> 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Forbidden new subtask on DONE parent',
        })
        .expect(400);
    });

    it('4. While Parent Task is DONE, updating an existing Subtask to TODO is rejected -> 400', async () => {
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtasks.body[0].id}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'TODO' })
        .expect(400);
    });

    it('5. Reopening Parent Task to IN_PROGRESS allows adding subtasks again', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      const newSubtask = await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Allowed subtask on reopened parent',
          assigneeId: collabId,
        })
        .expect(201);

      expect(newSubtask.body.id).toBeDefined();
    });

    it('6. Concurrent race condition: Request A (mark Parent DONE) and Request B (create Subtask TODO) cannot result in Parent DONE with incomplete subtask', async () => {
      // Create a fresh task for isolation
      const freshTaskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Concurrent Parent Task ${Date.now()}`,
          teamId,
          assigneeId,
        })
        .expect(201);
      const freshTaskId = freshTaskRes.body.id;

      // Fire concurrent requests:
      // Request A attempts to mark task as DONE
      // Request B attempts to create a TODO subtask
      const reqA = request(app.getHttpServer())
        .patch(`/api/tasks/${freshTaskId}/status`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'DONE' });

      const reqB = request(app.getHttpServer())
        .post(`/api/tasks/${freshTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Concurrent Subtask' });

      const [resA, resB] = await Promise.all([reqA, reqB]);

      // Check final state in database
      const finalTask = await prisma.task.findUnique({
        where: { id: freshTaskId },
        include: { subtasks: { where: { deletedAt: null } } },
      });

      expect(finalTask).toBeDefined();
      if (finalTask!.status === 'DONE') {
        // If parent is DONE, there must be NO non-DONE subtasks!
        const incompleteSubtasks = finalTask!.subtasks.filter((s) => s.status !== 'DONE');
        expect(incompleteSubtasks.length).toBe(0);
        // And resB must have failed with 400
        expect(resB.status).toBe(400);
      } else {
        // If parent is not DONE, resA must have failed with 400
        expect(resA.status).toBe(400);
        expect(finalTask!.subtasks.length).toBeGreaterThan(0);
      }
    });
  });

  describe('P0.1 & P0.2 — Membership Removal & Main Assignee Changes', () => {
    it('1. When Collaborator leaves team or is removed, their collaborator record becomes REVOKED and subtasks unassigned', async () => {
      // Find team member id for Collab
      const team = await request(app.getHttpServer())
        .get(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const collabMember = team.body.members.find((m: any) => m.userId === collabId);
      expect(collabMember).toBeDefined();

      // Remove collab from team
      await request(app.getHttpServer())
        .delete(`/api/teams/${teamId}/members/${collabMember.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify collaborator status on teamTaskId is now REVOKED
      const collabs = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const revokedCollab = collabs.body.find((c: any) => c.userId === collabId);
      expect(revokedCollab.status).toBe('REVOKED');

      // Verify active subtasks previously assigned to Collab are unassigned (assigneeId null, status TODO)
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const unassignedSubtask = subtasks.body.find((s: any) => s.title === 'Allowed subtask on reopened parent');
      expect(unassignedSubtask.assigneeId).toBeNull();
      expect(unassignedSubtask.status).toBe('TODO');
    });

    it('2. Main Assignee changed to a Collaborator automatically revokes their collaborator record', async () => {
      // Add memberId as collaborator
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: memberId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      // Now change main assignee of teamTaskId to memberId
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/assignee`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: memberId })
        .expect(200);

      // Verify memberId collaborator status is now REVOKED
      const collabs = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const memberCollab = collabs.body.find((c: any) => c.userId === memberId);
      expect(memberCollab.status).toBe('REVOKED');
    });

    it('3. Soft-deleting Parent Task cascade soft-deletes Subtasks and blocks actions', async () => {
      await request(app.getHttpServer())
        .delete(`/api/tasks/${teamTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Accessing subtasks of deleted task returns 404
      await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(404);

      // Restoring parent task restores subtasks
      await request(app.getHttpServer())
        .post(`/api/tasks/${teamTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201);

      const restoredSubtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(restoredSubtasks.body.length).toBeGreaterThan(0);
    });
  });
});
