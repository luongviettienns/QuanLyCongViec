import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { configureTestApp } from './test-app.helper.js';
import { TaskStatus, TeamRole } from '@prisma/client';

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

    it('P0-04: Từ chối xóa Team chỉ còn Task đã soft-delete (HTTP 409)', async () => {
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

      // Deleting team must be blocked!
      const res = await request(app.getHttpServer())
        .delete(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${tokenOwner}`)
        .expect(409);

      expect(res.body.code).toBe('TEAM_HAS_DEPENDENT_DATA');
      expect(res.body.taskCount).toBe(1);
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
  });
});
