import { Injectable } from '@nestjs/common';
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
    private readonly taskQueryService: TaskQueryService,
    private readonly taskCrudService: TaskCrudService,
    private readonly taskWorkflowService: TaskWorkflowService,
    private readonly taskReorderService: TaskReorderService,
    private readonly taskStatsService: TaskStatsService,
  ) {}

  findAll(query?: FilterTasksDto, userId = 1): Promise<Task[]> {
    return this.taskQueryService.findAll(query, userId);
  }

  findOne(id: number, userId = 1): Promise<TaskWithTeamAndMembers> {
    return this.taskQueryService.findOne(id, userId);
  }

  create(data: CreateTaskDto, userId: number): Promise<Task> {
    return this.taskCrudService.create(data, userId);
  }

  update(id: number, data: UpdateTaskDto, userId = 1): Promise<Task> {
    return this.taskCrudService.update(id, data, userId);
  }

  updateContent(id: number, data: UpdateTaskContentDto, userId: number): Promise<Task> {
    return this.taskCrudService.updateContent(id, data, userId);
  }

  remove(id: number, userId = 1): Promise<{ success: boolean; message: string; deletedTask: Task }> {
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

  reorder(dto: ReorderTasksDto, userId = 1): Promise<{ success: boolean; message: string }> {
    return this.taskReorderService.reorder(dto, userId);
  }

  getStats(userId: number, query?: FilterTasksDto) {
    return this.taskStatsService.getStats(userId, query);
  }
}
