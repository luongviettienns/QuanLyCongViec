import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { CreateSubtaskDto } from '../dto/create-subtask.dto.js';
import { UpdateSubtaskDto } from '../dto/update-subtask.dto.js';
import { UpdateSubtaskStatusDto } from '../dto/update-subtask-status.dto.js';
import { ReorderSubtasksDto } from '../dto/reorder-subtasks.dto.js';
import { TaskStatus, CollaboratorStatus } from '@prisma/client';

@Injectable()
export class SubtaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async getSubtasks(taskId: number, callerId: number) {
    await this.queryService.findOne(taskId, callerId);

    return this.prisma.subtask.findMany({
      where: {
        taskId,
        deletedAt: null,
      },
      include: {
        assignee: {
          select: { id: true, name: true, email: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        completedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(taskId: number, dto: CreateSubtaskDto, callerId: number) {
    let parentTask: any = null;
    const createdSubtask = await this.prisma.$transaction(async (tx) => {
      // Row lock the parent task for concurrent protection
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      if (!this.policy.canCreateSubtask(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền tạo công việc con cho công việc này');
      }

      if (task.status === TaskStatus.DONE) {
        throw new BadRequestException(
          'Không thể thêm công việc con vào công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
        );
      }

      if (dto.assigneeId) {
        await this.assertValidSubtaskAssignee(tx, taskId, task.assigneeId, dto.assigneeId, task.team);
      }

      const maxPosResult = await tx.subtask.aggregate({
        where: { taskId, deletedAt: null },
        _max: { position: true },
      });
      const nextPosition = (maxPosResult._max.position ?? -1) + 1;

      const created = await tx.subtask.create({
        data: {
          taskId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          assigneeId: dto.assigneeId ?? null,
          status: TaskStatus.TODO,
          position: nextPosition,
          createdById: callerId,
        },
        include: {
          assignee: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          completedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (created.assigneeId) {
        await this.notificationEventService.publish(
          {
            type: 'SUBTASK_ASSIGNED',
            actorId: callerId,
            taskId,
            taskTitle: task.title,
            teamId: task.teamId,
            subtaskId: created.id,
            subtaskTitle: created.title,
            subtaskAssigneeId: created.assigneeId,
            assignedAt: created.createdAt,
            timestamp: created.createdAt.getTime(),
          },
          tx,
        );
      }

      return created;
    });

    void this.realtimeService.emit({
      type: 'SUBTASK_CREATED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      targetUserIds: parentTask?.teamId
        ? undefined
        : [parentTask.userId, ...(parentTask.assigneeId ? [parentTask.assigneeId] : [])],
      payload: {
        taskId,
        subtaskId: createdSubtask.id,
        subtask: createdSubtask,
      },
    });

    return createdSubtask;
  }

  async update(
    taskId: number,
    subtaskId: number,
    dto: UpdateSubtaskDto,
    callerId: number,
  ) {
    const hasAnyField =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.assigneeId !== undefined ||
      dto.status !== undefined;
    if (!hasAnyField) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    let parentTask: any = null;
    const updatedSubtask = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      const subtask = await tx.subtask.findFirst({
        where: { id: subtaskId, taskId, deletedAt: null },
      });

      if (!subtask) {
        throw new NotFoundException('Không tìm thấy công việc con');
      }

      const canManage = this.policy.canManageSubtask(callerId, task);

      // Check if user is modifying content (title, description, assignee)
      const isModifyingContent =
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.assigneeId !== undefined;

      // Invariant: If parent task is DONE, reject any content modification
      if (isModifyingContent && task.status === TaskStatus.DONE) {
        throw new BadRequestException(
          'Không thể chỉnh sửa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
        );
      }

      if (isModifyingContent && !canManage) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung hoặc người thực hiện của công việc con');
      }

      // Check status permission
      if (dto.status !== undefined) {
        if (!canManage) {
          // If not manager, must be the assigned collaborator with ACCEPTED status
          const isAssigned = subtask.assigneeId === callerId;
          const acceptedCollab = await tx.taskCollaborator.findFirst({
            where: {
              taskId,
              userId: callerId,
              status: CollaboratorStatus.ACCEPTED,
            },
          });

          if (!isAssigned || !acceptedCollab) {
            throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc con này');
          }

          // Enforce Collaborator status workflow: TODO -> IN_PROGRESS -> DONE only
          if (subtask.status === TaskStatus.DONE) {
            throw new BadRequestException(
              'Không thể thay đổi trạng thái công việc con đã hoàn thành. Hãy nhờ người quản lý mở lại nếu cần.',
            );
          }

          if (subtask.status === TaskStatus.TODO && dto.status !== TaskStatus.IN_PROGRESS) {
            throw new BadRequestException(
              'Người phối hợp chỉ có thể chuyển công việc con từ Cần làm sang Đang làm (TODO -> IN_PROGRESS)',
            );
          }

          if (subtask.status === TaskStatus.IN_PROGRESS && dto.status !== TaskStatus.DONE) {
            throw new BadRequestException(
              'Người phối hợp chỉ có thể chuyển công việc con từ Đang làm sang Hoàn thành (IN_PROGRESS -> DONE)',
            );
          }
        }

        // Universal invariant: No one (Manager or Collaborator) can skip directly from TODO to DONE
        if (subtask.status === TaskStatus.TODO && dto.status === TaskStatus.DONE) {
          throw new BadRequestException(
            'Không thể chuyển công việc con trực tiếp từ Cần làm sang Hoàn thành (TODO -> DONE). Phải chuyển sang Đang làm (TODO -> IN_PROGRESS) trước.',
          );
        }

        // Invariant: Cannot change subtask to non-DONE if parent is DONE
        if (dto.status !== TaskStatus.DONE && task.status === TaskStatus.DONE) {
          throw new BadRequestException(
            'Không thể đổi công việc con thành chưa hoàn thành khi công việc chính đang ở trạng thái hoàn thành. Hãy mở lại công việc chính trước.',
          );
        }
      }

      if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
        await this.assertValidSubtaskAssignee(tx, taskId, task.assigneeId, dto.assigneeId, task.team);
      }

      const dataToUpdate: Record<string, unknown> = {};
      if (dto.title !== undefined) {
        const cleanTitle = typeof dto.title === 'string' ? dto.title.trim() : '';
        if (cleanTitle.length < 2) {
          throw new BadRequestException('Tiêu đề công việc con phải có ít nhất 2 ký tự');
        }
        dataToUpdate.title = cleanTitle;
      }
      if (dto.description !== undefined) {
        dataToUpdate.description =
          typeof dto.description === 'string' ? dto.description.trim() || null : null;
      }
      if (dto.status !== undefined) {
        dataToUpdate.status = dto.status;
        if (dto.status === TaskStatus.DONE && subtask.status !== TaskStatus.DONE) {
          dataToUpdate.completedById = callerId;
          dataToUpdate.completedAt = new Date();
        } else if (dto.status !== TaskStatus.DONE && subtask.status === TaskStatus.DONE) {
          dataToUpdate.completedById = null;
          dataToUpdate.completedAt = null;
        }
      }
      if (dto.assigneeId !== undefined) dataToUpdate.assigneeId = dto.assigneeId;

      const updated = await tx.subtask.update({
        where: { id: subtaskId },
        data: dataToUpdate,
        include: {
          assignee: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          completedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      if (
        dto.assigneeId !== undefined &&
        dto.assigneeId !== subtask.assigneeId
      ) {
        const isReassignment = subtask.assigneeId !== null && dto.assigneeId !== null;

        if (subtask.assigneeId !== null) {
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_UNASSIGNED',
              actorId: callerId,
              taskId,
              taskTitle: task.title,
              teamId: task.teamId,
              subtaskId: updated.id,
              subtaskTitle: updated.title,
              previousAssigneeId: subtask.assigneeId,
              reassignedToUserId: dto.assigneeId ?? null,
              unassignedAt: updated.updatedAt,
              timestamp: updated.updatedAt.getTime(),
            },
            tx,
          );
        }

        if (dto.assigneeId !== null) {
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_ASSIGNED',
              actorId: callerId,
              taskId,
              taskTitle: task.title,
              teamId: task.teamId,
              subtaskId: updated.id,
              subtaskTitle: updated.title,
              subtaskAssigneeId: dto.assigneeId,
              isReassigned: isReassignment,
              previousAssigneeId: subtask.assigneeId,
              assignedAt: updated.updatedAt,
              timestamp: updated.updatedAt.getTime(),
            },
            tx,
          );
        }
      }

      if (dto.status !== undefined && dto.status !== subtask.status) {
        if (subtask.status === TaskStatus.DONE && updated.status !== TaskStatus.DONE) {
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_REOPENED',
              actorId: callerId,
              taskId,
              taskTitle: task.title,
              teamId: task.teamId,
              subtaskId: updated.id,
              subtaskTitle: updated.title,
              newStatus: updated.status,
              creatorId: task.userId,
              assigneeId: task.assigneeId,
              subtaskAssigneeId: updated.assigneeId,
              reopenedAt: updated.updatedAt,
              timestamp: updated.updatedAt.getTime(),
            },
            tx,
          );
        } else if (updated.status === TaskStatus.DONE) {
          const completedStamp = updated.completedAt ?? updated.updatedAt;
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_COMPLETED',
              actorId: callerId,
              taskId,
              taskTitle: task.title,
              teamId: task.teamId,
              subtaskId: updated.id,
              subtaskTitle: updated.title,
              creatorId: task.userId,
              assigneeId: task.assigneeId,
              subtaskAssigneeId: updated.assigneeId,
              completedById: callerId,
              completedAt: completedStamp,
              timestamp: completedStamp.getTime(),
            },
            tx,
          );
        } else {
          await this.notificationEventService.publish(
            {
              type: 'SUBTASK_STATUS_CHANGED',
              actorId: callerId,
              taskId,
              taskTitle: task.title,
              teamId: task.teamId,
              subtaskId: updated.id,
              subtaskTitle: updated.title,
              oldStatus: subtask.status,
              newStatus: updated.status,
              creatorId: task.userId,
              assigneeId: task.assigneeId,
              subtaskAssigneeId: updated.assigneeId,
              changedAt: updated.updatedAt,
              timestamp: updated.updatedAt.getTime(),
            },
            tx,
          );
        }
      }

      return updated;
    });

    void this.realtimeService.emit({
      type: 'SUBTASK_UPDATED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      targetUserIds: parentTask?.teamId
        ? undefined
        : [parentTask.userId, ...(parentTask.assigneeId ? [parentTask.assigneeId] : [])],
      payload: {
        taskId,
        subtaskId: updatedSubtask.id,
        subtask: updatedSubtask,
      },
    });

    return updatedSubtask;
  }

