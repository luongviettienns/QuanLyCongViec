import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { CreateTaskDto } from '../dto/create-task.dto.js';
import { UpdateTaskDto } from '../dto/update-task.dto.js';
import { UpdateTaskContentDto } from '../dto/update-task-content.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../policies/task-workflow-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { type Task, Prisma, TaskStatus, TaskPriority } from '@prisma/client';

@Injectable()
export class TaskCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
  ) {}

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

    return this.prisma.$transaction(async (tx) => {
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
        const category = await tx.category.findFirst({
          where: {
            id: data.categoryId,
            userId,
          },
        });
        if (!category) {
          throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
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

      return tx.task.create({
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
    });
  }

  async updateContent(id: number, data: UpdateTaskContentDto, userId: number): Promise<Task> {
    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasPriority = data.priority !== undefined;
    const hasStartDate = data.startDate !== undefined;
    const hasDueDate = data.dueDate !== undefined;
    const hasCategory = data.categoryId !== undefined;

    if (!hasTitle && !hasDescription && !hasPriority && !hasStartDate && !hasDueDate && !hasCategory) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    return this.prisma.$transaction(async (tx) => {
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
          const category = await tx.category.findFirst({
            where: {
              id: data.categoryId,
              userId: { in: [userId, currentTask.userId] },
            },
          });
          if (!category) {
            throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
          }
          updateData.category = { connect: { id: data.categoryId } };
        } else {
          updateData.category = { disconnect: true };
        }
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
  }

  async update(id: number, data: UpdateTaskDto, userId: number): Promise<Task> {
    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasStatus = data.status !== undefined;
    const hasStartDate = data.startDate !== undefined;
    const hasDueDate = data.dueDate !== undefined;
    const hasPriority = data.priority !== undefined;
    const hasCategory = data.categoryId !== undefined;
    const hasTeamId = data.teamId !== undefined;
    const hasAssigneeId = data.assigneeId !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasStatus &&
      !hasStartDate &&
      !hasDueDate &&
      !hasPriority &&
      !hasCategory &&
      !hasTeamId &&
      !hasAssigneeId
    ) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentTask = await this.queryService.findOne(id, userId, tx);

      const hasContentChange =
        hasTitle ||
        hasDescription ||
        hasPriority ||
        hasStartDate ||
        hasDueDate ||
        hasCategory ||
        hasTeamId;

      if (hasContentChange && !this.policy.canEditContent(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung công việc này');
      }

      if (hasStatus && data.status !== undefined && !this.workflowPolicy.canTransition(userId, currentTask, data.status)) {
        throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
      }

      if (hasAssigneeId && !this.policy.canChangeAssignee(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền phân công công việc này');
      }

      const effectiveTeamId = hasTeamId ? (data.teamId ?? null) : currentTask.teamId;
      const isTeamChanged = effectiveTeamId !== currentTask.teamId;
      let effectiveAssigneeId = hasAssigneeId ? (data.assigneeId ?? null) : currentTask.assigneeId;

      if (effectiveTeamId !== null) {
        const targetTeam = await tx.team.findUnique({
          where: { id: effectiveTeamId },
          include: { members: true },
        });
        const isCallerMember = this.policy.isTeamMember(userId, targetTeam);
        if (!isCallerMember) {
          throw new NotFoundException('Không tìm thấy nhóm');
        }

        if (hasAssigneeId) {
          if (effectiveAssigneeId) {
            const isAssigneeMember = this.policy.isTeamMember(effectiveAssigneeId, targetTeam);
            if (!isAssigneeMember) {
              throw new BadRequestException('Người được phân công không thuộc nhóm này');
            }
          }
        } else if (isTeamChanged && effectiveAssigneeId) {
          const isAssigneeMember = this.policy.isTeamMember(effectiveAssigneeId, targetTeam);
          if (!isAssigneeMember) {
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

      const checkTitle = hasTitle && data.title !== undefined ? data.title.trim() : currentTask.title;

      if (isTeamChanged || (hasTitle && data.title !== undefined)) {
        if (hasTitle && data.title !== undefined && checkTitle.length < 3) {
          throw new BadRequestException('Tiêu đề công việc mới phải có ít nhất 3 ký tự');
        }

        const duplicateScopeWhere: Prisma.TaskWhereInput = effectiveTeamId
          ? { teamId: effectiveTeamId }
          : { userId: currentTask.userId, teamId: null };

        const duplicateTask = await tx.task.findFirst({
          where: {
            ...duplicateScopeWhere,
            title: {
              equals: checkTitle,
              mode: 'insensitive',
            },
            NOT: {
              id,
            },
          },
        });

        if (duplicateTask) {
          throw new ConflictException(`Tiêu đề '${checkTitle}' đã được sử dụng bởi một công việc khác`);
        }

        if (hasTitle && data.title !== undefined) {
          updateData.title = checkTitle;
        }
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
          const category = await tx.category.findFirst({
            where: {
              id: data.categoryId,
              userId: { in: [userId, currentTask.userId] },
            },
          });
          if (!category) {
            throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
          }
          updateData.category = { connect: { id: data.categoryId } };
        } else {
          updateData.category = { disconnect: true };
        }
      }

      if (hasTeamId) {
        if (effectiveTeamId) {
          updateData.team = { connect: { id: effectiveTeamId } };
        } else {
          updateData.team = { disconnect: true };
        }
      }

      if (hasAssigneeId || (isTeamChanged && effectiveAssigneeId !== currentTask.assigneeId)) {
        if (effectiveAssigneeId) {
          updateData.assignee = { connect: { id: effectiveAssigneeId } };
        } else {
          updateData.assignee = { disconnect: true };
        }
      }

      const effectiveStatus: TaskStatus = hasStatus && data.status !== undefined ? data.status : currentTask.status;
      const isScopeOrStatusChanged = isTeamChanged || (hasStatus && data.status !== undefined && data.status !== currentTask.status);

      if (isScopeOrStatusChanged) {
        const destScope: Prisma.TaskWhereInput = effectiveTeamId
          ? { teamId: effectiveTeamId }
          : { userId: currentTask.userId, teamId: null };

        const newPosition = await this.reorderService.getNextPosition(
          tx,
          destScope,
          effectiveStatus,
        );

        updateData.status = effectiveStatus;
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

      if (hasStatus && data.status !== undefined) {
        updateData.status = data.status;
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
  }

  async remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    return this.prisma.$transaction(async (tx) => {
      const taskToDelete = await this.queryService.findOne(id, userId, tx);

      if (!this.policy.canDeleteTask(userId, taskToDelete)) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc này');
      }

      const remainingTasksScope: Prisma.TaskWhereInput = taskToDelete.teamId
        ? { teamId: taskToDelete.teamId }
        : { userId: taskToDelete.userId, teamId: null };

      const deletedTask = await tx.task.delete({
        where: { id },
      });

      await this.reorderService.reindexColumn(tx, remainingTasksScope, taskToDelete.status, [id]);

      return {
        success: true,
        message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
        deletedTask,
      };
    });
  }
}
