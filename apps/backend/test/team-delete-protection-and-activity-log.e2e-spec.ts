import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { NotificationEventService } from '../src/modules/notifications/services/notification-event.service.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { configureTestApp } from './test-app.helper.js';

describe('P0 & P1: Team Delete Protection & Activity Log Audit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ts = Date.now();

  let tokenOwner = '';
  let ownerId = 0;

  let tokenAdmin = '';
  let adminId = 0;

  let tokenMember = '';
  let memberId = 0;

  let tokenOutsider = '';
  let outsiderId = 0;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    // Register test users
    const regOwner = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `Owner_${ts}`,
        email: `p01_owner_${ts}@test.local`,
        password: 'Password123!',
      })
      .expect(201);
    tokenOwner = regOwner.body.accessToken;
    ownerId = regOwner.body.user.id;

    const regAdmin = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `Admin_${ts}`,
        email: `p01_admin_${ts}@test.local`,
        password: 'Password123!',
      })
      .expect(201);
    tokenAdmin = regAdmin.body.accessToken;
    adminId = regAdmin.body.user.id;

    const regMember = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `Member_${ts}`,
        email: `p01_member_${ts}@test.local`,
        password: 'Password123!',
      })
      .expect(201);
    tokenMember = regMember.body.accessToken;
    memberId = regMember.body.user.id;

    const regOutsider = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        name: `Outsider_${ts}`,
        email: `p01_outsider_${ts}@test.local`,
        password: 'Password123!',
      })
      .expect(201);
    tokenOutsider = regOutsider.body.accessToken;
    outsiderId = regOutsider.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to create team
  async function createTeam(name: string, token: string = tokenOwner) {
    const res = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, description: 'Test team' })
      .expect(201);
    return res.body;
  }

  describe('P0: Ngăn xóa Team làm mất dữ liệu công việc', () => {
    it('P0-01: Cho phép xóa Team trống (chưa có Task hay Category, chỉ có Owner)', async () => {
      const team = await createTeam(`EmptyTeam_${ts}_01`);

      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(res.body.message).toContain('giải tán nhóm thành công');

      const check = await prisma.team.findUnique({ where: { id: team.id } });
      expect(check).toBeNull();
    });

    it('P0-02: Từ chối xóa Team đang có Task TODO (HTTP 409)', async () => {
      const team = await createTeam(`TeamWithTodo_${ts}_02`);

      await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Task TODO ${ts}`,
          teamId: team.id,
          status: 'TODO',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(409);

      expect(res.body.code).toBe('TEAM_HAS_DEPENDENT_DATA');
      expect(res.body.taskCount).toBe(1);

      const check = await prisma.team.findUnique({ where: { id: team.id } });
      expect(check).not.toBeNull();
    });

    it('P0-03: Từ chối xóa Team có toàn bộ Task DONE (HTTP 409)', async () => {
      const team = await createTeam(`TeamWithDone_${ts}_03`);

      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Task To Be Done ${ts}`,
          teamId: team.id,
          status: 'TODO',
        })
        .expect(201);

      // Transition to IN_PROGRESS then DONE
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ status: 'DONE' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(409);

      expect(res.body.code).toBe('TEAM_HAS_DEPENDENT_DATA');
      expect(res.body.taskCount).toBe(1);
    });

    it('P0-04: Cho phép xóa Team khi chỉ còn Task đã soft-delete (xóa cứng task thùng rác và giải tán nhóm)', async () => {
      const team = await createTeam(`TeamWithSoftDeleted_${ts}_04`);

      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Task To Delete ${ts}`,
          teamId: team.id,
          status: 'TODO',
        })
        .expect(201);

      // Soft delete task
      await request(app.getHttpServer())
        .delete(`/api/tasks/${taskRes.body.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify task is soft deleted in DB
      const softDeleted = await prisma.task.findUnique({ where: { id: taskRes.body.id } });
      expect(softDeleted?.deletedAt).not.toBeNull();

      // Deleting team must succeed and clean up soft-deleted task!
      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(res.body.message).toContain('Đã giải tán nhóm thành công');

      const deletedTeam = await prisma.team.findUnique({ where: { id: team.id } });
      expect(deletedTeam).toBeNull();
      const permanentlyDeletedTask = await prisma.task.findUnique({ where: { id: taskRes.body.id } });
      expect(permanentlyDeletedTask).toBeNull();
    });

    it('P0-05: Từ chối xóa Team không có Task nhưng còn Category (HTTP 409)', async () => {
      const team = await createTeam(`TeamWithCategory_${ts}_05`);

      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          name: `Team Cat ${ts}`,
          teamId: team.id,
          color: '#1890ff',
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(409);

      expect(res.body.code).toBe('TEAM_HAS_DEPENDENT_DATA');
      expect(res.body.categoryCount).toBe(1);
      expect(res.body.taskCount).toBe(0);
    });

    it('P0-06: Member hoặc Admin cố giải tán Team nhận HTTP 403', async () => {
      const team = await createTeam(`TeamAuthCheck_${ts}_06`);

      // Add Admin
      const addAdminRes = await request(app.getHttpServer())
        .post(`/api/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_admin_${ts}@test.local`, role: 'ADMIN' })
        .expect(201);
      expect(addAdminRes.body.role).toBe('ADMIN');

      // Add Member
      const addMemRes = await request(app.getHttpServer())
        .post(`/api/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      expect(addMemRes.body.role).toBe('MEMBER');

      // Admin tries to delete team -> 403
      await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(403);

      // Member tries to delete team -> 403
      await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);

      // Outsider tries to delete team -> 404
      await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);
    });

    it('P0-07: DB Foreign Key Restrict ngăn chặn mất dữ liệu / không có task mồ côi khi thao tác đồng thời', async () => {
      const team = await createTeam(`TeamRaceCheck_${ts}_07`);

      // Create a task directly associated with team
      const task = await prisma.task.create({
        data: {
          title: `Direct DB Task ${ts}`,
          userId: ownerId,
          teamId: team.id,
          status: 'TODO',
        },
      });

      // Attempting a raw DB deletion of the team must violate PostgreSQL foreign key RESTRICT constraint!
      await expect(
        prisma.team.delete({
          where: { id: team.id },
        }),
      ).rejects.toThrow();

      // Clean up task before deleting team
      await prisma.task.delete({ where: { id: task.id } });
      await prisma.team.delete({ where: { id: team.id } });
    });
  });

  describe('P1: Activity History cho quản lý thành viên Team', () => {
    let auditTeamId = 0;
    let memberMembershipId = 0;

    beforeAll(async () => {
      const team = await createTeam(`AuditTeam_${ts}`);
      auditTeamId = team.id;
    });

    it('P1-01: Thêm thành viên ghi đúng actorId, targetUserId, newRole trong Activity Log', async () => {
      const addRes = await request(app.getHttpServer())
        .post(`/api/teams/${auditTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      memberMembershipId = addRes.body.id;

      // Query Activity Logs as Owner
      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(logsRes.body).toHaveLength(1);
      const log = logsRes.body[0];
      expect(log.action).toBe('ADD_MEMBER');
      expect(log.actorId).toBe(ownerId);
      expect(log.targetUserId).toBe(memberId);
      expect(log.newRole).toBe('MEMBER');
      expect(log.actor?.name).toContain('Owner');
      expect(log.targetUser?.name).toContain('Member');
    });

    it('P1-02: Đổi role ghi nhận oldRole và newRole chính xác', async () => {
      await request(app.getHttpServer())
        .patch(`/api/teams/${auditTeamId}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      expect(logsRes.body).toHaveLength(2);
      const latestLog = logsRes.body[0];
      expect(latestLog.action).toBe('CHANGE_ROLE');
      expect(latestLog.oldRole).toBe('MEMBER');
      expect(latestLog.newRole).toBe('ADMIN');
      expect(latestLog.actorId).toBe(ownerId);
      expect(latestLog.targetUserId).toBe(memberId);
    });

    it('P1-03: Xóa thành viên có nhiều Task/Subtask: quyền thu hồi & audit ghi metadata đầy đủ', async () => {
      // Create team task assigned to member
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Task of Member ${ts}`,
          teamId: auditTeamId,
          assigneeId: memberId,
          status: 'TODO',
        })
        .expect(201);

      // Create subtask assigned to member
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskRes.body.id}/subtasks`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Subtask of Member ${ts}`,
          assigneeId: memberId,
        })
        .expect(201);

      // Create another task where member is invited as collaborator
      const collabTaskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Collab Task ${ts}`,
          teamId: auditTeamId,
          status: 'TODO',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/tasks/${collabTaskRes.body.id}/collaborators`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ userId: memberId })
        .expect(201);

      // Remove member from team as Owner
      await request(app.getHttpServer())
        .delete(`/api/teams/${auditTeamId}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Check activity log
      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const removeLog = logsRes.body[0];
      expect(removeLog.action).toBe('REMOVE_MEMBER');
      expect(removeLog.actorId).toBe(ownerId);
      expect(removeLog.targetUserId).toBe(memberId);
      expect(removeLog.oldRole).toBe('ADMIN');
      expect(removeLog.metadata).toBeDefined();
      expect(removeLog.metadata.unassignedTaskCount).toBeGreaterThanOrEqual(1);
      expect(removeLog.metadata.affectedSubtaskCount).toBeGreaterThanOrEqual(1);
      expect(removeLog.metadata.revokedCollaboratorCount).toBeGreaterThanOrEqual(1);
    });

    it('P1-04: Thành viên tự rời nhóm ghi nhận LEAVE_TEAM, không nhầm với REMOVE_MEMBER', async () => {
      // Add outsider to team
      const addRes = await request(app.getHttpServer())
        .post(`/api/teams/${auditTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_outsider_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      const outsiderMembershipId = addRes.body.id;

      // Outsider leaves team themselves
      await request(app.getHttpServer())
        .delete(`/api/teams/${auditTeamId}/members/${outsiderMembershipId}`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(200);

      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      const leaveLog = logsRes.body[0];
      expect(leaveLog.action).toBe('LEAVE_TEAM');
      expect(leaveLog.actorId).toBe(outsiderId);
      expect(leaveLog.targetUserId).toBe(outsiderId);
      expect(leaveLog.oldRole).toBe('MEMBER');
    });

    it('P1-05: Transaction rollback không để lại Activity Log giả', async () => {
      const logsBefore = await prisma.teamActivityLog.count({
        where: { teamIdSnapshot: auditTeamId },
      });

      // Simulate a failed transaction that creates a log then throws
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.teamActivityLog.create({
            data: {
              teamIdSnapshot: auditTeamId,
              teamNameSnapshot: 'Simulated Team',
              teamId: auditTeamId,
              actorId: ownerId,
              targetUserId: memberId,
              action: 'ADD_MEMBER',
            },
          });
          throw new Error('Simulated atomic transaction failure');
        }),
      ).rejects.toThrow('Simulated atomic transaction failure');

      const logsAfter = await prisma.teamActivityLog.count({
        where: { teamIdSnapshot: auditTeamId },
      });
      expect(logsAfter).toBe(logsBefore);
    });

    it('P1-06: Xóa rồi thêm lại thành viên vẫn bảo toàn toàn bộ lịch sử trước đó', async () => {
      // Re-add memberId to team
      const reAddRes = await request(app.getHttpServer())
        .post(`/api/teams/${auditTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      expect(reAddRes.body.role).toBe('MEMBER');

      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify new ADD_MEMBER is at the top
      expect(logsRes.body[0].action).toBe('ADD_MEMBER');
      expect(logsRes.body[0].targetUserId).toBe(memberId);

      // Verify older records for memberId (REMOVE_MEMBER, CHANGE_ROLE, initial ADD_MEMBER) are still present
      const memberLogs = logsRes.body.filter((l: any) => l.targetUserId === memberId);
      const actions = memberLogs.map((l: any) => l.action);
      expect(actions).toContain('ADD_MEMBER');
      expect(actions).toContain('CHANGE_ROLE');
      expect(actions).toContain('REMOVE_MEMBER');
      expect(memberLogs.length).toBeGreaterThanOrEqual(4);
    });

    it('P1-RBAC: Chỉ Owner và Admin được xem Activity Logs; Member bị từ chối 403', async () => {
      // Member is currently in team as MEMBER
      await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenMember}`)
        .expect(403);

      // Outsider is not in team -> 404
      await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .expect(404);

      // Owner can view -> 200
      await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Add Admin to team and verify Admin can also view -> 200
      await request(app.getHttpServer())
        .post(`/api/teams/${auditTeamId}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_admin_${ts}@test.local`, role: 'ADMIN' })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);
    });

    it('P1-Transfer: Chuyển quyền sở hữu ghi nhận TRANSFER_OWNER trong Activity Log', async () => {
      await request(app.getHttpServer())
        .patch(`/api/teams/${auditTeamId}/transfer-ownership`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ newOwnerId: adminId })
        .expect(200);

      const logsRes = await request(app.getHttpServer())
        .get(`/api/teams/${auditTeamId}/activity-logs`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .expect(200);

      const transferLog = logsRes.body[0];
      expect(transferLog.action).toBe('TRANSFER_OWNER');
      expect(transferLog.actorId).toBe(ownerId);
      expect(transferLog.targetUserId).toBe(adminId);
    });

    it('P1-Concurrency: Khóa Team và kiểm tra quyền trong transaction chặn thao tác đồng thời dựa trên quyền cũ', async () => {
      // Create new team where Owner A will concurrently transfer ownership to Member and Admin
      const concTeam = await createTeam(`ConcurrentTeam_${ts}`);

      // Add Admin and Member to concTeam
      await request(app.getHttpServer())
        .post(`/api/teams/${concTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_admin_${ts}@test.local`, role: 'ADMIN' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/teams/${concTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      // Concurrently fire two transferOwnership requests from Owner A: one to adminId, one to memberId
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/teams/${concTeam.id}/transfer-ownership`)
          .set('Authorization', `Bearer ${tokenOwner}`)
          .send({ newOwnerId: adminId }),
        request(app.getHttpServer())
          .patch(`/api/teams/${concTeam.id}/transfer-ownership`)
          .set('Authorization', `Bearer ${tokenOwner}`)
          .send({ newOwnerId: memberId }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200) and the second must be rejected (403 Forbidden)
      expect(statuses).toEqual([200, 403]);

      // Verify the final owner in DB is consistent
      const finalTeam = await prisma.team.findUnique({ where: { id: concTeam.id } });
      expect([adminId, memberId]).toContain(finalTeam?.ownerId);
      expect(finalTeam?.ownerId).not.toBe(ownerId);
    });

    it('P1-Atomicity: Notification được tạo nguyên tử trong cùng transaction với addMember và updateMemberRole', async () => {
      const atomTeam = await createTeam(`AtomicityTeam_${ts}`);

      // Add outsider to atomTeam
      await request(app.getHttpServer())
        .post(`/api/teams/${atomTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_outsider_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      // Verify notification for outsider exists in DB with atomTeam.id
      const notifOutsider = await prisma.notification.findFirst({
        where: {
          userId: outsiderId,
          type: 'TEAM_MEMBER_ADDED',
          teamId: atomTeam.id,
        },
      });
      expect(notifOutsider).not.toBeNull();
      expect(notifOutsider?.actorId).toBe(ownerId);
    });

    it('P1-Atomicity-Failure: Thao tác tạo Notification thất bại làm rollback toàn bộ TeamMember và TeamActivityLog', async () => {
      const atomTeam = await createTeam(`AtomFailureTeam_${ts}`);
      const notificationEventService = app.get(NotificationEventService);

      // Spy on publish to throw an intentional error once
      const publishSpy = vi
        .spyOn(notificationEventService, 'publish')
        .mockRejectedValueOnce(new Error('Simulated atomic notification failure'));

      // Attempt to add admin to atomTeam -> must fail with 500
      await request(app.getHttpServer())
        .post(`/api/teams/${atomTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_admin_${ts}@test.local`, role: 'MEMBER' })
        .expect(500);

      publishSpy.mockRestore();

      // Verify that TeamMember was NOT created in DB (rolled back!)
      const memberInDb = await prisma.teamMember.findFirst({
        where: { teamId: atomTeam.id, userId: adminId },
      });
      expect(memberInDb).toBeNull();

      // Verify that TeamActivityLog was NOT created in DB (rolled back!)
      const activityInDb = await prisma.teamActivityLog.findFirst({
        where: { teamIdSnapshot: atomTeam.id, targetUserId: adminId },
      });
      expect(activityInDb).toBeNull();

      // Verify that Notification was NOT created
      const notifInDb = await prisma.notification.findFirst({
        where: { teamId: atomTeam.id, userId: adminId },
      });
      expect(notifInDb).toBeNull();
    });

    it('P1-Idempotency: Thêm lại thành viên hoặc đổi vai trò qua lại không bị lỗi trùng eventKey / không bị skipDuplicates bỏ qua', async () => {
      const cycleTeam = await createTeam(`CycleTeam_${ts}`);

      // 1. Owner adds Member to cycleTeam -> Notification 1
      const addRes = await request(app.getHttpServer())
        .post(`/api/teams/${cycleTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      const membershipId = addRes.body.id;

      // 2. Owner removes Member -> Notification 2
      await request(app.getHttpServer())
        .delete(`/api/teams/${cycleTeam.id}/members/${membershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // 3. Owner adds Member BACK to cycleTeam -> Notification 3 must NOT be skipped!
      await request(app.getHttpServer())
        .post(`/api/teams/${cycleTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      // Query notifications for member in cycleTeam
      const memberNotifs = await prisma.notification.findMany({
        where: {
          teamId: cycleTeam.id,
          userId: memberId,
          type: 'TEAM_MEMBER_ADDED',
        },
        orderBy: { createdAt: 'asc' },
      });

      // Must have exactly 2 distinct TEAM_MEMBER_ADDED notifications!
      expect(memberNotifs).toHaveLength(2);
      expect(memberNotifs[0].eventKey).not.toBe(memberNotifs[1].eventKey);
      expect(memberNotifs[0].eventKey).toContain('activity:');
      expect(memberNotifs[1].eventKey).toContain('activity:');
    });

    it('P1-Role-Cycle: Đổi vai trò qua lại nhiều lần (MEMBER -> ADMIN -> MEMBER) sinh đủ thông báo, không bị trùng eventKey', async () => {
      const roleTeam = await createTeam(`RoleTeam_${ts}`);

      // Add member
      const addRes = await request(app.getHttpServer())
        .post(`/api/teams/${roleTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      const membershipId = addRes.body.id;

      // 1. MEMBER -> ADMIN
      await request(app.getHttpServer())
        .patch(`/api/teams/${roleTeam.id}/members/${membershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      // 2. ADMIN -> MEMBER
      await request(app.getHttpServer())
        .patch(`/api/teams/${roleTeam.id}/members/${membershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ role: 'MEMBER' })
        .expect(200);

      // 3. MEMBER -> ADMIN again
      await request(app.getHttpServer())
        .patch(`/api/teams/${roleTeam.id}/members/${membershipId}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ role: 'ADMIN' })
        .expect(200);

      // Query notifications
      const roleNotifs = await prisma.notification.findMany({
        where: {
          teamId: roleTeam.id,
          userId: memberId,
          type: 'TEAM_ROLE_CHANGED',
        },
        orderBy: { createdAt: 'asc' },
      });

      // Must have all 3 notifications
      expect(roleNotifs).toHaveLength(3);
      const keys = roleNotifs.map((n) => n.eventKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
      for (const k of keys) {
        expect(k).toContain('activity:');
        expect(k).not.toContain('activity:activity:');
      }
    });

    it('P1-MultiRecipient-Transfer: Chuyển quyền sở hữu gửi thông báo cho Owner mới, và sự kiện multi-recipient không bị skip lẫn nhau', async () => {
      const transferTeam = await createTeam(`TransferTeam_${ts}`);

      // Add admin to team
      await request(app.getHttpServer())
        .post(`/api/teams/${transferTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_admin_${ts}@test.local`, role: 'ADMIN' })
        .expect(201);

      // Add member to team
      await request(app.getHttpServer())
        .post(`/api/teams/${transferTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);

      // Transfer ownership to Admin
      await request(app.getHttpServer())
        .patch(`/api/teams/${transferTeam.id}/transfer-ownership`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ newOwnerId: adminId })
        .expect(200);

      // Check notification for new owner (adminId)
      const newOwnerNotif = await prisma.notification.findFirst({
        where: {
          teamId: transferTeam.id,
          userId: adminId,
          type: 'TEAM_OWNERSHIP_TRANSFERRED',
        },
      });
      expect(newOwnerNotif).not.toBeNull();
      expect(newOwnerNotif?.eventKey).toContain(`TEAM_OWNERSHIP_TRANSFERRED:${adminId}:`);
      expect(newOwnerNotif?.eventKey).toContain('activity:');

      // Actor (ownerId) does not receive self-notification per system policy
      const actorNotif = await prisma.notification.findFirst({
        where: {
          teamId: transferTeam.id,
          userId: ownerId,
          type: 'TEAM_OWNERSHIP_TRANSFERRED',
        },
      });
      expect(actorNotif).toBeNull();
    });

    it('P1-PostCommit-Rollback: publish() thành công nhưng câu lệnh DB sau đó quăng lỗi -> rollback và KHÔNG phát SSE ma', async () => {
      const rollbackTeam = await createTeam(`PostCommitRbTeam_${ts}`);
      const notificationEventService = app.get(NotificationEventService);
      const realtimeService = app.get(RealtimeService);

      const emitSpy = vi.spyOn(realtimeService, 'emit');

      // Execute transaction where publish() succeeds but a subsequent error aborts the transaction
      let caughtError: any = null;
      try {
        await prisma.$transaction(async (tx) => {
          // 1. publish() succeeds and registers post-commit hook
          await notificationEventService.publish(
            {
              type: 'TEAM_MEMBER_ADDED',
              actorId: ownerId,
              teamId: rollbackTeam.id,
              teamName: rollbackTeam.name,
              newMemberId: memberId,
              role: 'MEMBER',
              activityLogId: 999999,
            },
            tx,
          );

          // 2. A subsequent DB error occurs inside the transaction
          throw new Error('Simulated query failure after publish in same transaction');
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toBe('Simulated query failure after publish in same transaction');

      // 3. Database must have rolled back: no notification exists!
      const notifInDb = await prisma.notification.findFirst({
        where: {
          teamId: rollbackTeam.id,
          userId: memberId,
          type: 'TEAM_MEMBER_ADDED',
        },
      });
      expect(notifInDb).toBeNull();

      // 4. Realtime emit must NEVER have been called (zero phantom SSE!)
      const notifCalls = emitSpy.mock.calls.filter(
        ([payload]) => payload.type === 'NOTIFICATION_NEW' && payload.teamId === rollbackTeam.id,
      );
      expect(notifCalls).toHaveLength(0);

      emitSpy.mockRestore();
    });

    it('P1-TaskUnassigned-Cycle: Xóa thành viên có task, thêm lại, giao lại rồi xóa lần hai không làm nuốt thông báo TASK_UNASSIGNED thứ hai', async () => {
      const taskTeam = await createTeam(`TaskUnassignTeam_${ts}`);

      // 1. Add member to team
      const memberRes = await request(app.getHttpServer())
        .post(`/api/teams/${taskTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      const membershipId1 = memberRes.body.id;

      // 2. Create task assigned to member
      const taskRes = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({
          title: `Task for Member ${ts}`,
          teamId: taskTeam.id,
          assigneeId: memberId,
        })
        .expect(201);
      const taskId = taskRes.body.id;

      // 3. Owner removes member from team -> TASK_UNASSIGNED #1 created with timestamp
      await request(app.getHttpServer())
        .delete(`/api/teams/${taskTeam.id}/members/${membershipId1}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Verify task in DB has assigneeId: null
      const taskAfterFirstRemoval = await prisma.task.findUnique({ where: { id: taskId } });
      expect(taskAfterFirstRemoval?.assigneeId).toBeNull();

      // Wait a few ms so updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 15));

      // 4. Owner adds member back to team
      const memberRes2 = await request(app.getHttpServer())
        .post(`/api/teams/${taskTeam.id}/members`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ email: `p01_member_${ts}@test.local`, role: 'MEMBER' })
        .expect(201);
      const membershipId2 = memberRes2.body.id;

      // 5. Re-assign task to member
      await request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}/assignee`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .send({ assigneeId: memberId })
        .expect(200);

      // Wait a few ms so next updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 15));

      // 6. Owner removes member from team AGAIN -> TASK_UNASSIGNED #2 must NOT be skipped!
      await request(app.getHttpServer())
        .delete(`/api/teams/${taskTeam.id}/members/${membershipId2}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(200);

      // Query TASK_UNASSIGNED notifications for member
      const unassignedNotifs = await prisma.notification.findMany({
        where: {
          taskId,
          userId: memberId,
          type: 'TASK_UNASSIGNED',
        },
        orderBy: { createdAt: 'asc' },
      });

      // Both notifications must exist!
      expect(unassignedNotifs).toHaveLength(2);
      expect(unassignedNotifs[0].eventKey).not.toBe(unassignedNotifs[1].eventKey);
      // Both eventKeys must include timestamp from updatedAt
      expect(unassignedNotifs[0].eventKey).toMatch(/TASK_UNASSIGNED:\d+:\d+:\d+:\d+/);
      expect(unassignedNotifs[1].eventKey).toMatch(/TASK_UNASSIGNED:\d+:\d+:\d+:\d+/);
    });
  });
});
