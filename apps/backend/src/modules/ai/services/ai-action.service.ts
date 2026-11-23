import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiActionType, AiPendingActionStatus, TeamRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  formatMcpErrorMessage,
  serializeTaskDetail,
} from '../../mcp/utils/mcp-serializers.js';
import type { CreateSubtaskDto } from '../../tasks/dto/create-subtask.dto.js';
import type { CreateTaskDto } from '../../tasks/dto/create-task.dto.js';
import type { UpdateSubtaskDto } from '../../tasks/dto/update-subtask.dto.js';
import type { UpdateTaskDto } from '../../tasks/dto/update-task.dto.js';
import { TasksService } from '../../tasks/tasks.service.js';
import { TeamsService } from '../../teams/teams.service.js';
import {
  serializeAiPendingAction,
  type AiPendingActionDto,
} from './ai-serializers.js';

type SerializedTaskDetail = ReturnType<typeof serializeTaskDetail>;

function requirePositiveInt(value: unknown, errorMessage: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(errorMessage);
  }
  return value;
}

function requireNonEmptyString(value: unknown, errorMessage: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(errorMessage);
  }
  return value.trim();
}

function parseOptionalTeamRole(value: unknown): TeamRole | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value !== TeamRole.ADMIN && value !== TeamRole.MEMBER) {
    throw new BadRequestException('Vai trò thành viên phải là ADMIN hoặc MEMBER');
  }
  return value;
}

function requireTeamRole(value: unknown): TeamRole {
  const role = parseOptionalTeamRole(value);
  if (!role) {
    throw new BadRequestException('Vai trò thành viên phải là ADMIN hoặc MEMBER');
  }
  return role;
}

