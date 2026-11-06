import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from '../dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from '../dto/return-task.dto.js';
import { MoveTaskTeamDto } from '../dto/move-task-team.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../policies/task-workflow-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { type Task, Prisma, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
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
    return this.executeInTransaction(externalTx, async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx);
      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });
      const currentTask = await this.queryService.findOne(id, userId, tx);

      const scopeWhere: Prisma.TaskWhereInput = currentTask.teamId
        ? { teamId: currentTask.teamId }
        : { userId: currentTask.userId, teamId: null };

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

      let updatedCurrentTask: Task = currentTask;
      for (let idx = 0; idx < newDestTasks.length; idx++) {
        const item = newDestTasks[idx];
        if (item.id === id) {
          updatedCurrentTask = await tx.task.update({
            where: { id },
            data: {
              status: data.status,
              position: idx,
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

      return updatedCurrentTask;
    });
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

      return tx.task.update({
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

      const returningUser = await tx.user.findUnique({ where: { id: userId } });
      const returnerName = returningUser?.name || 'Assignee';

      const notifyUserId = isCreatorMember
        ? currentTask.userId
        : (currentTask.team?.ownerId ?? currentTask.userId);

      await tx.notification.create({
        data: {
          userId: notifyUserId,
          type: 'TASK_STATUS_CHANGED',
          title: `Công việc #${currentTask.id} được trả lại`,
          content: `${returnerName} đã trả lại công việc "${currentTask.title}". Lý do: ${cleanReason}`,
          taskId: currentTask.id,
          teamId: currentTask.teamId,
        },
      });

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

  async moveTeam(
    id: number,
    dto: MoveTaskTeamDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    const hasTeamId = dto.teamId !== undefined;
    const hasAssigneeId = dto.assigneeId !== undefined;

    if (!hasTeamId && !hasAssigneeId) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    try {
      return await this.executeInTransaction(externalTx, async (tx) => {
        const initialTask = await this.queryService.findOne(id, userId, tx);
        const targetTeamId = hasTeamId ? (dto.teamId ?? null) : initialTask.teamId;

        await this.reorderService.lockScopes(tx, [
          { teamId: initialTask.teamId, userId: initialTask.userId },
          { teamId: targetTeamId, userId: initialTask.userId },
        ]);

        const currentTask = await this.queryService.findOne(id, userId, tx);

        if (hasTeamId && !this.policy.canEditContent(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung công việc này');
        }

        if (hasAssigneeId && !this.policy.canChangeAssignee(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền phân công công việc này');
        }

        const effectiveTeamId = hasTeamId ? (dto.teamId ?? null) : currentTask.teamId;
        const isTeamChanged = effectiveTeamId !== currentTask.teamId;
        let effectiveAssigneeId = hasAssigneeId ? (dto.assigneeId ?? null) : currentTask.assigneeId;

        if (effectiveTeamId !== null) {
          const targetTeam = await tx.team.findUnique({
            where: { id: effectiveTeamId },
            include: { members: true },
          });
          if (!this.policy.isTeamMember(userId, targetTeam)) {
            throw new NotFoundException('Không tìm thấy nhóm');
          }

          if (hasAssigneeId) {
            if (effectiveAssigneeId && !this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
              throw new BadRequestException('Người được phân công không thuộc nhóm này');
            }
          } else if (isTeamChanged && effectiveAssigneeId) {
            if (!this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
              effectiveAssigneeId = null;
            }
          }
        } else {
          if (hasAssigneeId) {
            if (effectiveAssigneeId && effectiveAssigneeId !== currentTask.userId) {
              throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
            }
          } else if (isTeamChanged && effectiveAssigneeId !== currentTask.userId) {
            effectiveAssigneeId = null;
          }
        }

        const updateData: Prisma.TaskUpdateInput = {};

        if (isTeamChanged) {
          const duplicateScopeWhere: Prisma.TaskWhereInput = effectiveTeamId
            ? { teamId: effectiveTeamId }
            : { userId: currentTask.userId, teamId: null };

          const duplicateTask = await tx.task.findFirst({
            where: {
              ...duplicateScopeWhere,
              title: {
                equals: currentTask.title,
                mode: 'insensitive',
              },
              NOT: { id },
            },
          });

          if (duplicateTask) {
            throw new ConflictException(`Tiêu đề '${currentTask.title}' đã được sử dụng bởi một công việc khác`);
          }
        }

        if (hasTeamId) {
          updateData.team = effectiveTeamId
            ? { connect: { id: effectiveTeamId } }
            : { disconnect: true };
        }

        if (hasAssigneeId || (isTeamChanged && effectiveAssigneeId !== currentTask.assigneeId)) {
          updateData.assignee = effectiveAssigneeId
            ? { connect: { id: effectiveAssigneeId } }
            : { disconnect: true };
        }

        if (isTeamChanged) {
          const destScope: Prisma.TaskWhereInput = effectiveTeamId
            ? { teamId: effectiveTeamId }
            : { userId: currentTask.userId, teamId: null };

          const newPosition = await this.reorderService.getNextPosition(
            tx,
            destScope,
            currentTask.status,
          );
          updateData.position = newPosition;

          const sourceScope: Prisma.TaskWhereInput = currentTask.teamId
            ? { teamId: currentTask.teamId }
            : { userId: currentTask.userId, teamId: null };

          const updatedTask = await tx.task.update({
            where: { id },
            data: updateData,
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

          await this.reorderService.reindexColumn(tx, sourceScope, currentTask.status, [id]);
          return updatedTask;
        }

        return tx.task.update({
          where: { id },
          data: updateData,
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tiêu đề công việc đã được sử dụng bởi một công việc khác trong phạm vi này');
      }
      throw error;
    }
  }
}
