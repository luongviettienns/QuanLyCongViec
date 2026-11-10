import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';
import { NotificationEventService } from '../src/modules/notifications/services/notification-event.service.js';
import type { DomainNotificationEvent } from '../src/modules/notifications/types/notification-event.types.js';

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

    it('9. Validation hardening: invalid update payload is rejected with 400', async () => {
      // Empty body
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({})
        .expect(400);

      // Null or empty or invalid title
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: null })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: '' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: '   ' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 123 })
        .expect(400);

      // Null or invalid status
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: null })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'INVALID' })
        .expect(400);

      // Invalid description
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ description: 123 })
        .expect(400);

      // Invalid assigneeId
      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: -1 })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: '123' })
        .expect(400);
    });

    it('10. Valid nullable fields: description: null and assigneeId: null succeed', async () => {
      // Clear description
      const resDesc = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ description: null })
        .expect(200);

      expect(resDesc.body.description).toBeNull();

      // Unassign
      const resAssignee = await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtaskId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: null })
        .expect(200);

      expect(resAssignee.body.assigneeId).toBeNull();
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
        if (st.status === 'TODO') {
          await request(app.getHttpServer())
            .patch(`/api/tasks/${teamTaskId}/subtasks/${st.id}/status`)
            .set('Authorization', `Bearer ${tokenOwner}`)
            .send({ status: 'IN_PROGRESS' })
            .expect(200);
        }
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

    it('4a. While Parent Task is DONE, editing Subtask content is rejected -> 400', async () => {
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/${subtasks.body[0].id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'New Subtask Title' })
        .expect(400);
    });

    it('4b. While Parent Task is DONE, deleting a Subtask is rejected -> 400', async () => {
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/tasks/${teamTaskId}/subtasks/${subtasks.body[0].id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(400);
    });

    it('4c. While Parent Task is DONE, reordering Subtasks is rejected -> 400', async () => {
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${teamTaskId}/subtasks/reorder`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ subtaskIds: subtasks.body.map((s: any) => s.id) })
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

    it('4. Restoring parent task does NOT resurrect subtasks that were individually deleted before the parent task was deleted', async () => {
      // 1. Create a task with 2 subtasks
      const tRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Restore Isolation Task ${Date.now()}`, teamId })
        .expect(201);
      const testTaskId = tRes.body.id;

      const sub1 = await request(app.getHttpServer())
        .post(`/api/tasks/${testTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask To Be Individually Deleted' })
        .expect(201);

      const sub2 = await request(app.getHttpServer())
        .post(`/api/tasks/${testTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask To Survive Cascade Restore' })
        .expect(201);

      // 2. Individually delete subtask 1
      await request(app.getHttpServer())
        .delete(`/api/tasks/${testTaskId}/subtasks/${sub1.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify subtask 1 is deleted
      const checkSubs1 = await request(app.getHttpServer())
        .get(`/api/tasks/${testTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      expect(checkSubs1.body.length).toBe(1);
      expect(checkSubs1.body[0].id).toBe(sub2.body.id);

      // 3. Soft-delete the Parent Task
      await request(app.getHttpServer())
        .delete(`/api/tasks/${testTaskId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // 4. Restore the Parent Task
      await request(app.getHttpServer())
        .post(`/api/tasks/${testTaskId}/restore`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(201);

      // 5. Verify subtask 2 is restored, but subtask 1 is NOT resurrected!
      const checkSubs2 = await request(app.getHttpServer())
        .get(`/api/tasks/${testTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(checkSubs2.body.length).toBe(1);
      expect(checkSubs2.body[0].id).toBe(sub2.body.id);

      const dbSub1 = await prisma.subtask.findUnique({ where: { id: sub1.body.id } });
      expect(dbSub1!.deletedAt).not.toBeNull();
      expect(dbSub1!.deletedWithTask).toBe(false);
    });

    it('5. Moving task to another team revokes collaborators outside new team and unassigns invalid subtask assignees', async () => {
      // Create Team B with only Owner as member
      const teamBRes = await request(app.getHttpServer())
        .post('/api/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ name: `Team B ${Date.now()}` })
        .expect(201);
      const teamBId = teamBRes.body.id;

      // Create a task in Team A with assignee and subtask
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Transfer Test Task ${Date.now()}`, teamId, assigneeId })
        .expect(201);
      const tId = taskRes.body.id;

      // Add memberId as collaborator in Team A task
      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: memberId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      // Create subtask assigned to memberId (accepted collab)
      const subtaskRes = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask for member in Team A', assigneeId: memberId })
        .expect(201);

      // Move task from Team A to Team B (memberId is NOT in Team B)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/team`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ teamId: teamBId, assigneeId: null })
        .expect(200);

      // Collaborator memberId should now be REVOKED
      const collabs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const collabRecord = collabs.body.find((c: any) => c.userId === memberId);
      expect(collabRecord.status).toBe('REVOKED');

      // Subtask assigned to memberId should now be unassigned (assigneeId: null)
      const subtasks = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const sub = subtasks.body.find((s: any) => s.id === subtaskRes.body.id);
      expect(sub.assigneeId).toBeNull();
    });

    it('6. Changing main assignee reassigns their subtasks to the new assignee (or unassigns if unassigned)', async () => {
      // Create a task assigned to Owner
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Handover Subtask Test ${Date.now()}`, teamId, assigneeId: ownerId })
        .expect(201);
      const tId = taskRes.body.id;

      // Create a subtask assigned to Owner
      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask of Owner', assigneeId: ownerId })
        .expect(201);

      // Change main assignee from Owner to assigneeId
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/assignee`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId })
        .expect(200);

      // Verify subtask was handed over to the new assignee
      const subs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const targetSub = subs.body.find((s: any) => s.id === subRes.body.id);
      expect(targetSub.assigneeId).toBe(assigneeId);
    });

    it('7. Reordering subtasks fails with 400 if list is incomplete or contains duplicates', async () => {
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Reorder Validation Task ${Date.now()}`, teamId })
        .expect(201);
      const tId = taskRes.body.id;

      const s1 = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Sub 1' })
        .expect(201);

      const s2 = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Sub 2' })
        .expect(201);

      const s3 = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Sub 3' })
        .expect(201);

      // Incomplete list: only sends 2 of 3 subtasks
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/subtasks/reorder`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ subtaskIds: [s2.body.id, s1.body.id] })
        .expect(400);

      // Duplicate IDs
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/subtasks/reorder`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ subtaskIds: [s1.body.id, s1.body.id, s2.body.id] })
        .expect(400);

      // Valid full reorder: succeeds
      const reorderRes = await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/subtasks/reorder`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ subtaskIds: [s3.body.id, s1.body.id, s2.body.id] })
        .expect(200);

      expect(reorderRes.body.map((s: any) => s.id)).toEqual([s3.body.id, s1.body.id, s2.body.id]);
    });

    it('8. PATCH /api/tasks/:id/team with isTeamChanged=false revokes collaborator and hands over subtask', async () => {
      // 1. Create a task in teamId assigned to Owner
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `MoveTeam Assignee Only ${Date.now()}`, teamId, assigneeId: ownerId })
        .expect(201);
      const tId = taskRes.body.id;

      // 2. Member accepts invitation to become collaborator
      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: memberId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      // 3. Create subtask assigned to Owner
      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask for MoveTeam test', assigneeId: ownerId })
        .expect(201);

      // 4. Update assignee via PATCH /api/tasks/:id/team keeping teamId the same (isTeamChanged = false)
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}/team`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ teamId, assigneeId: memberId })
        .expect(200);

      // Verify Member is no longer a Collaborator (REVOKED)
      const collabs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const memberCollab = collabs.body.find((c: any) => c.userId === memberId);
      expect(memberCollab.status).toBe('REVOKED');

      // Verify subtask was handed over from Owner to Member
      const subs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const updatedSub = subs.body.find((s: any) => s.id === subRes.body.id);
      expect(updatedSub.assigneeId).toBe(memberId);
    });

    it('9. PATCH /api/tasks/:id (general update) changing assignee revokes collaborator and hands over subtask', async () => {
      // 1. Create a task in teamId assigned to Owner
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `General Update Assignee ${Date.now()}`, teamId, assigneeId: ownerId })
        .expect(201);
      const tId = taskRes.body.id;

      // 2. Admin accepts invitation to become collaborator
      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: adminId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      // 3. Create subtask assigned to Owner
      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask for General Update test', assigneeId: ownerId })
        .expect(201);

      // 4. Update assignee via PATCH /api/tasks/:id
      await request(app.getHttpServer())
        .patch(`/api/tasks/${tId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: adminId })
        .expect(200);

      // Verify Admin is no longer a Collaborator (REVOKED)
      const collabs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const adminCollab = collabs.body.find((c: any) => c.userId === adminId);
      expect(adminCollab.status).toBe('REVOKED');

      // Verify subtask was handed over from Owner to Admin
      const subs = await request(app.getHttpServer())
        .get(`/api/tasks/${tId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);
      const updatedSub = subs.body.find((s: any) => s.id === subRes.body.id);
      expect(updatedSub.assigneeId).toBe(adminId);
    });

    it('10. Outsider access isolation: outsider cannot view collaborators or subtasks of team task', async () => {
      await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/api/tasks/${teamTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });
  });

  describe('P0 — Kanban Drag-and-Drop & Position RBAC', () => {
    let kanbanTaskId = 0;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Kanban RBAC Task ${Date.now()}`,
          teamId,
          assigneeId,
        })
        .expect(201);
      kanbanTaskId = res.body.id;
    });

    it('1. Main Assignee cannot reorder within same column (sending position) -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${kanbanTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'TODO', position: 1 })
        .expect(403);
      expect(res.body.message).toContain('không có quyền sắp xếp');
    });

    it('2. Main Assignee cannot transition cross-column with position -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${kanbanTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'IN_PROGRESS', position: 0 })
        .expect(403);
      expect(res.body.message).toContain('không có quyền sắp xếp');
    });

    it('3. Main Assignee CAN transition cross-column WITHOUT position -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${kanbanTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('4. Owner / Admin CAN transition cross-column WITH position -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${kanbanTaskId}/status`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'DONE', position: 0 })
        .expect(200);
      expect(res.body.status).toBe('DONE');
    });

    it('5. Regular Member (not assignee/creator/admin) CANNOT transition or drag -> 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .patch(`/api/tasks/${kanbanTaskId}/status`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ status: 'TODO' })
        .expect(403);
    });
  });

  describe('P0 — Subtask Linear Progression for Collaborator vs Manager', () => {
    let workflowTaskId = 0;
    let workflowSubtaskId = 0;

    beforeAll(async () => {
      // Re-add collab to teamId if previously removed
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p0_collab_${ts}@test.local`, role: 'MEMBER' });

      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Subtask Workflow Task ${Date.now()}`,
          teamId,
          assigneeId,
        })
        .expect(201);
      workflowTaskId = taskRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/tasks/${workflowTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ userId: collabId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${workflowTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${workflowTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({
          title: 'Linear Subtask',
          assigneeId: collabId,
        })
        .expect(201);
      workflowSubtaskId = subRes.body.id;
    });

    it('1. Collaborator cannot skip directly from TODO to DONE -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'DONE' })
        .expect(400);
      expect(res.body.message).toContain('TODO -> IN_PROGRESS');
    });

    it('2. Collaborator cannot edit title, description, or change assigneeId -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ title: 'New title by collab' })
        .expect(403);
      expect(res.body.message).toContain('Bạn không có quyền chỉnh sửa nội dung hoặc người thực hiện');
    });

    it('3. Collaborator can advance subtask TODO -> IN_PROGRESS -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('4. Collaborator cannot reverse subtask IN_PROGRESS -> TODO -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'TODO' })
        .expect(400);
      expect(res.body.message).toContain('IN_PROGRESS -> DONE');
    });

    it('5. Collaborator can advance subtask IN_PROGRESS -> DONE -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'DONE' })
        .expect(200);
      expect(res.body.status).toBe('DONE');
    });

    it('6. Collaborator cannot reopen subtask from DONE -> IN_PROGRESS or DONE -> TODO -> 400 Bad Request', async () => {
      const res1 = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
      expect(res1.body.message).toContain('Không thể thay đổi trạng thái công việc con đã hoàn thành');

      const res2 = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ status: 'TODO' })
        .expect(400);
      expect(res2.body.message).toContain('Không thể thay đổi trạng thái công việc con đã hoàn thành');
    });

    it('7. Manager (Main Assignee / Owner) CAN reopen subtask DONE -> TODO -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'TODO' })
        .expect(200);
      expect(res.body.status).toBe('TODO');
    });

    it('8. Manager (Main Assignee / Owner) CANNOT skip directly from TODO to DONE -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'DONE' })
        .expect(400);
      expect(res.body.message).toContain('Không thể chuyển công việc con trực tiếp từ Cần làm sang Hoàn thành (TODO -> DONE)');
    });

    it('9. Manager can advance subtask properly via TODO -> IN_PROGRESS -> DONE', async () => {
      const res1 = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res1.body.status).toBe('IN_PROGRESS');

      const res2 = await request(app.getHttpServer())
        .patch(`/api/tasks/${workflowTaskId}/subtasks/${workflowSubtaskId}`)
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .send({ status: 'DONE' })
        .expect(200);
      expect(res2.body.status).toBe('DONE');
    });
  });

  describe('P1 — Collaboration Notifications & Recipient Delivery', () => {
    let notifTaskId = 0;

    beforeAll(async () => {
      // Re-add collab to teamId if needed
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p0_collab_${ts}@test.local`, role: 'MEMBER' });

      const res = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Notif Test Task ${Date.now()}`,
          teamId,
          assigneeId,
        })
        .expect(201);
      notifTaskId = res.body.id;
    });

    it('1. Inviting collaborator creates TASK_COLLABORATOR_INVITED for invitee (not inviter)', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${notifTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(201);

      const inviteeNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const inviteNotif = inviteeNotifs.body.items?.find(
        (n: any) => n.type === 'TASK_COLLABORATOR_INVITED' && n.taskId === notifTaskId,
      );
      expect(inviteNotif).toBeDefined();
      expect(inviteNotif.title).toContain('Lời mời phối hợp');

      const inviterNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const selfNotif = inviterNotifs.body.items?.find(
        (n: any) => n.type === 'TASK_COLLABORATOR_INVITED' && n.taskId === notifTaskId,
      );
      expect(selfNotif).toBeUndefined();
    });

    it('2. Accepting invitation creates TASK_COLLABORATOR_ACCEPTED for inviter & creator/assignee', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${notifTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      const ownerNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const acceptNotif = ownerNotifs.body.items?.find(
        (n: any) => n.type === 'TASK_COLLABORATOR_ACCEPTED' && n.taskId === notifTaskId,
      );
      expect(acceptNotif).toBeDefined();
      expect(acceptNotif.content).toContain('đồng ý');
    });

    it('3. Declining invitation creates TASK_COLLABORATOR_DECLINED for inviter', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${notifTaskId}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: memberId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${notifTaskId}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .send({ action: 'DECLINE' })
        .expect(201);

      const ownerNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const declineNotif = ownerNotifs.body.items?.find(
        (n: any) => n.type === 'TASK_COLLABORATOR_DECLINED' && n.taskId === notifTaskId,
      );
      expect(declineNotif).toBeDefined();
      expect(declineNotif.content).toContain('từ chối');
    });

    it('4. Removing collaborator creates TASK_COLLABORATOR_REMOVED for removed user', async () => {
      await request(app.getHttpServer())
        .delete(`/api/tasks/${notifTaskId}/collaborators/${collabId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const collabNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const removeNotif = collabNotifs.body.items?.find(
        (n: any) => n.type === 'TASK_COLLABORATOR_REMOVED' && n.taskId === notifTaskId,
      );
      expect(removeNotif).toBeDefined();
      expect(removeNotif.title).toContain('Thu hồi quyền phối hợp');
    });

    it('5. Assigning subtask creates SUBTASK_ASSIGNED notification for assignee', async () => {
      const subRes = await request(app.getHttpServer())
        .post(`/api/tasks/${notifTaskId}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: 'Notif Subtask',
          assigneeId: assigneeId,
        })
        .expect(201);
      expect(subRes.body.id).toBeGreaterThan(0);

      const asgNotifs = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Authorization', `Bearer ${tokenAssignee}`)
        .expect(200);

      const subNotif = asgNotifs.body.items?.find(
        (n: any) => n.type === 'SUBTASK_ASSIGNED' && n.taskId === notifTaskId,
      );
      expect(subNotif).toBeDefined();
      expect(subNotif.title).toContain('Bạn được phân công việc con mới');
    });

    it('6. Idempotency: duplicate or retried event publishing produces exactly one notification without phantom duplicates', async () => {
      const notificationEventService = app.get(NotificationEventService);
      const testTimestamp = Date.now();
      const testEvent: DomainNotificationEvent = {
        type: 'TASK_COLLABORATOR_INVITED',
        actorId: ownerId,
        taskId: notifTaskId,
        taskTitle: 'Idempotency Test Task',
        teamId,
        invitedUserId: memberId,
        invitedAt: new Date(testTimestamp),
        timestamp: testTimestamp,
      };

      // 1. Publish sequentially twice with same event parameters
      await notificationEventService.publish(testEvent);
      await notificationEventService.publish(testEvent);

      // Verify that recipient has exactly 1 notification for this specific invitation eventKey
      const count = await prisma.notification.count({
        where: {
          userId: memberId,
          type: 'TASK_COLLABORATOR_INVITED',
          taskId: notifTaskId,
          eventKey: { contains: new Date(testTimestamp).toISOString() },
        },
      });
      expect(count).toBe(1);

      // 2. Publish concurrently 3 times for SUBTASK_ASSIGNED
      const subtaskEvent: DomainNotificationEvent = {
        type: 'SUBTASK_ASSIGNED',
        actorId: ownerId,
        taskId: notifTaskId,
        taskTitle: 'Idempotency Test Task',
        teamId,
        subtaskId: 8888,
        subtaskTitle: 'Concurrent Subtask',
        subtaskAssigneeId: memberId,
        assignedAt: new Date(testTimestamp),
        timestamp: testTimestamp,
      };

      await Promise.all([
        notificationEventService.publish(subtaskEvent),
        notificationEventService.publish(subtaskEvent),
        notificationEventService.publish(subtaskEvent),
      ]);

      const subtaskNotifs = await prisma.notification.findMany({
        where: {
          userId: memberId,
          type: 'SUBTASK_ASSIGNED',
          taskId: notifTaskId,
          content: { contains: 'Concurrent Subtask' },
        },
      });
      expect(subtaskNotifs.length).toBe(1);
    });
  });

  describe('P1 — Task Scope Filtering Expansion', () => {
    let taskAssignedToCollab = 0;
    let taskCollabAccepted = 0;
    let taskWithSubtaskOnly = 0;
    let otherTeamId = 0;
    let taskOtherTeam = 0;

    beforeAll(async () => {
      // Re-add collab to teamId if needed
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p0_collab_${ts}@test.local`, role: 'MEMBER' });

      const tRes = await request(app.getHttpServer())
        .post('/api/teams')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ name: `Other Team ${Date.now()}` })
        .expect(201);
      otherTeamId = tRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/teams/${otherTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p0_collab_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      // Task 1: Assigned to collabId in teamId, has subtask assigned to collabId
      const t1 = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Collab Main Task ${Date.now()}`, teamId, assigneeId: collabId })
        .expect(201);
      taskAssignedToCollab = t1.body.id;

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskAssignedToCollab}/subtasks`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ title: 'Subtask for main assignee', assigneeId: collabId })
        .expect(201);

      // Task 2: Assigned to ownerId, collabId accepted as collaborator in teamId (no subtask)
      const t2 = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Collab Invited Task ${Date.now()}`, teamId, assigneeId: ownerId })
        .expect(201);
      taskCollabAccepted = t2.body.id;

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskCollabAccepted}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskCollabAccepted}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      // Task 3: Assigned to ownerId, collabId accepted as collaborator, AND has subtask assigned to collabId
      const t3 = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Subtask Parent Task ${Date.now()}`, teamId, assigneeId: ownerId })
        .expect(201);
      taskWithSubtaskOnly = t3.body.id;

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskWithSubtaskOnly}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: collabId })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskWithSubtaskOnly}/collaborators/respond`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .send({ action: 'ACCEPT' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${taskWithSubtaskOnly}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: 'Subtask for collab', assigneeId: collabId })
        .expect(201);

      // Task 4: In otherTeamId, assigned to collabId
      const t4 = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ title: `Other Team Task ${Date.now()}`, teamId: otherTeamId, assigneeId: collabId })
        .expect(201);
      taskOtherTeam = t4.body.id;
    });

    it('1. scope=collaborating returns only tasks where user is ACCEPTED collaborator', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks?scope=collaborating&teamId=${teamId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(taskCollabAccepted);
      expect(ids).toContain(taskWithSubtaskOnly);
      expect(ids).not.toContain(taskAssignedToCollab);
    });

    it('2. scope=subtasks_assigned_to_me returns only tasks where user has active assigned subtasks', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks?scope=subtasks_assigned_to_me&teamId=${teamId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(taskAssignedToCollab);
      expect(ids).toContain(taskWithSubtaskOnly);
      expect(ids).not.toContain(taskCollabAccepted);
    });

    it('3. scope=my_work returns union of Main Assignee + Collaborator + Subtask Assignee without duplicates', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/tasks?scope=my_work&teamId=${teamId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const ids = res.body.map((t: any) => t.id);
      expect(ids).toContain(taskAssignedToCollab);
      expect(ids).toContain(taskCollabAccepted);
      expect(ids).toContain(taskWithSubtaskOnly);
      expect(ids).not.toContain(taskOtherTeam);

      const uniqueIds = Array.from(new Set(ids));
      expect(ids.length).toBe(uniqueIds.length);
    });

    it('4. teamId combined with scope=my_work restricts to specified team', async () => {
      const resOther = await request(app.getHttpServer())
        .get(`/api/tasks?scope=my_work&teamId=${otherTeamId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      const otherIds = resOther.body.map((t: any) => t.id);
      expect(otherIds).toContain(taskOtherTeam);
      expect(otherIds).not.toContain(taskAssignedToCollab);
      expect(otherIds).not.toContain(taskCollabAccepted);
      expect(otherIds).not.toContain(taskWithSubtaskOnly);
    });

    it('5. GET /api/tasks/stats works accurately for all new scopes', async () => {
      const statsRes = await request(app.getHttpServer())
        .get(`/api/tasks/stats?scope=my_work&teamId=${teamId}`)
        .set('Authorization', `Bearer ${tokenCollab}`)
        .expect(200);

      expect(Number(statsRes.body.total)).toBeGreaterThanOrEqual(3);
    });
  });

});
