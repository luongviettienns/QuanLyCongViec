import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from '../dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from '../dto/return-task.dto.js';
import { MoveTaskTeamDto } from '../dto/move-task-team.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskCrudService } from './task-crud.service.js';
import { type Task, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly crudService: TaskCrudService,
  ) {}

  async updateStatus(id: number, data: UpdateTaskStatusDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (!this.policy.canChangeStatus(userId, currentTask, data.status)) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
    }

    if (currentTask.status === data.status) {
      return currentTask;
    }

    const posScope = currentTask.teamId
      ? { teamId: currentTask.teamId, status: data.status }
      : { userId: currentTask.userId, teamId: null, status: data.status };

    const newPosition = await this.prisma.task.count({
      where: posScope,
    });

    const oldPosScope = currentTask.teamId
      ? { teamId: currentTask.teamId, status: currentTask.status, NOT: { id } }
      : { userId: currentTask.userId, teamId: null, status: currentTask.status, NOT: { id } };

    const remainingOldTasks = await this.prisma.task.findMany({
      where: oldPosScope,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
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
        data: {
          status: data.status,
          position: newPosition,
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
      }),
      ...reindexOldColOps,
    ]);

    return updatedTask;
  }

  async updateAssignee(id: number, data: UpdateTaskAssigneeDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (!this.policy.canChangeAssignee(userId, currentTask)) {
      throw new ForbiddenException('Bạn không có quyền phân công công việc này');
    }

    if (data.assigneeId !== undefined && data.assigneeId !== null) {
      if (currentTask.teamId) {
        const isMember = await this.prisma.teamMember.findUnique({
          where: {
            teamId_userId: {
              teamId: currentTask.teamId,
              userId: data.assigneeId,
            },
          },
        });
        if (!isMember) {
          throw new BadRequestException('Người được phân công không thuộc nhóm này');
        }
      } else {
        if (data.assigneeId !== currentTask.userId) {
          throw new BadRequestException('Công việc cá nhân chỉ có thể phân công cho chính bạn');
        }
      }
    }

    return this.prisma.task.update({
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
  }

  async returnTask(id: number, data: ReturnTaskDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (currentTask.teamId === null) {
      throw new BadRequestException('Công việc cá nhân không thể thực hiện thao tác trả về');
    }

    if (!this.policy.canReturnTask(userId, currentTask)) {
      throw new ForbiddenException('Chỉ người đang được phân công mới có quyền trả lại công việc');
    }

    const isCreatorMember = currentTask.team?.members.some(
      (m) => m.userId === currentTask.userId,
    ) ?? false;

    if (isCreatorMember) {
      return this.prisma.task.update({
        where: { id },
        data: {
          assignee: { connect: { id: currentTask.userId } },
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

    return this.prisma.task.update({
      where: { id },
      data: {
        assignee: { disconnect: true },
        status: TaskStatus.TODO,
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

  async moveTeam(id: number, dto: MoveTaskTeamDto, userId: number): Promise<Task> {
    return this.crudService.update(
      id,
      {
        teamId: dto.teamId,
        assigneeId: dto.assigneeId,
      },
      userId,
    );
  }
}
