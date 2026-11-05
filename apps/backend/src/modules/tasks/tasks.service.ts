import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import { TeamRole, type Task, type Prisma } from '@prisma/client';

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
      throw new BadRequestException('Ngày không hợp lệ trong lịch');
    }
    return date;
  }

  async findAll(query?: FilterTasksDto, userId = 1): Promise<Task[]> {
    let baseWhere: Prisma.TaskWhereInput = {};

    if (query?.teamId) {
      const isMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: query.teamId, userId } },
      });
      if (!isMember) {
        throw new ForbiddenException('Bạn không phải thành viên của nhóm này');
      }
      baseWhere = { teamId: query.teamId };
    } else if (query?.scope === 'assigned_to_me') {
      baseWhere = { assigneeId: userId };
    } else if (query?.scope === 'created_by_me') {
      baseWhere = { userId };
    } else {
      baseWhere = {
        OR: [
          { userId },
          { assigneeId: userId },
          { team: { members: { some: { userId } } } },
        ],
      };
    }

    const where: Prisma.TaskWhereInput = {
      ...baseWhere,
    };

    if (query?.assigneeId) {
      where.assigneeId = query.assigneeId;
    }

    if (query?.search && query.search.trim().length > 0) {
      where.title = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
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
        assignee: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
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

    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        category: true,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    const isCreator = task.userId === userId;
    const isAssignee = task.assigneeId === userId;
    const isTeamMember = task.team?.members.some((m) => m.userId === userId) ?? false;

    if (!isCreator && !isAssignee && !isTeamMember) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
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
        throw new ForbiddenException('Bạn không phải thành viên của nhóm này');
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

  async update(id: number, data: UpdateTaskDto, userId = 1): Promise<Task> {
    const currentTask = await this.findOne(id, userId);

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

    const effectiveTeamId = hasTeamId ? data.teamId : currentTask.teamId;

    if (effectiveTeamId) {
      const isMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: effectiveTeamId, userId } },
      });
      if (!isMember) {
        throw new ForbiddenException('Bạn không phải thành viên của nhóm này');
      }

      if (hasAssigneeId && data.assigneeId) {
        const isAssigneeMember = await this.prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: effectiveTeamId, userId: data.assigneeId } },
        });
        if (!isAssigneeMember) {
          throw new BadRequestException('Người được phân công không thuộc nhóm này');
        }
      }
    } else {
      if (hasAssigneeId && data.assigneeId && data.assigneeId !== currentTask.userId) {
        throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
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

    if (hasTitle && data.title !== undefined) {
      const cleanTitle = data.title.trim();

      if (cleanTitle.length < 3) {
        throw new BadRequestException('Tiêu đề công việc mới phải có ít nhất 3 ký tự');
      }

      const duplicateScopeWhere = effectiveTeamId
        ? { teamId: effectiveTeamId }
        : { userId: currentTask.userId, teamId: null };

      const duplicateTask = await this.prisma.task.findFirst({
        where: {
          ...duplicateScopeWhere,
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
        updateData.category = { connect: { id: data.categoryId } };
      } else {
        updateData.category = { disconnect: true };
      }
    }

    if (hasTeamId) {
      if (data.teamId) {
        updateData.team = { connect: { id: data.teamId } };
      } else {
        updateData.team = { disconnect: true };
      }
    }

    if (hasAssigneeId) {
      if (data.assigneeId) {
        updateData.assignee = { connect: { id: data.assigneeId } };
      } else {
        updateData.assignee = { disconnect: true };
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
      where: { id: id },
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
    const taskToDelete = await this.findOne(id, userId);

    if (taskToDelete.userId !== userId) {
      if (taskToDelete.teamId) {
        const callerMember = await this.prisma.teamMember.findUnique({
          where: { teamId_userId: { teamId: taskToDelete.teamId, userId } },
        });
        if (!callerMember || (callerMember.role !== TeamRole.OWNER && callerMember.role !== TeamRole.ADMIN)) {
          throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
        }
      } else {
        throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
      }
    }

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
