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

  async buildTeamAccessWhere(userId: number, teamId?: number): Promise<Prisma.TaskWhereInput> {
    if (teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        include: { members: true },
      });
      if (!this.policy.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }
      return { teamId };
    }

    const userTeamAccessWhere: Prisma.TeamWhereInput = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId } } },
      ],
    };

    return {
      OR: [
        { teamId: null, userId },
        { teamId: null, assigneeId: userId },
        { team: userTeamAccessWhere },
      ],
    };
  }

  applyAttributeFilters(andClauses: Prisma.TaskWhereInput[], query?: FilterTasksDto): void {
    if (!query) return;

    if (query.assigneeId) {
      andClauses.push({ assigneeId: query.assigneeId });
    }

    if (query.search && query.search.trim().length > 0) {
      andClauses.push({
        title: {
          contains: query.search.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.status) {
      andClauses.push({ status: query.status });
    }

    if (query.priority) {
      andClauses.push({ priority: query.priority });
    }

    if (query.categoryId !== undefined) {
      andClauses.push({ categoryId: query.categoryId });
    }
  }

  async findAll(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    const teamAccessWhere = await this.buildTeamAccessWhere(userId, query?.teamId);

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

    const andClauses: Prisma.TaskWhereInput[] = [teamAccessWhere];
    if (Object.keys(scopeWhere).length > 0) {
      andClauses.push(scopeWhere);
    }
    this.applyAttributeFilters(andClauses, query);

    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      AND: andClauses,
    };

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

  async findTrash(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    const accessWhere = await this.buildTeamAccessWhere(userId, query?.teamId);
    const andClauses: Prisma.TaskWhereInput[] = [accessWhere];
    this.applyAttributeFilters(andClauses, query);

    return this.prisma.task.findMany({
      where: {
        deletedAt: { not: null },
        AND: andClauses,
      },
      include: {
        category: true,
        assignee: { select: { id: true, name: true, email: true } },
        deletedBy: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: [{ deletedAt: 'desc' }, { updatedAt: 'desc' }],
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
            completedBy: {
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