@Injectable()
export class AiActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly teamsService: TeamsService,
  ) {}

  async confirmAction(
    userId: number,
    actionId: number,
  ): Promise<{
    action: AiPendingActionDto;
    task: SerializedTaskDetail | null;
  }> {
    const now = new Date();

    await this.prisma.aiPendingAction.updateMany({
      where: {
        id: actionId,
        userId,
        status: AiPendingActionStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: { status: AiPendingActionStatus.EXPIRED },
    });

    const claim = await this.prisma.aiPendingAction.updateMany({
      where: {
        id: actionId,
        userId,
        status: AiPendingActionStatus.PENDING,
        expiresAt: { gt: now },
      },
      data: { status: AiPendingActionStatus.EXECUTING },
    });

    if (claim.count === 0) {
      const existing = await this.prisma.aiPendingAction.findFirst({
        where: { id: actionId, userId },
      });

      if (!existing) {
        throw new NotFoundException('Không tìm thấy hành động chờ xác nhận');
      }

      if (
        existing.status === AiPendingActionStatus.EXPIRED ||
        existing.expiresAt <= now
      ) {
        throw new BadRequestException('Đề xuất hành động đã hết hạn xác nhận');
      }

      throw new ConflictException(
        'Đề xuất hành động đã được xử lý hoặc đang thực thi',
      );
    }

    const claimedAction = await this.prisma.aiPendingAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    const rawPayload =
      claimedAction.payload &&
      typeof claimedAction.payload === 'object' &&
      !Array.isArray(claimedAction.payload)
        ? (claimedAction.payload as Record<string, unknown>)
        : {};

    try {
      const { executedTaskId, task } = await this.executeActionPayload(
        userId,
        claimedAction.actionType,
        rawPayload,
      );

      const updatedAction = await this.prisma.aiPendingAction.update({
        where: { id: actionId },
        data: {
          status: AiPendingActionStatus.EXECUTED,
          executedTaskId,
          confirmedAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        action: serializeAiPendingAction(updatedAction),
        task,
      };
    } catch (err) {
      const errorMessage = formatMcpErrorMessage(
        err,
        'Không thể thực thi đề xuất AI lúc này',
      );
      await this.prisma.aiPendingAction.update({
        where: { id: actionId },
        data: {
          status: AiPendingActionStatus.FAILED,
          errorMessage,
        },
      });

      if (err instanceof HttpException) {
        throw err;
      }
      throw new BadRequestException(errorMessage);
    }
  }

  /** Executes a pre-validated write payload directly (used by MCP READ_WRITE tools). */
  executeDirectAction(
    userId: number,
    actionType: AiActionType,
    rawPayload: Record<string, unknown>,
  ): Promise<{ executedTaskId: number | null; task: SerializedTaskDetail | null }> {
    return this.executeActionPayload(userId, actionType, rawPayload);
  }

  private async executeActionPayload(
    userId: number,
    actionType: AiActionType,
    rawPayload: Record<string, unknown>,
  ): Promise<{ executedTaskId: number | null; task: SerializedTaskDetail | null }> {
    switch (actionType) {
      case AiActionType.CREATE_TASK: {
        const created = await this.tasksService.create(
          rawPayload as unknown as CreateTaskDto,
          userId,
        );
        return { executedTaskId: created.id, task: serializeTaskDetail(created) };
      }

      case AiActionType.UPDATE_TASK: {
        const { taskId: rawTaskId, ...updateData } = rawPayload;
        const taskId = requirePositiveInt(rawTaskId, 'Dữ liệu mã công việc (taskId) không hợp lệ');
        const updated = await this.tasksService.update(
          taskId,
          updateData as unknown as UpdateTaskDto,
          userId,
        );
        return { executedTaskId: updated.id, task: serializeTaskDetail(updated) };
      }

      case AiActionType.DELETE_TASK: {
        const taskId = requirePositiveInt(
          rawPayload.taskId,
          'Dữ liệu mã công việc (taskId) không hợp lệ',
        );
        await this.tasksService.remove(taskId, userId);
        return { executedTaskId: taskId, task: null };
      }

      case AiActionType.RESTORE_TASK: {
        const taskId = requirePositiveInt(
          rawPayload.taskId,
          'Dữ liệu mã công việc (taskId) không hợp lệ',
        );
        const restored = await this.tasksService.restore(taskId, userId);
        return { executedTaskId: restored.id, task: serializeTaskDetail(restored) };
      }

      case AiActionType.RETURN_TASK: {
        const taskId = requirePositiveInt(
          rawPayload.taskId,
          'Dữ liệu mã công việc (taskId) không hợp lệ',
        );
        const reason = requireNonEmptyString(
          rawPayload.reason,
          'Dữ liệu lý do trả lại công việc không hợp lệ',
        );
        const returned = await this.tasksService.returnTask(taskId, { reason }, userId);
        return { executedTaskId: returned.id, task: serializeTaskDetail(returned) };
      }

      case AiActionType.CREATE_SUBTASK: {
        const { taskId: rawTaskId, ...subtaskDto } = rawPayload;
        const taskId = requirePositiveInt(rawTaskId, 'Dữ liệu mã công việc (taskId) không hợp lệ');
        await this.tasksService.createSubtask(
          taskId,
          subtaskDto as unknown as CreateSubtaskDto,
          userId,
        );
        const parentTask = await this.tasksService.findOne(taskId, userId);
        return { executedTaskId: taskId, task: serializeTaskDetail(parentTask) };
      }

      case AiActionType.UPDATE_SUBTASK: {
        const { taskId: rawTaskId, subtaskId: rawSubtaskId, ...subtaskDto } = rawPayload;
        const taskId = requirePositiveInt(rawTaskId, 'Dữ liệu mã công việc (taskId) không hợp lệ');
        const subtaskId = requirePositiveInt(
          rawSubtaskId,
          'Dữ liệu mã công việc con (subtaskId) không hợp lệ',
        );
        await this.tasksService.updateSubtask(
          taskId,
          subtaskId,
          subtaskDto as unknown as UpdateSubtaskDto,
          userId,
        );
        const parentTask = await this.tasksService.findOne(taskId, userId);
        return { executedTaskId: taskId, task: serializeTaskDetail(parentTask) };
      }

      case AiActionType.DELETE_SUBTASK: {
        const taskId = requirePositiveInt(
          rawPayload.taskId,
          'Dữ liệu mã công việc (taskId) không hợp lệ',
        );
        const subtaskId = requirePositiveInt(
          rawPayload.subtaskId,
          'Dữ liệu mã công việc con (subtaskId) không hợp lệ',
        );
        await this.tasksService.removeSubtask(taskId, subtaskId, userId);
        const parentTask = await this.tasksService.findOne(taskId, userId);
        return { executedTaskId: taskId, task: serializeTaskDetail(parentTask) };
      }

      case AiActionType.ADD_TEAM_MEMBER: {
        const teamId = requirePositiveInt(rawPayload.teamId, 'Dữ liệu mã nhóm (teamId) không hợp lệ');
        const email = requireNonEmptyString(rawPayload.email, 'Dữ liệu email không hợp lệ');
        const role = parseOptionalTeamRole(rawPayload.role);
        await this.teamsService.addMember(userId, teamId, {
          email,
          ...(role !== undefined ? { role } : {}),
        });
        return { executedTaskId: null, task: null };
      }

      case AiActionType.UPDATE_TEAM_MEMBER_ROLE: {
        const teamId = requirePositiveInt(rawPayload.teamId, 'Dữ liệu mã nhóm (teamId) không hợp lệ');
        const memberId = requirePositiveInt(
          rawPayload.memberId,
          'Dữ liệu mã thành viên (memberId) không hợp lệ',
        );
        const role = requireTeamRole(rawPayload.role);
        await this.teamsService.updateMemberRole(userId, teamId, memberId, { role });
        return { executedTaskId: null, task: null };
      }

      case AiActionType.REMOVE_TEAM_MEMBER: {
        const teamId = requirePositiveInt(rawPayload.teamId, 'Dữ liệu mã nhóm (teamId) không hợp lệ');
        const memberId = requirePositiveInt(
          rawPayload.memberId,
          'Dữ liệu mã thành viên (memberId) không hợp lệ',
        );
        await this.teamsService.removeMember(userId, teamId, memberId);
        return { executedTaskId: null, task: null };
      }

      default:
        throw new BadRequestException('Loại hành động AI không được hỗ trợ');
    }
  }

  async cancelAction(
    userId: number,
    actionId: number,
  ): Promise<{ action: AiPendingActionDto }> {
    const now = new Date();

    await this.prisma.aiPendingAction.updateMany({
      where: {
        id: actionId,
        userId,
        status: AiPendingActionStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: { status: AiPendingActionStatus.EXPIRED },
    });

    const result = await this.prisma.aiPendingAction.updateMany({
      where: {
        id: actionId,
        userId,
        status: AiPendingActionStatus.PENDING,
      },
      data: { status: AiPendingActionStatus.CANCELLED },
    });

    if (result.count === 0) {
      const existing = await this.prisma.aiPendingAction.findFirst({
        where: { id: actionId, userId },
      });

      if (!existing) {
        throw new NotFoundException('Không tìm thấy hành động chờ xác nhận');
      }

      throw new ConflictException(
        'Không thể hủy hành động không ở trạng thái chờ xác nhận',
      );
    }

    const cancelled = await this.prisma.aiPendingAction.findUniqueOrThrow({
      where: { id: actionId },
    });

    return {
      action: serializeAiPendingAction(cancelled),
    };
  }
}