  async updateStatus(
    taskId: number,
    subtaskId: number,
    dto: UpdateSubtaskStatusDto,
    callerId: number,
  ) {
    return this.update(taskId, subtaskId, { status: dto.status }, callerId);
  }

  async remove(taskId: number, subtaskId: number, callerId: number) {
    let parentTask: any = null;
    const deletedSubtask = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      if (task.status === TaskStatus.DONE) {
        throw new BadRequestException(
          'Không thể xóa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
        );
      }

      if (!this.policy.canManageSubtask(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc con này');
      }

      const subtask = await tx.subtask.findFirst({
        where: { id: subtaskId, taskId, deletedAt: null },
      });

      if (!subtask) {
        throw new NotFoundException('Không tìm thấy công việc con');
      }

      const deleted = await tx.subtask.update({
        where: { id: subtaskId },
        data: {
          deletedAt: new Date(),
          deletedWithTask: false,
        },
      });

      // Reindex remaining active subtasks
      const remaining = await tx.subtask.findMany({
        where: { taskId, deletedAt: null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });

      for (let idx = 0; idx < remaining.length; idx++) {
        if (remaining[idx].position !== idx) {
          await tx.subtask.update({
            where: { id: remaining[idx].id },
            data: { position: idx },
          });
        }
      }

      return deleted;
    });

    void this.realtimeService.emit({
      type: 'SUBTASK_DELETED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      targetUserIds: parentTask?.teamId
        ? undefined
        : [parentTask.userId, ...(parentTask.assigneeId ? [parentTask.assigneeId] : [])],
      payload: {
        taskId,
        subtaskId,
      },
    });

    return deletedSubtask;
  }

