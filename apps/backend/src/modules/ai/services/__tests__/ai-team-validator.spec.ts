import { TeamRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamPolicyService } from '../../../teams/policies/team-policy.service.js';
import { AiTeamValidatorService } from '../ai-team-validator.service.js';

function createPrismaMock() {
  return {
    team: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    teamMember: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

function makeTeam(overrides?: Partial<{
  id: number;
  name: string;
  ownerId: number;
  members: Array<{ id: number; teamId: number; userId: number; role: TeamRole }>;
}>) {
  return {
    id: 10,
    name: 'Nhóm Backend',
    ownerId: 1,
    members: [
      { id: 101, teamId: 10, userId: 1, role: TeamRole.ADMIN },
      { id: 102, teamId: 10, userId: 2, role: TeamRole.ADMIN },
      { id: 103, teamId: 10, userId: 3, role: TeamRole.MEMBER },
      { id: 104, teamId: 10, userId: 4, role: TeamRole.MEMBER },
    ],
    ...overrides,
  };
}

describe('AiTeamValidatorService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let teamPolicy: TeamPolicyService;
  let validator: AiTeamValidatorService;

  beforeEach(() => {
    prisma = createPrismaMock();
    teamPolicy = new TeamPolicyService();
    validator = new AiTeamValidatorService(prisma as never, teamPolicy);
  });

  describe('validateAddTeamMemberProposal', () => {
    it('rejects invalid teamId, email, or role with BAD_REQUEST', async () => {
      const badTeam = await validator.validateAddTeamMemberProposal(1, {
        teamId: 0,
        email: 'user@example.com',
      });
      expect(badTeam.ok).toBe(false);
      if (!badTeam.ok) expect(badTeam.code).toBe('BAD_REQUEST');

      const badEmail = await validator.validateAddTeamMemberProposal(1, {
        teamId: 10,
        email: 'not-an-email',
      });
      expect(badEmail).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Định dạng email không hợp lệ',
      });

      const badRole = await validator.validateAddTeamMemberProposal(1, {
        teamId: 10,
        email: 'user@example.com',
        role: 'OWNER',
      });
      expect(badRole).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Vai trò phải là ADMIN hoặc MEMBER',
      });
    });

    it('masks outsider caller or missing team as NOT_FOUND', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(null);
      const missingRes = await validator.validateAddTeamMemberProposal(1, {
        teamId: 10,
        email: 'new@example.com',
      });
      expect(missingRes).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });

      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      const outsiderRes = await validator.validateAddTeamMemberProposal(999, {
        teamId: 10,
        email: 'new@example.com',
      });
      expect(outsiderRes).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });
    });

    it('forbids MEMBER from adding members and forbids non-owner ADMIN from appointing ADMIN', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      const memberRes = await validator.validateAddTeamMemberProposal(3, {
        teamId: 10,
        email: 'new@example.com',
      });
      expect(memberRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ quản trị viên mới có quyền thêm thành viên',
      });

      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      const adminAddAdminRes = await validator.validateAddTeamMemberProposal(2, {
        teamId: 10,
        email: 'new@example.com',
        role: TeamRole.ADMIN,
      });
      expect(adminAddAdminRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ chủ nhóm mới có quyền bổ nhiệm Quản trị viên',
      });
    });

    it('returns NOT_FOUND if target email user does not exist and BAD_REQUEST if already in team', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.user.findUnique.mockResolvedValueOnce(null);
      const missingUserRes = await validator.validateAddTeamMemberProposal(1, {
        teamId: 10,
        email: 'unknown@example.com',
      });
      expect(missingUserRes).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy tài khoản người dùng với email này',
      });

      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 3,
        name: 'Thành viên A',
        email: 'a@example.com',
      });
      const existingMemberRes = await validator.validateAddTeamMemberProposal(1, {
        teamId: 10,
        email: 'a@example.com',
      });
      expect(existingMemberRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Người dùng này đã là thành viên trong nhóm',
      });
    });

    it('accepts valid member addition with normalized email and default MEMBER role', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 5,
        name: 'Thành viên Mới',
        email: 'new.user@example.com',
      });

      const res = await validator.validateAddTeamMemberProposal(2, {
        teamId: 10,
        email: '  New.User@Example.COM  ',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'new.user@example.com' },
        select: { id: true, name: true, email: true },
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'ADD_TEAM_MEMBER',
        payload: {
          teamId: 10,
          email: 'new.user@example.com',
          role: TeamRole.MEMBER,
        },
        preview: {
          kind: 'ADD_TEAM_MEMBER',
          teamId: 10,
          teamName: 'Nhóm Backend',
          targetUser: {
            id: 5,
            name: 'Thành viên Mới',
            email: 'new.user@example.com',
          },
          role: TeamRole.MEMBER,
        },
      });
    });
  });

  describe('validateUpdateTeamMemberRoleProposal', () => {
    it('masks outsider caller as NOT_FOUND', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const res = await validator.validateUpdateTeamMemberRoleProposal(999, {
        teamId: 10,
        memberUserId: 3,
        role: TeamRole.ADMIN,
      });
      expect(res).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });
    });

    it('rejects changing team owner role with BAD_REQUEST', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const res = await validator.validateUpdateTeamMemberRoleProposal(1, {
        teamId: 10,
        memberUserId: 1,
        role: TeamRole.MEMBER,
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Không thể thay đổi vai trò của chủ nhóm',
      });
    });

    it('returns NOT_FOUND when target member does not belong to the team', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce(null);

      const res = await validator.validateUpdateTeamMemberRoleProposal(1, {
        teamId: 10,
        memberUserId: 888,
        role: TeamRole.ADMIN,
      });
      expect(res).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy thành viên trong nhóm này',
      });
    });

    it('forbids non-owner ADMIN or MEMBER from changing another member role or targeting owner', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const adminTargetOwnerRes = await validator.validateUpdateTeamMemberRoleProposal(2, {
        teamId: 10,
        memberUserId: 1,
        role: TeamRole.MEMBER,
      });
      expect(adminTargetOwnerRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ chủ nhóm mới có quyền thay đổi vai trò của thành viên',
      });

      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 103,
        teamId: 10,
        userId: 3,
        role: TeamRole.MEMBER,
        user: { id: 3, name: 'Thành viên A' },
      });

      const res = await validator.validateUpdateTeamMemberRoleProposal(2, {
        teamId: 10,
        memberUserId: 3,
        role: TeamRole.ADMIN,
      });
      expect(res).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ chủ nhóm mới có quyền thay đổi vai trò của thành viên',
      });
    });

    it('resolves TeamMember.id into payload.memberId and returns preview for owner', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 103,
        teamId: 10,
        userId: 3,
        role: TeamRole.MEMBER,
        user: { id: 3, name: 'Thành viên A' },
      });

      const res = await validator.validateUpdateTeamMemberRoleProposal(1, {
        teamId: 10,
        memberUserId: 3,
        role: TeamRole.ADMIN,
      });
      expect(prisma.teamMember.findUnique).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 10, userId: 3 } },
        include: { user: { select: { id: true, name: true } } },
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'UPDATE_TEAM_MEMBER_ROLE',
        payload: {
          teamId: 10,
          memberId: 103,
          memberUserId: 3,
          role: TeamRole.ADMIN,
        },
        preview: {
          kind: 'UPDATE_TEAM_MEMBER_ROLE',
          teamId: 10,
          teamName: 'Nhóm Backend',
          memberUser: { id: 3, name: 'Thành viên A' },
          oldRole: TeamRole.MEMBER,
          newRole: TeamRole.ADMIN,
        },
      });
    });
  });

  describe('validateRemoveTeamMemberProposal', () => {
    it('masks outsider caller as NOT_FOUND', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const res = await validator.validateRemoveTeamMemberProposal(999, {
        teamId: 10,
        memberUserId: 3,
      });
      expect(res).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });
    });

    it('rejects removing team owner with BAD_REQUEST', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const res = await validator.validateRemoveTeamMemberProposal(1, {
        teamId: 10,
        memberUserId: 1,
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm hoặc bị xóa',
      });
    });

    it('forbids MEMBER from removing another member and forbids ADMIN from removing another ADMIN', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 104,
        teamId: 10,
        userId: 4,
        role: TeamRole.MEMBER,
        user: { id: 4, name: 'Thành viên B' },
      });
      const memberKickRes = await validator.validateRemoveTeamMemberProposal(3, {
        teamId: 10,
        memberUserId: 4,
      });
      expect(memberKickRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Thành viên thường không có quyền xóa thành viên khác',
      });

      prisma.team.findUnique.mockResolvedValueOnce(
        makeTeam({
          members: [
            { id: 101, teamId: 10, userId: 1, role: TeamRole.ADMIN },
            { id: 102, teamId: 10, userId: 2, role: TeamRole.ADMIN },
            { id: 105, teamId: 10, userId: 5, role: TeamRole.ADMIN },
          ],
        }),
      );
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 105,
        teamId: 10,
        userId: 5,
        role: TeamRole.ADMIN,
        user: { id: 5, name: 'Quản trị viên 2' },
      });
      const adminKickAdminRes = await validator.validateRemoveTeamMemberProposal(2, {
        teamId: 10,
        memberUserId: 5,
      });
      expect(adminKickAdminRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Quản trị viên không thể xóa một quản trị viên khác',
      });
    });

    it('allows MEMBER self-leave with isSelfLeaving: true and owner removal with isSelfLeaving: false', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 103,
        teamId: 10,
        userId: 3,
        role: TeamRole.MEMBER,
        user: { id: 3, name: 'Thành viên A' },
      });
      const selfLeaveRes = await validator.validateRemoveTeamMemberProposal(3, {
        teamId: 10,
        memberUserId: 3,
      });
      expect(selfLeaveRes).toEqual({
        ok: true,
        actionType: 'REMOVE_TEAM_MEMBER',
        payload: {
          teamId: 10,
          memberId: 103,
          memberUserId: 3,
        },
        preview: {
          kind: 'REMOVE_TEAM_MEMBER',
          teamId: 10,
          teamName: 'Nhóm Backend',
          memberUser: { id: 3, name: 'Thành viên A' },
          memberRole: TeamRole.MEMBER,
          isSelfLeaving: true,
        },
      });

      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.teamMember.findUnique.mockResolvedValueOnce({
        id: 102,
        teamId: 10,
        userId: 2,
        role: TeamRole.ADMIN,
        user: { id: 2, name: 'Quản trị viên' },
      });
      const ownerRemoveAdminRes = await validator.validateRemoveTeamMemberProposal(1, {
        teamId: 10,
        memberUserId: 2,
      });
      expect(ownerRemoveAdminRes).toEqual({
        ok: true,
        actionType: 'REMOVE_TEAM_MEMBER',
        payload: {
          teamId: 10,
          memberId: 102,
          memberUserId: 2,
        },
        preview: {
          kind: 'REMOVE_TEAM_MEMBER',
          teamId: 10,
          teamName: 'Nhóm Backend',
          memberUser: { id: 2, name: 'Quản trị viên' },
          memberRole: TeamRole.ADMIN,
          isSelfLeaving: false,
        },
      });
    });
  });
});
