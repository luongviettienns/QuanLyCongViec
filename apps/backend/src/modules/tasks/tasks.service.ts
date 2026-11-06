import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskQueryService } from './services/task-query.service.js';
import { TaskCrudService } from './services/task-crud.service.js';
import { TaskWorkflowService } from './services/task-workflow.service.js';
import { TaskReorderService } from './services/task-reorder.service.js';
import { TaskStatsService } from './services/task-stats.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { UpdateTaskContentDto } from './dto/update-task-content.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from './dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from './dto/return-task.dto.js';
import { MoveTaskTeamDto } from './dto/move-task-team.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import type { TaskWithTeamAndMembers } from './policies/task-policy.service.js';
import type { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueryService: TaskQueryService,
    private readonly taskCrudService: TaskCrudService,
    private readonly taskWorkflowService: TaskWorkflowService,
    private readonly taskReorderService: TaskReorderService,
    private readonly taskStatsService: TaskStatsService,
  ) {}

  findAll(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    return this.taskQueryService.findAll(query, userId);
  }

  findOne(id: number, userId: number): Promise<TaskWithTeamAndMembers> {
    return this.taskQueryService.findOne(id, userId);
  }

  create(data: CreateTaskDto, userId: number): Promise<Task> {
    return this.taskCrudService.create(data, userId);
  }

  async update(id: number, data: UpdateTaskDto, userId: number): Promise<Task> {
    const hasContent =
      data.title !== undefined ||
      data.description !== undefined ||
      data.priority !== undefined ||
      data.startDate !== undefined ||
      data.dueDate !== undefined ||
      data.categoryId !== undefined;
    const hasTeam = data.teamId !== undefined;
    const hasAssignee = data.assigneeId !== undefined;
    const hasStatus = data.status !== undefined;

    if (!hasContent && !hasTeam && !hasAssignee && !hasStatus) {
      throw new BadRequestException('Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    return this.prisma.$transaction(async (tx) => {
      let updated: Task | undefined;

      if (hasContent) {
        updated = await this.taskCrudService.updateContent(
          id,
          {
            title: data.title,
            description: data.description,
            priority: data.priority,
            startDate: data.startDate,
            dueDate: data.dueDate,
            categoryId: data.categoryId,
          },
          userId,
          tx,
        );
      }

      if (hasTeam) {
        updated = await this.taskWorkflowService.moveTeam(
          id,
          {
            teamId: data.teamId,
            assigneeId: data.assigneeId,
          },
          userId,
          tx,
        );
      } else if (hasAssignee) {
        updated = await this.taskWorkflowService.updateAssignee(
          id,
          { assigneeId: data.assigneeId },
          userId,
          tx,
        );
      }

      if (hasStatus && data.status !== undefined) {
        updated = await this.taskWorkflowService.updateStatus(
          id,
          { status: data.status },
          userId,
          tx,
        );
      }

      if (!updated) {
        return this.taskQueryService.findOne(id, userId, tx);
      }

      return updated;
    });
  }

  updateContent(id: number, data: UpdateTaskContentDto, userId: number): Promise<Task> {
    return this.taskCrudService.updateContent(id, data, userId);
  }

  remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    return this.taskCrudService.remove(id, userId);
  }

  updateStatus(id: number, data: UpdateTaskStatusDto, userId: number): Promise<Task> {
    return this.taskWorkflowService.updateStatus(id, data, userId);
  }

  updateAssignee(id: number, data: UpdateTaskAssigneeDto, userId: number): Promise<Task> {
    return this.taskWorkflowService.updateAssignee(id, data, userId);
  }

  returnTask(id: number, data: ReturnTaskDto, userId: number): Promise<Task> {
    return this.taskWorkflowService.returnTask(id, data, userId);
  }

  moveTeam(id: number, dto: MoveTaskTeamDto, userId: number): Promise<Task> {
    return this.taskWorkflowService.moveTeam(id, dto, userId);
  }

  reorder(dto: ReorderTasksDto, userId: number): Promise<{ success: boolean; message: string }> {
    return this.taskReorderService.reorder(dto, userId);
  }

  getStats(userId: number, query?: FilterTasksDto) {
    return this.taskStatsService.getStats(userId, query);
  }
}