  async reorder(taskId: number, dto: ReorderSubtasksDto, callerId: number) {
    let parentTask: any = null;
    const reorderedList = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);
      parentTask = task;

      if (task.status === TaskStatus.DONE) {
        throw new BadRequestException(
          'Không thể sắp xếp lại công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
        );
      }

      if (!this.policy.canManageSubtask(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền sắp xếp công việc con');
      }

      const activeSubtasks = await tx.subtask.findMany({
        where: { taskId, deletedAt: null },
        select: { id: true },
      });

      if (dto.subtaskIds.length !== activeSubtasks.length) {
        throw new BadRequestException(
          `Danh sách subtaskIds phải chứa đầy đủ tất cả ${activeSubtasks.length} công việc con đang hoạt động`,
        );
      }

      const uniqueDtoIds = new Set(dto.subtaskIds);
      if (uniqueDtoIds.size !== dto.subtaskIds.length) {
        throw new BadRequestException('Danh sách subtaskIds không được chứa giá trị trùng lặp');
      }

      const activeIdSet = new Set(activeSubtasks.map((s) => s.id));
      for (const id of dto.subtaskIds) {
        if (!activeIdSet.has(id)) {
          throw new BadRequestException(`Mã công việc con #${id} không hợp lệ hoặc đã bị xoá`);
        }
      }

      for (let idx = 0; idx < dto.subtaskIds.length; idx++) {
        await tx.subtask.update({
          where: { id: dto.subtaskIds[idx] },
          data: { position: idx },
        });
      }

      return tx.subtask.findMany({
        where: { taskId, deletedAt: null },
        include: {
          assignee: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          completedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    });

    void this.realtimeService.emit({
      type: 'SUBTASK_REORDERED',
      actorId: callerId,
      teamId: parentTask?.teamId,
      targetUserIds: parentTask?.teamId
        ? undefined
        : [parentTask.userId, ...(parentTask.assigneeId ? [parentTask.assigneeId] : [])],
      payload: {
        taskId,
        subtaskIds: dto.subtaskIds,
      },
    });

    return reorderedList;
  }

  private async assertValidSubtaskAssignee(
    tx: any,
    taskId: number,
    mainAssigneeId: number | null | undefined,
    targetUserId: number,
    team?: { ownerId: number; members?: any[] } | null,
  ) {
    const isMainAssignee = mainAssigneeId === targetUserId;

    if (isMainAssignee) {
      return;
    }

    // Must be an ACCEPTED collaborator
    const collab = await tx.taskCollaborator.findFirst({
      where: {
        taskId,
        userId: targetUserId,
        status: CollaboratorStatus.ACCEPTED,
      },
    });

    if (!collab) {
      throw new BadRequestException(
        'Người được giao công việc con phải là người phụ trách chính hoặc người phối hợp đã chấp nhận lời mời',
      );
    }

    if (team) {
      const isMember = this.policy.isTeamMember(targetUserId, team);
      if (!isMember) {
        throw new BadRequestException('Người được giao không còn là thành viên của nhóm');
      }
    }
  }
}
