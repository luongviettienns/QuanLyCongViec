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
    const userTeamAccessWhere: Prisma.TeamWhereInput = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    };

    let teamAccessWhere: Prisma.TaskWhereInput;

    if (query?.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: query.teamId },
        include: { members: true },
      });
      if (!this.policy.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      teamAccessWhere = { teamId: query.teamId };
    } else {
      teamAccessWhere = {
        OR: [
          { teamId: null, userId },
          { teamId: null, assigneeId: userId },
          { team: userTeamAccessWhere },
        ],
      };
    }

    let scopeWhere: Prisma.TaskWhereInput = {};
    if (query?.scope === 'created_by_me') {
      scopeWhere = { userId };
    } else if (query?.scope === 'assigned_to_me') {
      scopeWhere = { assigneeId: userId };
    } else if (query?.scope === 'collaborating') {
      scopeWhere = {
        collaborators: {
          some: {
            userId,
            status: 'ACCEPTED',
          },
        },
      };
    } else if (query?.scope === 'subtasks_assigned_to_me') {
      scopeWhere = {
        subtasks: {
          some: {
            assigneeId: userId,
            deletedAt: null,
          },
        },
      };
    } else if (query?.scope === 'my_work') {
      scopeWhere = {
        OR: [
          { assigneeId: userId },
          {
            collaborators: {
              some: {
                userId,
                status: 'ACCEPTED',
              },
            },
          },
          {
            subtasks: {
              some: {
                assigneeId: userId,
                deletedAt: null,
              },
            },
          },
        ],
      };
    }

    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      AND: [teamAccessWhere, scopeWhere],
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
          select: { id: true, name: true, ownerId: true },
        },
        collaborators: {
          where: { status: 'ACCEPTED' },
          select: {
            id: true,
            userId: true,
            status: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        subtasks: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            status: true,
            position: true,
            assigneeId: true,
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: [
        { status: 'asc' },
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(
    id: number,
    userId: number,
    tx: Prisma.TransactionClient = this.prisma,
    options?: { includeDeleted?: boolean },
  ): Promise<TaskWithTeamAndMembers> {
    if (isNaN(id) || id <= 0) {
      throw new BadRequestException('Mã công việc (ID) phải là số nguyên dương hợp lệ');
    }

    const task = await tx.task.findFirst({
      where: {
        id,
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        category: true,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
        collaborators: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            invitedBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        subtasks: {
          where: { deletedAt: null },
          include: {
            assignee: {
              select: { id: true, name: true, email: true },
            },
            createdBy: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!task || !this.policy.canViewTask(userId, task)) {
      throw new NotFoundException(`Không tìm thấy công việc với mã #${id}`);
    }

    return task;
  }
}
