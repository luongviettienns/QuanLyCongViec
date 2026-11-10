import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
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
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(taskId: number, dto: CreateSubtaskDto, callerId: number) {
    return this.prisma.$transaction(async (tx) => {
      // Row lock the parent task for concurrent protection
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

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

      return tx.subtask.create({
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
        },
      });
    });
  }

  async update(
    taskId: number,
    subtaskId: number,
    dto: UpdateSubtaskDto,
    callerId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

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

      const dataToUpdate: any = {};
      if (dto.title !== undefined) dataToUpdate.title = dto.title.trim();
      if (dto.description !== undefined) dataToUpdate.description = dto.description?.trim() || null;
      if (dto.status !== undefined) dataToUpdate.status = dto.status;
      if (dto.assigneeId !== undefined) dataToUpdate.assigneeId = dto.assigneeId;

      return tx.subtask.update({
        where: { id: subtaskId },
        data: dataToUpdate,
        include: {
          assignee: {
            select: { id: true, name: true, email: true },
          },
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    });
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
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

      if (!this.policy.canManageSubtask(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc con này');
      }

      const subtask = await tx.subtask.findFirst({
        where: { id: subtaskId, taskId, deletedAt: null },
      });

      if (!subtask) {
        throw new NotFoundException('Không tìm thấy công việc con');
      }

      const deletedSubtask = await tx.subtask.update({
        where: { id: subtaskId },
        data: { deletedAt: new Date() },
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

      return deletedSubtask;
    });
  }

  async reorder(taskId: number, dto: ReorderSubtasksDto, callerId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id, status FROM "Task" WHERE id = ${taskId} FOR UPDATE;`;

      const task = await this.queryService.findOne(taskId, callerId, tx);

      if (!this.policy.canManageSubtask(callerId, task)) {
        throw new ForbiddenException('Bạn không có quyền sắp xếp công việc con');
      }

      const activeSubtasks = await tx.subtask.findMany({
        where: { taskId, deletedAt: null },
        select: { id: true },
      });

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
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
    });
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
