import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import type { Task, Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) { }


  async findAll(query?: FilterTasksDto): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = {};

    if (query?.search) {
      const keyword = query.search.trim();
      if (keyword.length > 0) {
        where.OR = [
          {
            title: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
          {
            description: {
              contains: keyword,
              mode: 'insensitive',
            },
          },
        ];
      }
    }

    if (query?.status) {
      where.status = query.status;
    }

    if (query?.priority) {
      where.priority = query.priority;
    }

    return this.prisma.task.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: [
        { status: 'asc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }


  async findOne(id: number): Promise<Task> {

    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã công việc (ID) phải là số nguyên dương hợp lệ');
    }


    const task = await this.prisma.task.findUnique({
      where: { id: id },
      include: {
        category: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
  }


  async create(data: CreateTaskDto): Promise<Task> {

    const cleanTitle = data.title.trim();


    if (cleanTitle.length < 3) {
      throw new BadRequestException('Tiêu đề công việc phải có ít nhất 3 ký tự (không tính khoảng trắng thừa)');
    }


    const existingTask = await this.prisma.task.findFirst({
      where: {
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
      parsedStartDate = new Date(data.startDate);
      if (isNaN(parsedStartDate.getTime())) {
        throw new BadRequestException('Ngày bắt đầu không hợp lệ');
      }
    }

    let parsedDueDate: Date | null = null;
    if (data.dueDate) {
      parsedDueDate = new Date(data.dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        throw new BadRequestException('Hạn chót không hợp lệ');
      }
    }

    if (parsedStartDate && parsedDueDate && parsedStartDate > parsedDueDate) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn hạn chót (deadline)');
    }

    const initialStatus = data.status ? data.status : 'TODO';
    const initialPriority = data.priority ? data.priority : 'MEDIUM';

    if (data.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: data.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
      }
    }

    const currentCount = await this.prisma.task.count({
      where: { status: initialStatus },
    });

    const newTask = await this.prisma.task.create({
      data: {
        title: cleanTitle,
        description: cleanDescription,
        status: initialStatus,
        priority: initialPriority,
        categoryId: data.categoryId ? data.categoryId : null,
        position: currentCount,
        startDate: parsedStartDate,
        dueDate: parsedDueDate,
      },
      include: {
        category: true,
      },
    });

    return newTask;
  }


  async update(id: number, data: UpdateTaskDto): Promise<Task> {
    const currentTask = await this.findOne(id);

    const hasTitle = data.title !== undefined;
    const hasDescription = data.description !== undefined;
    const hasStatus = data.status !== undefined;
    const hasStartDate = data.startDate !== undefined;
    const hasDueDate = data.dueDate !== undefined;
    const hasPriority = data.priority !== undefined;
    const hasCategory = data.categoryId !== undefined;

    if (!hasTitle && !hasDescription && !hasStatus && !hasStartDate && !hasDueDate && !hasPriority && !hasCategory) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    const updateData: {
      title?: string;
      description?: string | null;
      status?: 'TODO' | 'IN_PROGRESS' | 'DONE';
      position?: number;
      startDate?: Date | null;
      dueDate?: Date | null;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      categoryId?: number | null;
    } = {};

    let parsedStartDate: Date | null = null;
    if (hasStartDate) {
      if (data.startDate) {
        parsedStartDate = new Date(data.startDate);
        if (isNaN(parsedStartDate.getTime())) {
          throw new BadRequestException('Ngày bắt đầu không hợp lệ');
        }
        updateData.startDate = parsedStartDate;
      } else {
        updateData.startDate = null;
      }
    }

    let parsedDueDate: Date | null = null;
    if (hasDueDate) {
      if (data.dueDate) {
        parsedDueDate = new Date(data.dueDate);
        if (isNaN(parsedDueDate.getTime())) {
          throw new BadRequestException('Hạn chót không hợp lệ');
        }
        updateData.dueDate = parsedDueDate;
      } else {
        updateData.dueDate = null;
      }
    }

    const finalStartDate = hasStartDate ? parsedStartDate : currentTask.startDate;
    const finalDueDate = hasDueDate ? parsedDueDate : currentTask.dueDate;
    if (finalStartDate && finalDueDate && finalStartDate > finalDueDate) {
      throw new BadRequestException('Ngày bắt đầu không được lớn hơn hạn chót (deadline)');
    }

    if (hasTitle && data.title !== undefined) {
      const cleanTitle = data.title.trim();

      if (cleanTitle.length < 3) {
        throw new BadRequestException('Tiêu đề công việc mới phải có ít nhất 3 ký tự');
      }

      const duplicateTask = await this.prisma.task.findFirst({
        where: {
          title: {
            equals: cleanTitle,
            mode: 'insensitive',
          },
          NOT: {
            id: id,
          },
        },
      });

      if (duplicateTask) {
        throw new ConflictException(`Tiêu đề '${cleanTitle}' đã được sử dụng bởi một công việc khác`);
      }

      updateData.title = cleanTitle;
    }

    if (hasDescription && data.description !== undefined) {
      const trimmedDesc = data.description.trim();
      updateData.description = trimmedDesc.length > 0 ? trimmedDesc : null;
    }

    if (hasPriority && data.priority !== undefined) {
      updateData.priority = data.priority;
    }

    if (hasCategory) {
      if (data.categoryId) {
        const category = await this.prisma.category.findUnique({
          where: { id: data.categoryId },
        });
        if (!category) {
          throw new NotFoundException(`Không tìm thấy danh mục với mã #${data.categoryId}`);
        }
        updateData.categoryId = data.categoryId;
      } else {
        updateData.categoryId = null;
      }
    }

    const isStatusChanged = hasStatus && data.status !== undefined && data.status !== currentTask.status;

    if (isStatusChanged && data.status !== undefined) {
      const newStatus = data.status;

      const newColCount = await this.prisma.task.count({
        where: { status: newStatus },
      });

      updateData.status = newStatus;
      updateData.position = newColCount;

      const remainingOldTasks = await this.prisma.task.findMany({
        where: {
          status: currentTask.status,
          NOT: { id: id },
        },
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
          where: { id: id },
          data: updateData,
          include: {
            category: true,
          },
        }),
        ...reindexOldColOps,
      ]);

      return updatedTask;
    }

    if (hasStatus && data.status !== undefined) {
      updateData.status = data.status;
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: id },
      data: updateData,
      include: {
        category: true,
      },
    });

    return updatedTask;
  }


  async remove(id: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    const taskToDelete = await this.findOne(id);

    const remainingTasks = await this.prisma.task.findMany({
      where: {
        status: taskToDelete.status,
        NOT: { id: id },
      },
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
        where: { id: id },
      }),
      ...reindexOps,
    ]);

    return {
      success: true,
      message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
      deletedTask: deletedTask,
    };
  }

  async reorder(dto: ReorderTasksDto): Promise<{ success: boolean; message: string }> {
    if (!dto.taskIds || dto.taskIds.length === 0) {
      throw new BadRequestException('Danh sách ID công việc không được để trống');
    }

    const uniqueIdSet = new Set(dto.taskIds);
    if (uniqueIdSet.size !== dto.taskIds.length) {
      throw new BadRequestException('Danh sách ID công việc có phần tử trùng lặp');
    }

    const tasksToUpdate = await this.prisma.task.findMany({
      where: {
        id: { in: dto.taskIds },
      },
    });

    if (tasksToUpdate.length !== dto.taskIds.length) {
      throw new NotFoundException('Một hoặc nhiều công việc trong danh sách không tồn tại');
    }

    if (dto.status) {
      const targetStatus = dto.status;

      const oldColumns = new Set<'TODO' | 'IN_PROGRESS' | 'DONE'>();
      for (const t of tasksToUpdate) {
        if (t.status !== targetStatus) {
          oldColumns.add(t.status);
        }
      }

      const oldColReindexOps = [];
      for (const oldCol of oldColumns) {
        const remainingInOldCol = await this.prisma.task.findMany({
          where: {
            status: oldCol,
            NOT: { id: { in: dto.taskIds } },
          },
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        for (let i = 0; i < remainingInOldCol.length; i++) {
          oldColReindexOps.push(
            this.prisma.task.update({
              where: { id: remainingInOldCol[i].id },
              data: { position: i },
            }),
          );
        }
      }

      const unmentionedInTarget = await this.prisma.task.findMany({
        where: {
          status: targetStatus,
          NOT: { id: { in: dto.taskIds } },
        },
        orderBy: [
          { position: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      const unmentionedOps = unmentionedInTarget.map((t, idx) =>
        this.prisma.task.update({
          where: { id: t.id },
          data: { position: dto.taskIds.length + idx },
        }),
      );

      const targetOps = dto.taskIds.map((taskId, newPosition) =>
        this.prisma.task.update({
          where: { id: taskId },
          data: {
            position: newPosition,
            status: targetStatus,
          },
        }),
      );
        
      await this.prisma.$transaction([
        ...oldColReindexOps,
        ...targetOps,
        ...unmentionedOps,
      ]);
    } else {
      const targetOps = dto.taskIds.map((taskId, newPosition) =>
        this.prisma.task.update({
          where: { id: taskId },
          data: { position: newPosition },
        }),
      );

      await this.prisma.$transaction(targetOps);
    }

    return {
      success: true,
      message: 'Cập nhật thứ tự công việc vào database thành công',
    };
  }
}
