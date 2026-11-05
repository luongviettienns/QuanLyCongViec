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
  constructor(private readonly prisma: PrismaService) {}

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
      throw new BadRequestException('Ngày không hợp lệ');
    }
    return date;
  }

  async findAll(query?: FilterTasksDto, userId = 1): Promise<Task[]> {
    const where: Prisma.TaskWhereInput = {
      userId,
    };

    if (query?.search) {
      const keyword = query.search.trim();
      if (keyword.length > 0) {
        where.title = {
          contains: keyword,
          mode: 'insensitive',
        };
      }
    }
 
    if (query?.status) {
      where.status = query.status;
    }

    if (query?.priority) {
      where.priority = query.priority;
    }

    if (query?.categoryId !== undefined) {
      where.categoryId = query.categoryId;
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

  async findOne(id: number, userId = 1): Promise<Task> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã công việc (ID) phải là số nguyên dương hợp lệ');
    }

    const task = await this.prisma.task.findFirst({
      where: { id: id, userId },
      include: {
        category: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
  }

  async create(data: CreateTaskDto, userId: number): Promise<Task> {
    const cleanTitle = data.title.trim();

    if (cleanTitle.length < 3) {
      throw new BadRequestException('Tiêu đề công việc phải có ít nhất 3 ký tự (không tính khoảng trắng thừa)');
    }

    const existingTask = await this.prisma.task.findFirst({
      where: {
        userId,
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

    const currentCount = await this.prisma.task.count({
      where: { userId, status: initialStatus },
    });

    const newTask = await this.prisma.task.create({
      data: {
        userId,
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

  async update(id: number, data: UpdateTaskDto, userId = 1): Promise<Task> {
    const currentTask = await this.findOne(id, userId);

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

      const duplicateTask = await this.prisma.task.findFirst({
        where: {
          userId: currentTask.userId,
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
        const category = await this.prisma.category.findFirst({
          where: {
            id: data.categoryId,
            userId: currentTask.userId,
          },
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
        where: { userId: currentTask.userId, status: newStatus },
      });

      updateData.status = newStatus;
      updateData.position = newColCount;

      const remainingOldTasks = await this.prisma.task.findMany({
        where: {
          userId: currentTask.userId,
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

  async remove(id: number, userId = 1): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    const taskToDelete = await this.findOne(id, userId);

    const remainingTasks = await this.prisma.task.findMany({
      where: {
        userId: taskToDelete.userId,
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

  async reorder(dto: ReorderTasksDto, userId = 1): Promise<{ success: boolean; message: string }> {
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
        userId,
      },
    });

    if (tasksToUpdate.length !== dto.taskIds.length) {
      throw new NotFoundException('Một hoặc nhiều công việc trong danh sách không tồn tại hoặc không thuộc quyền quản lý của bạn');
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
            userId,
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
          userId,
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
  async getStats(userId: number) {
    const vnDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [vnYear, vnMonth, vnDay] = vnDateFormatter
      .format(new Date())
      .split('-')
      .map((part) => parseInt(part, 10));

    const todayDate = new Date(Date.UTC(vnYear, vnMonth - 1, vnDay));
    const next7Days = new Date(todayDate);
    next7Days.setUTCDate(next7Days.getUTCDate() + 7);

    const [statsResult, deadlinesResult] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          total: bigint | number;
          todo: bigint | number;
          inProgress: bigint | number;
          done: bigint | number;
          overdue: bigint | number;
          dueSoon: bigint | number;
          priorityLow: bigint | number;
          priorityMedium: bigint | number;
          priorityHigh: bigint | number;
        }>
      >`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE status = 'TODO')::bigint AS todo,
          COUNT(*) FILTER (WHERE status = 'IN_PROGRESS')::bigint AS "inProgress",
          COUNT(*) FILTER (WHERE status = 'DONE')::bigint AS done,
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" < ${todayDate})::bigint AS overdue,
          COUNT(*) FILTER (WHERE status != 'DONE' AND "dueDate" IS NOT NULL AND "dueDate" >= ${todayDate} AND "dueDate" < ${next7Days})::bigint AS "dueSoon",
          COUNT(*) FILTER (WHERE "Priority" = 'LOW')::bigint AS "priorityLow",
          COUNT(*) FILTER (WHERE "Priority" = 'MEDIUM')::bigint AS "priorityMedium",
          COUNT(*) FILTER (WHERE "Priority" = 'HIGH')::bigint AS "priorityHigh"
        FROM "Task"
        WHERE "userId" = ${userId};
      `,
      this.prisma.$queryRaw<
        Array<{
          date: string;
          count: bigint | number;
        }>
      >`
        SELECT
          to_char("dueDate", 'YYYY-MM-DD') AS date,
          COUNT(*)::bigint AS count
        FROM "Task"
        WHERE "userId" = ${userId}
          AND status != 'DONE'
          AND "dueDate" IS NOT NULL
          AND "dueDate" >= ${todayDate}
          AND "dueDate" < ${next7Days}
        GROUP BY "dueDate"
        ORDER BY "dueDate" ASC;
      `,
    ]);

    const stats = statsResult[0];
    const total = Number(stats?.total ?? 0);
    const todo = Number(stats?.todo ?? 0);
    const inProgress = Number(stats?.inProgress ?? 0);
    const done = Number(stats?.done ?? 0);
    const overdue = Number(stats?.overdue ?? 0);
    const dueSoon = Number(stats?.dueSoon ?? 0);
    const priorityLow = Number(stats?.priorityLow ?? 0);
    const priorityMedium = Number(stats?.priorityMedium ?? 0);
    const priorityHigh = Number(stats?.priorityHigh ?? 0);
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    const deadlineMap = new Map<string, number>();
    for (const row of deadlinesResult) {
      if (row.date) {
        deadlineMap.set(row.date, Number(row.count ?? 0));
      }
    }

    const upcomingDeadlines: Array<{ date: string; count: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(todayDate);
      d.setUTCDate(d.getUTCDate() + i);
      const isoDate = d.toISOString().slice(0, 10);
      upcomingDeadlines.push({
        date: isoDate,
        count: deadlineMap.get(isoDate) ?? 0,
      });
    }

    return {
      total,
      todo,
      inProgress,
      done,
      overdue,
      dueSoon,
      completionRate,
      byPriority: {
        low: priorityLow,
        medium: priorityMedium,
        high: priorityHigh,
      },
      upcomingDeadlines,
    };
  }
}
