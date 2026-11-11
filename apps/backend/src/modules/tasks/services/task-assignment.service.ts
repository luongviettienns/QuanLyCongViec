import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateTaskAssigneeDto } from '../dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from '../dto/return-task.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { type Task, Prisma, TaskStatus } from '@prisma/client';

export interface MainAssigneeHandoverResult {
  affectedSubtaskIds: number[];
  revokedCollaboratorUserId: number | null;
}

export interface MainAssigneeHandoverContext {
  actorId: number;
  taskTitle: string;
  teamId: number | null;
  mutationTime: Date;
}

@Injectable()
export class TaskAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
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

  async updateAssignee(
    id: number,
    data: UpdateTaskAssigneeDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    // `undefined` (missing field / empty body) is NOT an unassign request: only an explicit `null` is.
    if (data.assigneeId === undefined) {
      throw new BadRequestException(
        'Vui lòng cung cấp assigneeId (gửi null nếu muốn hủy phân công)',
      );
    }
    const targetAssigneeId: number | null = data.assigneeId;

    let previousAssigneeId: number | null = null;
    let handoverResult: MainAssigneeHandoverResult = {
      affectedSubtaskIds: [],
      revokedCollaboratorUserId: null,
    };

    try {
      const updatedTask = await this.executeInTransaction(externalTx, async (tx) => {
        const initialTask = await this.queryService.findOne(id, userId, tx);
        await this.reorderService.lockScope(tx, {
          teamId: initialTask.teamId,
          userId: initialTask.userId,
        });
        const currentTask = await this.queryService.findOne(id, userId, tx);

        if (currentTask.status === TaskStatus.DONE) {
          throw new BadRequestException(
            'Không thể thay đổi người thực hiện khi công việc đã hoàn thành. Vui lòng mở lại công việc trước khi phân công lại.',
          );
        }

        if (!this.policy.canChangeAssignee(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền phân công công việc này');
        }

        if (targetAssigneeId !== null) {
          if (currentTask.teamId) {
            const isMember = this.policy.isTeamMember(targetAssigneeId, currentTask.team);
            if (!isMember) {
              throw new BadRequestException('Người được phân công không thuộc nhóm này');
            }
          } else {
            if (targetAssigneeId !== currentTask.userId) {
              throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
            }
          }
        }

        previousAssigneeId = currentTask.assigneeId;

        const savedTask = await tx.task.update({
          where: { id },
          data: {
            assignee: targetAssigneeId
              ? { connect: { id: targetAssigneeId } }
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

        // Unified business logic: revoke collaborator role if target user is now main assignee,
        // hand over subtasks, and ensure no subtask remains with an ineligible assignee.
        handoverResult = await this.handleMainAssigneeChange(
          tx,
          id,
          previousAssigneeId,
          targetAssigneeId,
          undefined,
          {
            actorId: userId,
            taskTitle: savedTask.title,
            teamId: savedTask.teamId,
            mutationTime: savedTask.updatedAt,
          },
        );

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
                timestamp: savedTask.updatedAt.getTime(),
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
                timestamp: savedTask.updatedAt.getTime(),
              },
              tx,
            );
          }
        }

        return savedTask;
      });

      if (!externalTx) {
        void this.realtimeService.emit({
          type: 'TASK_ASSIGNED',
          actorId: userId,
          teamId: updatedTask.teamId,
          targetUserIds: updatedTask.teamId
            ? undefined
            : [updatedTask.userId, ...(updatedTask.assigneeId ? [updatedTask.assigneeId] : [])],
          payload: {
            taskId: updatedTask.id,
            assigneeId: updatedTask.assigneeId,
            previousAssigneeId,
          },
        });

        for (const subId of handoverResult.affectedSubtaskIds) {
          void this.realtimeService.emit({
            type: 'SUBTASK_UPDATED',
            actorId: userId,
            teamId: updatedTask.teamId,
            targetUserIds: updatedTask.teamId
              ? undefined
              : [updatedTask.userId, ...(updatedTask.assigneeId ? [updatedTask.assigneeId] : [])],
            payload: {
              taskId: updatedTask.id,
              subtaskId: subId,
            },
          });
        }

        if (handoverResult.revokedCollaboratorUserId) {
          void this.realtimeService.emit({
            type: 'TASK_COLLABORATORS_CHANGED',
            actorId: userId,
            teamId: updatedTask.teamId,
            payload: {
              taskId: updatedTask.id,
              action: 'REMOVE',
              userId: handoverResult.revokedCollaboratorUserId,
              status: 'REVOKED',
            },
          });
        }
      }

      return updatedTask;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Không tìm thấy công việc (có thể đã bị xoá bởi người khác)');
      }
      throw error;
    }
  }

  async returnTask(id: number, data: ReturnTaskDto, userId: number): Promise<Task> {
    const cleanReason = data.reason?.trim();
    if (!cleanReason) {
      throw new BadRequestException('Vui lòng nhập lý do trả lại công việc');
    }

    let handoverResult: MainAssigneeHandoverResult = {
      affectedSubtaskIds: [],
      revokedCollaboratorUserId: null,
    };

    const returnedTask = await this.prisma.$transaction(async (tx) => {
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

      const savedReturnedTask = await tx.task.update({
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

      // Unified business logic: hand over subtasks and re-validate assignees
      handoverResult = await this.handleMainAssigneeChange(
        tx,
        id,
        currentTask.assigneeId,
        newAssigneeId,
        undefined,
        {
          actorId: userId,
          taskTitle: savedReturnedTask.title,
          teamId: savedReturnedTask.teamId,
          mutationTime: savedReturnedTask.updatedAt,
        },
      );

      await this.notificationEventService.publish(
        {
          type: 'TASK_RETURNED',
          actorId: userId,
          taskId: currentTask.id,
          taskTitle: currentTask.title,
          teamId: currentTask.teamId,
          creatorId: currentTask.userId,
          reason: cleanReason,
          timestamp: savedReturnedTask.updatedAt.getTime(),
        },
        tx,
      );

      return savedReturnedTask;
    });

    void this.realtimeService.emit({
      type: 'TASK_RETURNED',
      actorId: userId,
      teamId: returnedTask.teamId,
      payload: {
        taskId: returnedTask.id,
        assigneeId: returnedTask.assigneeId,
        status: returnedTask.status,
      },
    });

    for (const subId of handoverResult.affectedSubtaskIds) {
      void this.realtimeService.emit({
        type: 'SUBTASK_UPDATED',
        actorId: userId,
        teamId: returnedTask.teamId,
        payload: {
          taskId: returnedTask.id,
          subtaskId: subId,
        },
      });
    }

    if (handoverResult.revokedCollaboratorUserId) {
      void this.realtimeService.emit({
        type: 'TASK_COLLABORATORS_CHANGED',
        actorId: userId,
        teamId: returnedTask.teamId,
        payload: {
          taskId: returnedTask.id,
          action: 'REMOVE',
          userId: handoverResult.revokedCollaboratorUserId,
          status: 'REVOKED',
        },
      });
    }

    return returnedTask;
  }

  /**
   * Core domain logic for handing over and re-validating collaborators and subtasks
   * whenever the Main Assignee of a task changes.
   *
   * 1. Main Assignee cannot simultaneously be a Collaborator:
   *    Revokes any PENDING or ACCEPTED collaborator record for targetAssigneeId.
   * 2. Hand over active subtasks:
   *    Transfers active subtasks belonging to previousAssigneeId to targetAssigneeId,
   *    or unassigns them if the task is now unassigned.
   * 3. Invariant check:
   *    Guarantees no active subtask remains assigned to an ineligible user.
   */
  async handleMainAssigneeChange(
    tx: Prisma.TransactionClient,
    taskId: number,
    previousAssigneeId: number | null | undefined,
    targetAssigneeId: number | null | undefined,
    allowedTeamMemberIds?: number[],
    context?: MainAssigneeHandoverContext,
  ): Promise<MainAssigneeHandoverResult> {
    const affectedSubtaskIds = new Set<number>();
    let revokedCollaboratorUserId: number | null = null;

    // 1. New Main Assignee cannot be a Collaborator
    if (targetAssigneeId) {
      const existingCollab = await tx.taskCollaborator.findFirst({
        where: {
          taskId,
          userId: targetAssigneeId,
          status: { in: ['PENDING', 'ACCEPTED'] },
        },
        select: { userId: true },
      });
      if (existingCollab) {
        revokedCollaboratorUserId = existingCollab.userId;
        await tx.taskCollaborator.updateMany({
          where: {
            taskId,
            userId: targetAssigneeId,
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
          data: {
            status: 'REVOKED',
          },
        });
      }
    }

    // 2. Hand over active (unfinished) subtasks of the former main assignee.
    // Completed subtasks (DONE) remain assigned to the previous assignee to preserve historical record.
    if (previousAssigneeId && previousAssigneeId !== targetAssigneeId) {
      const handedOverSubtasks = await tx.subtask.findMany({
        where: {
          taskId,
          assigneeId: previousAssigneeId,
          status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
          deletedAt: null,
        },
        select: { id: true, title: true },
      });

      if (handedOverSubtasks.length > 0) {
        await tx.subtask.updateMany({
          where: { id: { in: handedOverSubtasks.map((s) => s.id) } },
          data: { assigneeId: targetAssigneeId ?? null },
        });

        for (const sub of handedOverSubtasks) {
          affectedSubtaskIds.add(sub.id);

          if (context) {
            await this.notificationEventService.publish(
              {
                type: 'SUBTASK_UNASSIGNED',
                actorId: context.actorId,
                taskId,
                taskTitle: context.taskTitle,
                teamId: context.teamId,
                subtaskId: sub.id,
                subtaskTitle: sub.title,
                previousAssigneeId,
                reassignedToUserId: targetAssigneeId ?? null,
                unassignedAt: context.mutationTime,
                timestamp: context.mutationTime.getTime(),
              },
              tx,
            );

            if (targetAssigneeId) {
              await this.notificationEventService.publish(
                {
                  type: 'SUBTASK_ASSIGNED',
                  actorId: context.actorId,
                  taskId,
                  taskTitle: context.taskTitle,
                  teamId: context.teamId,
                  subtaskId: sub.id,
                  subtaskTitle: sub.title,
                  subtaskAssigneeId: targetAssigneeId,
                  isReassigned: true,
                  previousAssigneeId,
                  assignedAt: context.mutationTime,
                  timestamp: context.mutationTime.getTime(),
                },
                tx,
              );
            }
          }
        }
      }
    }

    // 3. Guarantee that any active (unfinished) subtask is assigned ONLY to either targetAssigneeId
    // OR an ACCEPTED collaborator (who belongs to the team if team member list provided).
    // Note: Completed subtasks (DONE) preserve their historical assigneeId intact!
    const acceptedCollabs = await tx.taskCollaborator.findMany({
      where: {
        taskId,
        status: 'ACCEPTED',
        ...(allowedTeamMemberIds ? { userId: { in: allowedTeamMemberIds } } : {}),
      },
      select: { userId: true },
    });

    const eligibleAssigneeIds = [
      ...(targetAssigneeId ? [targetAssigneeId] : []),
      ...acceptedCollabs.map((c) => c.userId),
    ];

    const ineligibleSubtasks = await tx.subtask.findMany({
      where: {
        taskId,
        deletedAt: null,
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
        assigneeId: {
          not: null,
          notIn: eligibleAssigneeIds.length > 0 ? eligibleAssigneeIds : [-1],
        },
      },
      select: { id: true, title: true, assigneeId: true },
    });

    if (ineligibleSubtasks.length > 0) {
      await tx.subtask.updateMany({
        where: { id: { in: ineligibleSubtasks.map((s) => s.id) } },
        data: { assigneeId: null },
      });

      for (const sub of ineligibleSubtasks) {
        affectedSubtaskIds.add(sub.id);
        if (context && sub.assigneeId !== null) {
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_UNASSIGNED',
              actorId: context.actorId,
              taskId,
              taskTitle: context.taskTitle,
              teamId: context.teamId,
              subtaskId: sub.id,
              subtaskTitle: sub.title,
              previousAssigneeId: sub.assigneeId,
              reassignedToUserId: null,
              unassignedAt: context.mutationTime,
              timestamp: context.mutationTime.getTime(),
            },
            tx,
          );
        }
      }
    }

    return {
      affectedSubtaskIds: Array.from(affectedSubtaskIds),
      revokedCollaboratorUserId,
    };
  }
}
