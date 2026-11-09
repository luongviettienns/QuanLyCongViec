import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../policies/task-workflow-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { type Task, Prisma, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
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

  async updateStatus(
    id: number,
    data: UpdateTaskStatusDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    try {
      const updatedTask = await this.executeInTransaction(externalTx, async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx);
      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });
      const currentTask = await this.queryService.findOne(id, userId, tx);

      const scopeWhere: Prisma.TaskWhereInput = currentTask.teamId
        ? { teamId: currentTask.teamId, deletedAt: null }
        : { userId: currentTask.userId, teamId: null, deletedAt: null };

      if (currentTask.status === data.status) {
        if (data.position === undefined) {
          if (!this.workflowPolicy.canTransition(userId, currentTask, data.status)) {
            throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
          }
          return currentTask;
        }

        if (!this.policy.canReorder(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền sắp xếp công việc này');
        }

        const colTasks = await tx.task.findMany({
          where: {
            ...scopeWhere,
            status: currentTask.status,
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
        });

        const filtered = colTasks.filter((t) => t.id !== id);
        const targetIdx =
          data.position >= 0 && data.position <= filtered.length
            ? data.position
            : filtered.length;
        filtered.splice(targetIdx, 0, currentTask);

        let updatedCurrentTask: Task = currentTask;
        for (let idx = 0; idx < filtered.length; idx++) {
          const item = filtered[idx];
          if (item.id === id) {
            updatedCurrentTask = await tx.task.update({
              where: { id },
              data: { position: idx },
              include: {
                category: true,
                assignee: { select: { id: true, name: true, email: true } },
                team: { select: { id: true, name: true } },
              },
            });
          } else if (item.position !== idx) {
            await tx.task.update({
              where: { id: item.id },
              data: { position: idx },
            });
          }
        }

        return updatedCurrentTask;
      }

      if (!this.workflowPolicy.canTransition(userId, currentTask, data.status)) {
        throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
      }

      if (data.position !== undefined && !this.policy.canReorder(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền sắp xếp công việc này');
      }

      await this.reorderService.reindexColumn(tx, scopeWhere, currentTask.status, [id]);

      const destTasks = await tx.task.findMany({
        where: {
          ...scopeWhere,
          status: data.status,
          deletedAt: null,
          NOT: { id },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      });

      const targetIdx =
        data.position !== undefined && data.position >= 0 && data.position <= destTasks.length
          ? data.position
          : destTasks.length;

      const newDestTasks = [...destTasks];
      newDestTasks.splice(targetIdx, 0, currentTask);

      // Nếu mở lại task từ DONE, kiểm tra xem Assignee có còn thuộc Team không
      let shouldUnassign = false;
      if (currentTask.status === TaskStatus.DONE && data.status !== TaskStatus.DONE) {
        if (currentTask.teamId && currentTask.assigneeId) {
          const isStillMember = this.policy.isTeamMember(currentTask.assigneeId, currentTask.team);
          if (!isStillMember) {
            shouldUnassign = true;
          }
        }
      }

      let updatedCurrentTask: Task = currentTask;
      for (let idx = 0; idx < newDestTasks.length; idx++) {
        const item = newDestTasks[idx];
        if (item.id === id) {
          updatedCurrentTask = await tx.task.update({
            where: { id },
            data: {
              status: data.status,
              position: idx,
              ...(shouldUnassign ? { assignee: { disconnect: true } } : {}),
            },
            include: {
              category: true,
              assignee: { select: { id: true, name: true, email: true } },
              team: { select: { id: true, name: true } },
            },
          });
        } else if (item.position !== idx) {
          await tx.task.update({
            where: { id: item.id },
            data: { position: idx },
          });
        }
      }

      if (shouldUnassign && currentTask.assigneeId) {
        await this.notificationEventService.publish(
          {
            type: 'TASK_UNASSIGNED',
            actorId: userId,
            taskId: currentTask.id,
            taskTitle: currentTask.title,
            previousAssigneeId: currentTask.assigneeId,
            teamId: currentTask.teamId,
          },
          tx,
        );
      }

      if (data.status === TaskStatus.DONE) {
        await this.notificationEventService.publish(
          {
            type: 'TASK_COMPLETED',
            actorId: userId,
            taskId: updatedCurrentTask.id,
            taskTitle: updatedCurrentTask.title,
            teamId: updatedCurrentTask.teamId,
            creatorId: updatedCurrentTask.userId,
            assigneeId: updatedCurrentTask.assigneeId,
          },
          tx,
        );
      } else {
        await this.notificationEventService.publish(
          {
            type: 'TASK_STATUS_CHANGED',
            actorId: userId,
            taskId: updatedCurrentTask.id,
            taskTitle: updatedCurrentTask.title,
            oldStatus: currentTask.status,
            newStatus: data.status,
            teamId: updatedCurrentTask.teamId,
            creatorId: updatedCurrentTask.userId,
            assigneeId: updatedCurrentTask.assigneeId,
          },
          tx,
        );
      }

      return updatedCurrentTask;
    });

    if (!externalTx) {
      void this.realtimeService.emit({
        type: 'TASK_STATUS_CHANGED',
        actorId: userId,
        teamId: updatedTask.teamId,
        targetUserIds: updatedTask.teamId
          ? undefined
          : [updatedTask.userId, ...(updatedTask.assigneeId ? [updatedTask.assigneeId] : [])],
        payload: {
          taskId: updatedTask.id,
          status: updatedTask.status,
          position: updatedTask.position,
          teamId: updatedTask.teamId,
        },
      });
    }

      return updatedTask;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy công việc (có thể đã bị xoá bởi người khác)');
      }
      throw error;
    }
  }
}
