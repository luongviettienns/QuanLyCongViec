import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { TeamRole } from '@prisma/client';

export interface TeamCallerContext {
  isOwner: boolean;
  callerRole: TeamRole;
}

@Injectable()
export class TeamPolicyService {
  /**
   * Resolves caller's membership and permissions in the team.
   * Throws NotFoundException if the user is neither the owner nor an active member (maintains tenant isolation).
   */
  resolveCallerContext(
    ownerId: number,
    callerMember: { role: TeamRole } | null | undefined,
    userId: number,
  ): TeamCallerContext {
    const isOwner = ownerId === userId;
    if (!isOwner && !callerMember) {
      throw new NotFoundException('Không tìm thấy nhóm');
    }

    return {
      isOwner,
      callerRole: isOwner ? TeamRole.ADMIN : callerMember!.role,
    };
  }

  /**
   * Only owner or ADMIN members can update team information.
   */
  assertCanUpdate(isOwner: boolean, callerRole?: TeamRole): void {
    if (!isOwner && callerRole !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền cập nhật thông tin nhóm');
    }
  }

  /**
   * Only the team owner can dissolve/delete the team.
   */
  assertCanDelete(isOwner: boolean): void {
    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền giải tán nhóm');
    }
  }

  /**
   * Only owner or ADMIN can add members; only owner can directly appoint an ADMIN role.
   */
  assertCanAddMember(
    isOwner: boolean,
    callerRole: TeamRole | undefined,
    requestedRole?: TeamRole,
  ): void {
    if (!isOwner && callerRole !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới có quyền thêm thành viên');
    }

    if (requestedRole === TeamRole.ADMIN && !isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền bổ nhiệm Quản trị viên');
    }
  }

  /**
   * Only the team owner can change a member's role.
   */
  assertCanUpdateMemberRole(
    isOwner: boolean,
    targetMemberUserId: number,
    teamOwnerId: number,
    currentUserId: number,
  ): void {
    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền thay đổi vai trò của thành viên');
    }

    if (targetMemberUserId === teamOwnerId) {
      throw new BadRequestException('Không thể thay đổi vai trò của chủ nhóm');
    }

    if (targetMemberUserId === currentUserId) {
      throw new BadRequestException('Không thể tự thay đổi vai trò của chính mình');
    }
  }

  /**
   * Only the team owner can transfer ownership to another team member.
   */
  assertCanTransferOwnership(
    isOwner: boolean,
    currentUserId: number,
    newOwnerId: number,
  ): void {
    if (!isOwner) {
      throw new ForbiddenException('Chỉ chủ nhóm mới có quyền chuyển quyền sở hữu');
    }

    if (newOwnerId === currentUserId) {
      throw new BadRequestException('Bạn đang là chủ sở hữu của nhóm này');
    }
  }

  /**
   * Evaluates if a member can be removed or self-leave from the team.
   */
  assertCanRemoveMember(
    isOwner: boolean,
    callerRole: TeamRole | undefined,
    targetMemberUserId: number,
    targetMemberRole: TeamRole,
    teamOwnerId: number,
    currentUserId: number,
  ): { isSelfLeaving: boolean } {
    if (targetMemberUserId === teamOwnerId) {
      throw new BadRequestException(
        'Chủ nhóm cần chuyển quyền sở hữu trước khi rời nhóm hoặc bị xóa',
      );
    }

    const isSelfLeaving = targetMemberUserId === currentUserId;

    if (!isSelfLeaving) {
      if (!isOwner && callerRole !== TeamRole.ADMIN) {
        throw new ForbiddenException('Thành viên thường không có quyền xóa thành viên khác');
      }
      if (targetMemberRole === TeamRole.ADMIN && !isOwner) {
        throw new ForbiddenException('Quản trị viên không thể xóa một quản trị viên khác');
      }
    }

    return { isSelfLeaving };
  }

  /**
   * Only the team owner or ADMIN members can view team activity history.
   */
  assertCanViewActivityLogs(isOwner: boolean, callerRole?: TeamRole): void {
    if (!isOwner && callerRole !== TeamRole.ADMIN) {
      throw new ForbiddenException('Chỉ chủ nhóm và quản trị viên mới có quyền xem lịch sử hoạt động');
    }
  }
}
