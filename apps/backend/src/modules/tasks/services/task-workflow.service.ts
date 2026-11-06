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
import { TaskWorkflowPolicy } from '../policies/task-workflow-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskCrudService } from './task-crud.service.js';
import { type Task, TaskStatus } from '@prisma/client';

@Injectable()
export class TaskWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
    private readonly queryService: TaskQueryService,
    private readonly crudService: TaskCrudService,
  ) {}

  async updateStatus(id: number, data: UpdateTaskStatusDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (!this.workflowPolicy.canTransition(userId, currentTask, data.status)) {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái công việc này');
    }

    if (currentTask.status === data.status) {
      if (data.position === undefined) {
        return currentTask;
      }

      const sameColScope = currentTask.teamId
        ? { teamId: currentTask.teamId, status: currentTask.status }
        : { userId: currentTask.userId, teamId: null, status: currentTask.status };

      const colTasks = await this.prisma.task.findMany({
        where: sameColScope,
        orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
      });

      const filtered = colTasks.filter((t) => t.id !== id);
      const targetIdx = data.position >= 0 && data.position <= filtered.length ? data.position : filtered.length;
      filtered.splice(targetIdx, 0, currentTask);

      const ops = filtered.map((t, idx) =>
        this.prisma.task.update({
          where: { id: t.id },
          data: { position: idx },
          ...(t.id === id
            ? {
                include: {
                  category: true,
                  assignee: { select: { id: true, name: true, email: true } },
                  team: { select: { id: true, name: true } },
                },
              }
            : {}),
        }),
      );

      const results = await this.prisma.$transaction(ops);
      return (results[targetIdx] as Task) || currentTask;
    }

    const destScope = currentTask.teamId
      ? { teamId: currentTask.teamId, status: data.status, NOT: { id } }
      : { userId: currentTask.userId, teamId: null, status: data.status, NOT: { id } };

    const destTasks = await this.prisma.task.findMany({
      where: destScope,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });

    const targetIdx =
      data.position !== undefined && data.position >= 0 && data.position <= destTasks.length
        ? data.position
        : destTasks.length;

    const newDestTasks = [...destTasks];
    newDestTasks.splice(targetIdx, 0, currentTask);

    const destOps = newDestTasks.map((t, idx) =>
      t.id === id
        ? this.prisma.task.update({
            where: { id },
            data: {
              status: data.status,
              position: idx,
            },
            include: {
              category: true,
              assignee: { select: { id: true, name: true, email: true } },
              team: { select: { id: true, name: true } },
            },
          })
        : this.prisma.task.update({
            where: { id: t.id },
            data: { position: idx },
          }),
    );

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

    const results = await this.prisma.$transaction([...reindexOldColOps, ...destOps]);
    return results[reindexOldColOps.length + targetIdx] as Task;
  }

  async updateAssignee(id: number, data: UpdateTaskAssigneeDto, userId: number): Promise<Task> {
    const currentTask = await this.queryService.findOne(id, userId);

    if (!this.policy.canChangeAssignee(userId, currentTask)) {
      throw new ForbiddenException('Bạn không có quyền phân công công việc này');
    }

    if (data.assigneeId !== undefined && data.assigneeId !== null) {
      if (currentTask.teamId) {
        const isMember = this.policy.isTeamMember(data.assigneeId, currentTask.team);
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

    if (currentTask.status === TaskStatus.DONE) {
      throw new BadRequestException('Không thể trả lại công việc đã hoàn thành');
    }

    if (!this.policy.canReturnTask(userId, currentTask)) {
      throw new ForbiddenException('Chỉ người đang được phân công mới có quyền trả lại công việc');
    }

    const isCreatorMember = this.policy.isTeamMember(currentTask.userId, currentTask.team);
    const newAssigneeId = isCreatorMember ? currentTask.userId : null;

    const todoScope = { teamId: currentTask.teamId, status: TaskStatus.TODO, NOT: { id } };
    const newPositionInTodo = await this.prisma.task.count({ where: todoScope });

    const oldPosScope = { teamId: currentTask.teamId, status: currentTask.status, NOT: { id } };
    const remainingOldTasks = await this.prisma.task.findMany({
      where: oldPosScope,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });

    const reindexOldOps = remainingOldTasks.map((t, idx) =>
      this.prisma.task.update({
        where: { id: t.id },
        data: { position: idx },
      }),
    );

    const returningUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const returnerName = returningUser?.name || 'Assignee';
    const cleanReason = data.reason?.trim() ? data.reason.trim() : 'Không có lý do cụ thể';
    const returnNote = `\n\n[Trả lại bởi ${returnerName} vào ${new Date().toISOString().slice(0, 10)}]: ${cleanReason}`;
    const newDescription = currentTask.description ? `${currentTask.description}${returnNote}` : returnNote.trim();

    const notifyUserId = isCreatorMember ? currentTask.userId : (currentTask.team?.ownerId ?? currentTask.userId);
    const notificationOp = this.prisma.notification.create({
      data: {
        userId: notifyUserId,
        type: 'TASK_STATUS_CHANGED',
        title: `Công việc #${currentTask.id} được trả lại`,
        content: `${returnerName} đã trả lại công việc "${currentTask.title}". Lý do: ${cleanReason}`,
        taskId: currentTask.id,
        teamId: currentTask.teamId,
      },
    });

    const [updatedTask] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id },
        data: {
          assignee: newAssigneeId ? { connect: { id: newAssigneeId } } : { disconnect: true },
          status: TaskStatus.TODO,
          position: newPositionInTodo,
          description: newDescription,
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
      ...reindexOldOps,
      notificationOp,
    ]);

    return updatedTask;
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
