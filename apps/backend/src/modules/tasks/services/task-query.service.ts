import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FilterTasksDto } from '../dto/filter-tasks.dto.js';
import { TaskPolicyService, type TaskWithTeamAndMembers } from '../policies/task-policy.service.js';
import { type Task, Prisma } from '@prisma/client';

@Injectable()
export class TaskQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
  ) {}

  async findAll(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    let baseWhere: Prisma.TaskWhereInput = {};

    if (query?.teamId) {
      const isMember = await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId: query.teamId, userId } },
      });
      if (!isMember) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      baseWhere = { teamId: query.teamId };
    } else if (query?.scope === 'assigned_to_me') {
      baseWhere = {
        assigneeId: userId,
        OR: [
          { teamId: null },
          { team: { members: { some: { userId } } } },
        ],
      };
    } else if (query?.scope === 'created_by_me') {
      baseWhere = {
        userId,
        OR: [
          { teamId: null },
          { team: { members: { some: { userId } } } },
        ],
      };
    } else {
      baseWhere = {
        OR: [
          { teamId: null, userId },
          { teamId: null, assigneeId: userId },
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

  async findOne(id: number, userId: number): Promise<TaskWithTeamAndMembers> {
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

    if (!task || !this.policy.canViewTask(userId, task)) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
  }
}
