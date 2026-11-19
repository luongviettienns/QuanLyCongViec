import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiActionType, TeamRole, type TeamMember } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { TeamPolicyService } from '../../teams/policies/team-policy.service.js';
import {
  fail,
  parseRequiredPositiveInt,
  type ValidatedProposalResult,
  type ValidationFailure,
} from './ai-validator.types.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type TeamWithMembers = {
  id: number;
  name: string;
  ownerId: number;
  members: TeamMember[];
};

/** Validates and previews team membership AI action proposals with TeamPolicyService parity. */
@Injectable()
export class AiTeamValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamPolicy: TeamPolicyService,
  ) {}

  /** Validates adding a user by email to a team with optional ADMIN/MEMBER role. */
  async validateAddTeamMemberProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const teamIdCheck = parseRequiredPositiveInt(rawArgs.teamId, 'Mã nhóm');
    if (!teamIdCheck.ok) return teamIdCheck;
    const teamId = teamIdCheck.value;

    const emailCheck = this.parseEmail(rawArgs.email);
    if (!emailCheck.ok) return emailCheck;
    const email = emailCheck.value;

    const roleCheck = this.parseTeamRole(rawArgs.role, false);
    if (!roleCheck.ok) return roleCheck;
    const role = roleCheck.value;

    const teamCheck = await this.resolveTeamAndCaller(teamId, userId);
    if (!teamCheck.ok) return teamCheck;
    const { team, isOwner, callerRole } = teamCheck;

    try {
      this.teamPolicy.assertCanAddMember(isOwner, callerRole, role);
    } catch (error) {
      return this.mapHttpException(error);
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return fail('NOT_FOUND', 'Không tìm thấy tài khoản người dùng với email này');
    }

    const isAlreadyMember =
      team.ownerId === targetUser.id ||
      team.members.some((m) => m.userId === targetUser.id);
    if (isAlreadyMember) {
      return fail('BAD_REQUEST', 'Người dùng này đã là thành viên trong nhóm');
    }

    return {
      ok: true,
      actionType: AiActionType.ADD_TEAM_MEMBER,
      payload: { teamId, email, role },
      preview: {
        kind: 'ADD_TEAM_MEMBER',
        teamId,
        teamName: team.name,
        targetUser: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
        },
        role,
      },
    };
  }

  /** Validates changing a team member's role and resolves TeamMember.id into the payload. */
  async validateUpdateTeamMemberRoleProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const teamIdCheck = parseRequiredPositiveInt(rawArgs.teamId, 'Mã nhóm');
    if (!teamIdCheck.ok) return teamIdCheck;
    const teamId = teamIdCheck.value;

    const memberUserIdCheck = parseRequiredPositiveInt(
      rawArgs.memberUserId,
      'Mã người dùng thành viên',
    );
    if (!memberUserIdCheck.ok) return memberUserIdCheck;
    const memberUserId = memberUserIdCheck.value;

    const roleCheck = this.parseTeamRole(rawArgs.role, true);
    if (!roleCheck.ok) return roleCheck;
    const role = roleCheck.value;

    const teamCheck = await this.resolveTeamAndCaller(teamId, userId);
    if (!teamCheck.ok) return teamCheck;
    const { team, isOwner } = teamCheck;

    if (!isOwner) {
      return fail(
        'FORBIDDEN',
        'Chỉ chủ nhóm mới có quyền thay đổi vai trò của thành viên',
      );
    }

    if (memberUserId === team.ownerId) {
      return fail('BAD_REQUEST', 'Không thể thay đổi vai trò của chủ nhóm');
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: memberUserId } },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!targetMember) {
      return fail('NOT_FOUND', 'Không tìm thấy thành viên trong nhóm này');
    }

    try {
      this.teamPolicy.assertCanUpdateMemberRole(
        isOwner,
        targetMember.userId,
        team.ownerId,
        userId,
      );
    } catch (error) {
      return this.mapHttpException(error);
    }

    return {
      ok: true,
      actionType: AiActionType.UPDATE_TEAM_MEMBER_ROLE,
      payload: {
        teamId,
        memberId: targetMember.id,
        memberUserId,
        role,
      },
      preview: {
        kind: 'UPDATE_TEAM_MEMBER_ROLE',
        teamId,
        teamName: team.name,
        memberUser: {
          id: targetMember.userId,
          name: targetMember.user?.name ?? `Người dùng #${targetMember.userId}`,
        },
        oldRole: targetMember.role,
        newRole: role,
      },
    };
  }

  /** Validates removing a member (or self-leaving) and resolves TeamMember.id into the payload. */
  async validateRemoveTeamMemberProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const teamIdCheck = parseRequiredPositiveInt(rawArgs.teamId, 'Mã nhóm');
    if (!teamIdCheck.ok) return teamIdCheck;
    const teamId = teamIdCheck.value;

    const memberUserIdCheck = parseRequiredPositiveInt(
      rawArgs.memberUserId,
      'Mã người dùng thành viên',
    );
    if (!memberUserIdCheck.ok) return memberUserIdCheck;
    const memberUserId = memberUserIdCheck.value;

    const teamCheck = await this.resolveTeamAndCaller(teamId, userId);
    if (!teamCheck.ok) return teamCheck;
    const { team, isOwner, callerRole } = teamCheck;

    if (memberUserId === team.ownerId) {
      return fail(
        'BAD_REQUEST',
        'Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm hoặc bị xóa',
      );
    }

    const targetMember = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: memberUserId } },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!targetMember) {
      return fail('NOT_FOUND', 'Không tìm thấy thành viên trong nhóm này');
    }

    let isSelfLeaving = false;
    try {
      const removalResult = this.teamPolicy.assertCanRemoveMember(
        isOwner,
        callerRole,
        targetMember.userId,
        targetMember.role,
        team.ownerId,
        userId,
      );
      isSelfLeaving = removalResult.isSelfLeaving;
    } catch (error) {
      return this.mapHttpException(error);
    }

    return {
      ok: true,
      actionType: AiActionType.REMOVE_TEAM_MEMBER,
      payload: {
        teamId,
        memberId: targetMember.id,
        memberUserId,
      },
      preview: {
        kind: 'REMOVE_TEAM_MEMBER',
        teamId,
        teamName: team.name,
        memberUser: {
          id: targetMember.userId,
          name: targetMember.user?.name ?? `Người dùng #${targetMember.userId}`,
        },
        memberRole: targetMember.role,
        isSelfLeaving,
      },
    };
  }

  private async resolveTeamAndCaller(
    teamId: number,
    userId: number,
  ): Promise<
    | { ok: true; team: TeamWithMembers; isOwner: boolean; callerRole: TeamRole }
    | ValidationFailure
  > {
    const team = (await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { members: true },
    })) as TeamWithMembers | null;

    if (!team) {
      return fail('NOT_FOUND', 'Không tìm thấy nhóm');
    }

    const caller = team.members.find((m) => m.userId === userId);
    try {
      const { isOwner, callerRole } = this.teamPolicy.resolveCallerContext(
        team.ownerId,
        caller,
        userId,
      );
      return { ok: true, team, isOwner, callerRole };
    } catch (error) {
      return this.mapHttpException(error);
    }
  }

  private parseEmail(
    rawEmail: unknown,
  ): { ok: true; value: string } | ValidationFailure {
    if (typeof rawEmail !== 'string') {
      return fail('BAD_REQUEST', 'Email không được để trống');
    }
    const cleanEmail = rawEmail.trim().toLowerCase();
    if (!cleanEmail) {
      return fail('BAD_REQUEST', 'Email không được để trống');
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return fail('BAD_REQUEST', 'Định dạng email không hợp lệ');
    }
    return { ok: true, value: cleanEmail };
  }

  private parseTeamRole(
    rawRole: unknown,
    required: boolean,
  ): { ok: true; value: TeamRole } | ValidationFailure {
    if (!required && (rawRole === undefined || rawRole === null)) {
      return { ok: true, value: TeamRole.MEMBER };
    }
    if (rawRole !== TeamRole.ADMIN && rawRole !== TeamRole.MEMBER) {
      return fail('BAD_REQUEST', 'Vai trò phải là ADMIN hoặc MEMBER');
    }
    return { ok: true, value: rawRole };
  }

  private mapHttpException(error: unknown): ValidationFailure {
    if (error instanceof NotFoundException) {
      return fail('NOT_FOUND', error.message);
    }
    if (error instanceof ForbiddenException) {
      return fail('FORBIDDEN', error.message);
    }
    if (error instanceof ConflictException) {
      return fail('CONFLICT', error.message);
    }
    if (error instanceof BadRequestException) {
      return fail('BAD_REQUEST', error.message);
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      if (status === HttpStatus.NOT_FOUND) return fail('NOT_FOUND', error.message);
      if (status === HttpStatus.FORBIDDEN) return fail('FORBIDDEN', error.message);
      if (status === HttpStatus.CONFLICT) return fail('CONFLICT', error.message);
      return fail('BAD_REQUEST', error.message);
    }
    throw error;
  }
}
