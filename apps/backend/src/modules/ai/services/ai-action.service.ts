import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiActionType, AiPendingActionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  formatMcpErrorMessage,
  serializeTaskDetail,
} from '../../mcp/utils/mcp-serializers.js';
import type { CreateTaskDto } from '../../tasks/dto/create-task.dto.js';
import type { UpdateTaskDto } from '../../tasks/dto/update-task.dto.js';
import { TasksService } from '../../tasks/tasks.service.js';
import {
  serializeAiPendingAction,
  type AiPendingActionDto,
} from './ai-serializers.js';

@Injectable()
export class AiActionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  async confirmAction(
    userId: number,
    actionId: number,
  ): Promise<{
    action: AiPendingActionDto;
    task: ReturnType<typeof serializeTaskDetail>;
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
      let task;
      if (claimedAction.actionType === AiActionType.CREATE_TASK) {
        task = await this.tasksService.create(
          rawPayload as unknown as CreateTaskDto,
          userId,
        );
      } else {
        const { taskId, ...updateData } = rawPayload;
        if (typeof taskId !== 'number' || !Number.isInteger(taskId) || taskId < 1) {
          throw new BadRequestException('Dữ liệu mã công việc (taskId) không hợp lệ');
        }
        task = await this.tasksService.update(
          taskId,
          updateData as unknown as UpdateTaskDto,
          userId,
        );
      }

      const updatedAction = await this.prisma.aiPendingAction.update({
        where: { id: actionId },
        data: {
          status: AiPendingActionStatus.EXECUTED,
          executedTaskId: task.id,
          confirmedAt: new Date(),
          errorMessage: null,
        },
      });

      return {
        action: serializeAiPendingAction(updatedAction),
        task: serializeTaskDetail(task),
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
