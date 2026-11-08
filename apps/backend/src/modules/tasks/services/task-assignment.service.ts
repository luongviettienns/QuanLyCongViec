import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateTaskAssigneeDto } from '../dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from '../dto/return-task.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { type Task, Prisma, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
    private readonly notificationEventService: NotificationEventService,
  ) {}

  private executeInTransaction<T>(
    externalTx: Prisma.TransactionClient | undefined,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (externalTx) {
      return fn(externalTx);
    }
    return this.prisma.$transaction(fn);
  }

  async updateAssignee(
    id: number,
    data: UpdateTaskAssigneeDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    return this.executeInTransaction(externalTx, async (tx) => {
      const currentTask = await this.queryService.findOne(id, userId, tx);

      if (!this.policy.canChangeAssignee(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền phân công công việc này');
      }

      if (data.assigneeId !== undefined && data.assigneeId !== null) {
        if (currentTask.teamId) {
          const isMember = this.policy.isTeamMember(data.assigneeId, currentTask.team);
          if (!isMember) {
            throw new BadRequestException('Người được phân công không thuộc nhóm này');
          }
        } else {
          if (data.assigneeId !== currentTask.userId) {
            throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
          }
        }
      }

      const previousAssigneeId = currentTask.assigneeId;
      const targetAssigneeId = data.assigneeId ?? null;

      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          assignee: data.assigneeId
            ? { connect: { id: data.assigneeId } }
            : { disconnect: true },
        },
        include: {
          category: true,
          assignee: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      });

      if (previousAssigneeId !== targetAssigneeId) {
        if (previousAssigneeId) {
          await this.notificationEventService.publish(
            {
              type: 'TASK_UNASSIGNED',
              actorId: userId,
              taskId: currentTask.id,
              taskTitle: currentTask.title,
              previousAssigneeId,
              teamId: currentTask.teamId,
            },
            tx,
          );
        }

        if (targetAssigneeId) {
          await this.notificationEventService.publish(
            {
              type: 'TASK_ASSIGNED',
              actorId: userId,
              taskId: currentTask.id,
              taskTitle: currentTask.title,
              assigneeId: targetAssigneeId,
              teamId: currentTask.teamId,
            },
            tx,
          );
        }
      }

      return updatedTask;
    });
  }

  async returnTask(id: number, data: ReturnTaskDto, userId: number): Promise<Task> {
    const cleanReason = data.reason?.trim();
    if (!cleanReason) {
      throw new BadRequestException('Vui lòng nhập lý do trả lại công việc');
    }

    return this.prisma.$transaction(async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx);

      if (initialTask.teamId === null) {
        throw new BadRequestException('Công việc cá nhân không thể thực hiện thao tác trả về');
      }

      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });

      const currentTask = await this.queryService.findOne(id, userId, tx);

      if (currentTask.teamId === null) {
        throw new BadRequestException('Công việc cá nhân không thể thực hiện thao tác trả về');
      }

      if (currentTask.status === TaskStatus.DONE) {
        throw new BadRequestException('Không thể trả lại công việc đã hoàn thành');
      }

      if (!this.policy.canReturnTask(userId, currentTask)) {
        throw new ForbiddenException('Chỉ người đang được phân công mới có quyền trả lại công việc');
      }

      const isCreatorMember = this.policy.isTeamMember(currentTask.userId, currentTask.team);
      const newAssigneeId = isCreatorMember ? currentTask.userId : null;
      const scopeWhere: Prisma.TaskWhereInput = { teamId: currentTask.teamId };

      let newPositionInTodo = currentTask.position;
      if (currentTask.status !== TaskStatus.TODO) {
        await this.reorderService.reindexColumn(tx, scopeWhere, currentTask.status, [id]);
        newPositionInTodo = await this.reorderService.getNextPosition(
          tx,
          scopeWhere,
          TaskStatus.TODO,
          [id],
        );
      }

      await this.notificationEventService.publish(
        {
          type: 'TASK_RETURNED',
          actorId: userId,
          taskId: currentTask.id,
          taskTitle: currentTask.title,
          teamId: currentTask.teamId,
          creatorId: currentTask.userId,
          reason: cleanReason,
        },
        tx,
      );

      return tx.task.update({
        where: { id },
        data: {
          assignee: newAssigneeId ? { connect: { id: newAssigneeId } } : { disconnect: true },
          status: TaskStatus.TODO,
          position: newPositionInTodo,
        },
        include: {
          category: true,
          assignee: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
        },
      });
    });
  }
}
