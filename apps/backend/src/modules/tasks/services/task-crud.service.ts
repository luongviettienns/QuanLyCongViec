import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateTaskDto } from '../dto/create-task.dto.js';
import { UpdateTaskContentDto } from '../dto/update-task-content.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { type Task, Prisma, TaskStatus, TaskPriority } from '@prisma/client';

@Injectable()
export class TaskCrudService {
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

  private parseDateOnly(dateStr: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) {
      throw new BadRequestException('Định dạng ngày phải là YYYY-MM-DD');
    }
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('Ngày không hợp lệ trong lịch');
    }
    return date;
  }

  async create(data: CreateTaskDto, userId: number): Promise<Task> {
    const cleanTitle = data.title.trim();

    if (cleanTitle.length < 3) {
      throw new BadRequestException('Tiêu đề công việc phải có ít nhất 3 ký tự (không tính khoảng trắng thừa)');
    }

    let cleanDescription: string | null = null;
    if (data.description) {
      const trimmed = data.description.trim();
      if (trimmed.length > 0) {
        cleanDescription = trimmed;
      }
    }

    let parsedStartDate: Date | null = null;
    if (data.startDate) {
      parsedStartDate = this.parseDateOnly(data.startDate);
    }

    let parsedDueDate: Date | null = null;
    if (data.dueDate) {
      parsedDueDate = this.parseDateOnly(data.dueDate);
    }

    if (parsedStartDate && parsedDueDate && parsedStartDate > parsedDueDate) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn hạn chót (deadline)');
    }

    const initialStatus: TaskStatus = data.status ? data.status : TaskStatus.TODO;
    const initialPriority: TaskPriority = data.priority ? data.priority : TaskPriority.MEDIUM;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.reorderService.lockScope(tx, {
          teamId: data.teamId ?? null,
          userId,
        });

        const titleScopeWhere: Prisma.TaskWhereInput = data.teamId
          ? { teamId: data.teamId }
          : { userId, teamId: null };

        const existingTask = await tx.task.findFirst({
          where: {
            ...titleScopeWhere,
            title: {
              equals: cleanTitle,
              mode: 'insensitive',
            },
          },
        });

        if (existingTask) {
          throw new ConflictException(`Tiêu đề '${cleanTitle}' đã tồn tại, vui lòng đặt tên khác`);
        }

        if (data.categoryId) {
          if (data.teamId) {
            const category = await tx.category.findFirst({
              where: {
                id: data.categoryId,
                teamId: data.teamId,
              },
            });
            if (!category) {
              throw new BadRequestException(`Danh mục #${data.categoryId} không thuộc nhóm này`);
            }
          } else {
            const category = await tx.category.findFirst({
              where: {
                id: data.categoryId,
                userId,
                teamId: null,
              },
            });
            if (!category) {
              throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
            }
          }
        }

        if (data.teamId) {
          const targetTeam = await tx.team.findUnique({
            where: { id: data.teamId },
            include: { members: true },
          });
          if (!this.policy.isTeamMember(userId, targetTeam)) {
            throw new NotFoundException('Không tìm thấy nhóm');
          }

          if (data.assigneeId) {
            if (!this.policy.isTeamMember(data.assigneeId, targetTeam)) {
              throw new BadRequestException('Người được phân công không thuộc nhóm này');
            }
          }
        } else {
          if (data.assigneeId && data.assigneeId !== userId) {
            throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
          }
        }

        const currentCount = await this.reorderService.getNextPosition(
          tx,
          titleScopeWhere,
          initialStatus,
        );

        const createdTask = await tx.task.create({
          data: {
            userId,
            title: cleanTitle,
            description: cleanDescription,
            status: initialStatus,
            priority: initialPriority,
            categoryId: data.categoryId ? data.categoryId : null,
            teamId: data.teamId ? data.teamId : null,
            assigneeId: data.assigneeId ? data.assigneeId : null,
            position: currentCount,
            startDate: parsedStartDate,
            dueDate: parsedDueDate,
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

        if (createdTask.assigneeId && createdTask.assigneeId !== userId) {
          await this.notificationEventService.publish(
            {
              type: 'TASK_ASSIGNED',
              actorId: userId,
              taskId: createdTask.id,
              taskTitle: createdTask.title,
              assigneeId: createdTask.assigneeId,
              teamId: createdTask.teamId,
            },
            tx,
          );
        }

        void this.realtimeService.emit({
          type: 'TASK_CREATED',
          actorId: userId,
          teamId: createdTask.teamId,
          targetUserIds: createdTask.teamId
            ? undefined
            : [createdTask.userId, ...(createdTask.assigneeId ? [createdTask.assigneeId] : [])],
          payload: {
            taskId: createdTask.id,
            teamId: createdTask.teamId,
            status: createdTask.status,
          },
        });

        return createdTask;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Tiêu đề '${cleanTitle}' đã tồn tại, vui lòng đặt tên khác`);
      }
      throw error;
    }
  }

  async updateContent(
    id: number,
    data: UpdateTaskContentDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasPriority = data.priority !== undefined;
    const hasStartDate = data.startDate !== undefined;
    const hasDueDate = data.dueDate !== undefined;
    const hasCategory = data.categoryId !== undefined;

    if (!hasTitle && !hasDescription && !hasPriority && !hasStartDate && !hasDueDate && !hasCategory) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    try {
      return await this.executeInTransaction(externalTx, async (tx) => {
        const initialTask = await this.queryService.findOne(id, userId, tx);
        if (hasTitle) {
          await this.reorderService.lockScope(tx, {
            teamId: initialTask.teamId,
            userId: initialTask.userId,
          });
        }
        const currentTask = await this.queryService.findOne(id, userId, tx);

        if (!this.policy.canEditContent(userId, currentTask)) {
          throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung công việc này');
        }

        const updateData: Prisma.TaskUpdateInput = {};

        let parsedStartDate: Date | null = null;
        if (hasStartDate) {
          if (data.startDate === null || data.startDate === '') {
            updateData.startDate = null;
          } else if (data.startDate) {
            parsedStartDate = this.parseDateOnly(data.startDate);
            updateData.startDate = parsedStartDate;
          }
        }

        let parsedDueDate: Date | null = null;
        if (hasDueDate) {
          if (data.dueDate === null || data.dueDate === '') {
            updateData.dueDate = null;
          } else if (data.dueDate) {
            parsedDueDate = this.parseDateOnly(data.dueDate);
            updateData.dueDate = parsedDueDate;
          }
        }

        const effectiveStartDate = hasStartDate ? parsedStartDate : currentTask.startDate;
        const effectiveDueDate = hasDueDate ? parsedDueDate : currentTask.dueDate;

        if (effectiveStartDate && effectiveDueDate && effectiveStartDate > effectiveDueDate) {
          throw new BadRequestException('Ngày bắt đầu không được lớn hơn hạn chót (deadline)');
        }

        if (hasTitle && data.title !== undefined) {
          const cleanTitle = data.title.trim();
          if (cleanTitle.length < 3) {
            throw new BadRequestException('Tiêu đề công việc mới phải có ít nhất 3 ký tự');
          }

          const duplicateScopeWhere: Prisma.TaskWhereInput = currentTask.teamId
            ? { teamId: currentTask.teamId }
            : { userId: currentTask.userId, teamId: null };

          const duplicateTask = await tx.task.findFirst({
            where: {
              ...duplicateScopeWhere,
              title: {
                equals: cleanTitle,
                mode: 'insensitive',
              },
              NOT: {
                id,
              },
            },
          });

          if (duplicateTask) {
            throw new ConflictException(`Tiêu đề '${cleanTitle}' đã được sử dụng bởi một công việc khác`);
          }

          updateData.title = cleanTitle;
        }

        if (hasDescription && data.description !== undefined) {
          const trimmedDesc = data.description?.trim();
          updateData.description = trimmedDesc && trimmedDesc.length > 0 ? trimmedDesc : null;
        }

        if (hasPriority && data.priority !== undefined) {
          updateData.priority = data.priority;
        }

        if (hasCategory) {
          if (data.categoryId) {
            const effectiveTeamId = currentTask.teamId;
            if (effectiveTeamId) {
              const category = await tx.category.findFirst({
                where: {
                  id: data.categoryId,
                  teamId: effectiveTeamId,
                },
              });
              if (!category) {
                if (currentTask.categoryId !== data.categoryId) {
                  throw new BadRequestException(`Danh mục #${data.categoryId} không thuộc nhóm này`);
                }
              }
            } else {
              const category = await tx.category.findFirst({
                where: {
                  id: data.categoryId,
                  userId: { in: [userId, currentTask.userId] },
                  teamId: null,
                },
              });
              if (!category) {
                if (currentTask.categoryId !== data.categoryId) {
                  throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
                }
              }
            }
            updateData.category = { connect: { id: data.categoryId } };
          } else {
            updateData.category = { disconnect: true };
          }
        }

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

        const oldDueDateStr = currentTask.dueDate ? currentTask.dueDate.toISOString().slice(0, 10) : null;
        const newDueDateStr = parsedDueDate ? parsedDueDate.toISOString().slice(0, 10) : null;
        if (hasDueDate && oldDueDateStr !== newDueDateStr) {
          await this.notificationEventService.publish(
            {
              type: 'TASK_DEADLINE_CHANGED',
              actorId: userId,
              taskId: updatedTask.id,
              taskTitle: updatedTask.title,
              newDueDate: newDueDateStr,
              teamId: updatedTask.teamId,
              assigneeId: updatedTask.assigneeId,
              creatorId: updatedTask.userId,
            },
            tx,
          );
        }

        void this.realtimeService.emit({
          type: 'TASK_UPDATED',
          actorId: userId,
          teamId: updatedTask.teamId,
          targetUserIds: updatedTask.teamId
            ? undefined
            : [updatedTask.userId, ...(updatedTask.assigneeId ? [updatedTask.assigneeId] : [])],
          payload: {
            taskId: updatedTask.id,
            teamId: updatedTask.teamId,
            status: updatedTask.status,
          },
        });

        return updatedTask;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Tiêu đề công việc đã được sử dụng bởi một công việc khác');
      }
      throw error;
    }
  }

  async remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    return this.prisma.$transaction(async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx);
      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });
      const taskToDelete = await this.queryService.findOne(id, userId, tx);

      if (!this.policy.canDeleteTask(userId, taskToDelete)) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc này');
      }

      await this.notificationEventService.publish(
        {
          type: 'TASK_DELETED',
          actorId: userId,
          taskId: taskToDelete.id,
          taskTitle: taskToDelete.title,
          teamId: taskToDelete.teamId,
          assigneeId: taskToDelete.assigneeId,
          creatorId: taskToDelete.userId,
        },
        tx,
      );

      const remainingTasksScope: Prisma.TaskWhereInput = taskToDelete.teamId
        ? { teamId: taskToDelete.teamId }
        : { userId: taskToDelete.userId, teamId: null };

      const deletedTask = await tx.task.delete({
        where: { id },
      });

      await this.reorderService.reindexColumn(tx, remainingTasksScope, taskToDelete.status, [id]);

      void this.realtimeService.emit({
        type: 'TASK_DELETED',
        actorId: userId,
        teamId: taskToDelete.teamId,
        targetUserIds: taskToDelete.teamId
          ? undefined
          : [taskToDelete.userId, ...(taskToDelete.assigneeId ? [taskToDelete.assigneeId] : [])],
        payload: {
          taskId: id,
          teamId: taskToDelete.teamId,
        },
      });

      return {
        success: true,
        message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
        deletedTask,
      };
    });
  }
}
