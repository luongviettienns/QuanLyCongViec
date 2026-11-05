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
import { TaskQueryService } from './task-query.service.js';
import { type Task, Prisma } from '@prisma/client';

@Injectable()
export class TaskCrudService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
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

    const titleScopeWhere = data.teamId
      ? { teamId: data.teamId }
      : { userId, teamId: null };

    const existingTask = await this.prisma.task.findFirst({
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

    const initialStatus = data.status ? data.status : 'TODO';
    const initialPriority = data.priority ? data.priority : 'MEDIUM';

    if (data.categoryId) {
      const category = await this.prisma.category.findFirst({
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
      const member = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: data.teamId, userId } },
      });
      if (!member) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }

      if (data.assigneeId) {
        const assigneeMember = await this.prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: data.teamId, userId: data.assigneeId } },
        });
        if (!assigneeMember) {
          throw new BadRequestException('Người được phân công không thuộc nhóm này');
        }
      }
    } else {
      if (data.assigneeId && data.assigneeId !== userId) {
        throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
      }
    }

    const positionScopeWhere = data.teamId
      ? { teamId: data.teamId, status: initialStatus }
      : { userId, teamId: null, status: initialStatus };

    const currentCount = await this.prisma.task.count({
      where: positionScopeWhere,
    });

    return this.prisma.task.create({
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
  }

  async updateContent(id: number, data: UpdateTaskContentDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (!this.policy.canEditContent(userId, currentTask)) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa nội dung công việc này');
    }

    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasPriority = data.priority !== undefined;
    const hasStartDate = data.startDate !== undefined;
    const hasDueDate = data.dueDate !== undefined;
    const hasCategory = data.categoryId !== undefined;

    if (!hasTitle && !hasDescription && !hasPriority && !hasStartDate && !hasDueDate && !hasCategory) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
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

      const duplicateScopeWhere = currentTask.teamId
        ? { teamId: currentTask.teamId }
        : { userId: currentTask.userId, teamId: null };

      const duplicateTask = await this.prisma.task.findFirst({
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
        const category = await this.prisma.category.findFirst({
          where: {
            id: data.categoryId,
            userId: currentTask.userId,
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

    return this.prisma.task.update({
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
  }

  async update(id: number, data: UpdateTaskDto, userId = 1): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

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

    if (hasStatus && !this.policy.canChangeStatus(userId, currentTask, data.status)) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
    }

    if (hasAssigneeId && !this.policy.canChangeAssignee(userId, currentTask)) {
      throw new ForbiddenException('Bạn không có quyền phân công công việc này');
    }

    const effectiveTeamId = hasTeamId ? (data.teamId ?? null) : currentTask.teamId;
    const isTeamChanged = effectiveTeamId !== currentTask.teamId;
    let effectiveAssigneeId = hasAssigneeId ? (data.assigneeId ?? null) : currentTask.assigneeId;

    if (effectiveTeamId !== null) {
      const isCallerMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: effectiveTeamId, userId } },
      });
      if (!isCallerMember) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }

      if (hasAssigneeId) {
        if (effectiveAssigneeId) {
          const isAssigneeMember = await this.prisma.teamMember.findUnique({
            where: { teamId_userId: { teamId: effectiveTeamId, userId: effectiveAssigneeId } },
          });
          if (!isAssigneeMember) {
            throw new BadRequestException('Người được phân công không thuộc nhóm này');
          }
        }
      } else if (isTeamChanged && effectiveAssigneeId) {
        const isAssigneeMember = await this.prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: effectiveTeamId, userId: effectiveAssigneeId } },
        });
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

      const duplicateScopeWhere = effectiveTeamId
        ? { teamId: effectiveTeamId }
        : { userId: currentTask.userId, teamId: null };

      const duplicateTask = await this.prisma.task.findFirst({
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
        const category = await this.prisma.category.findFirst({
          where: {
            id: data.categoryId,
            userId: currentTask.userId,
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

    const effectiveStatus = hasStatus && data.status !== undefined ? data.status : currentTask.status;
    const isScopeOrStatusChanged = isTeamChanged || (hasStatus && data.status !== undefined && data.status !== currentTask.status);

    if (isScopeOrStatusChanged) {
      const destScope = effectiveTeamId
        ? { teamId: effectiveTeamId, status: effectiveStatus }
        : { userId: currentTask.userId, teamId: null, status: effectiveStatus };

      const newPosition = await this.prisma.task.count({
        where: destScope,
      });

      updateData.status = effectiveStatus;
      updateData.position = newPosition;

      const sourceScope = currentTask.teamId
        ? { teamId: currentTask.teamId, status: currentTask.status, NOT: { id } }
        : { userId: currentTask.userId, teamId: null, status: currentTask.status, NOT: { id } };

      const remainingOldTasks = await this.prisma.task.findMany({
        where: sourceScope,
        orderBy: [
          { position: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      const reindexOldColOps = remainingOldTasks.map((t, index) =>
        this.prisma.task.update({
          where: { id: t.id },
          data: { position: index },
        }),
      );

      const [updatedTask] = await this.prisma.$transaction([
        this.prisma.task.update({
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
        }),
        ...reindexOldColOps,
      ]);

      return updatedTask;
    }

    if (hasStatus && data.status !== undefined) {
      updateData.status = data.status;
    }

    return this.prisma.task.update({
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
  }

  async remove(id: number, userId = 1): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    const taskToDelete = await this.queryService.findOne(id, userId);

    if (!this.policy.canDeleteTask(userId, taskToDelete)) {
      throw new ForbiddenException('Bạn không có quyền xóa công việc này');
    }

    const remainingTasksScope = taskToDelete.teamId
      ? { teamId: taskToDelete.teamId, status: taskToDelete.status, NOT: { id } }
      : { userId: taskToDelete.userId, teamId: null, status: taskToDelete.status, NOT: { id } };

    const remainingTasks = await this.prisma.task.findMany({
      where: remainingTasksScope,
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const reindexOps = remainingTasks.map((t, index) =>
      this.prisma.task.update({
        where: { id: t.id },
        data: { position: index },
      }),
    );

    const [deletedTask] = await this.prisma.$transaction([
      this.prisma.task.delete({
        where: { id },
      }),
      ...reindexOps,
    ]);

    return {
      success: true,
      message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
      deletedTask,
    };
  }
}
