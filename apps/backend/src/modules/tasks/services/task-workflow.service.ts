import { Injectable } from '@nestjs/common';
import { TaskStatusService } from './task-status.service.js';
import { TaskAssignmentService } from './task-assignment.service.js';
import { TaskTransferService } from './task-transfer.service.js';
import { UpdateTaskStatusDto } from '../dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from '../dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from '../dto/return-task.dto.js';
import { MoveTaskTeamDto } from '../dto/move-task-team.dto.js';
import { type Task, Prisma } from '@prisma/client';

@Injectable()
export class TaskWorkflowService {
  constructor(
    private readonly statusService: TaskStatusService,
    private readonly assignmentService: TaskAssignmentService,
    private readonly transferService: TaskTransferService,
  ) {}

  updateStatus(
    id: number,
    data: UpdateTaskStatusDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    return this.statusService.updateStatus(id, data, userId, externalTx);
  }

  updateAssignee(
    id: number,
    data: UpdateTaskAssigneeDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    return this.assignmentService.updateAssignee(id, data, userId, externalTx);
  }

  returnTask(id: number, data: ReturnTaskDto, userId: number): Promise<Task> {
    return this.assignmentService.returnTask(id, data, userId);
  }

  moveTeam(
    id: number,
    dto: MoveTaskTeamDto,
    userId: number,
    externalTx?: Prisma.TransactionClient,
  ): Promise<Task> {
    return this.transferService.moveTeam(id, dto, userId, externalTx);
  }
}
