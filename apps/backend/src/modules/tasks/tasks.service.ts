import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { TaskQueryService } from './services/task-query.service.js';
import { TaskCrudService } from './services/task-crud.service.js';
import { TaskTrashService } from './services/task-trash.service.js';
import { TaskWorkflowService } from './services/task-workflow.service.js';
import { TaskReorderService } from './services/task-reorder.service.js';
import { TaskStatsService } from './services/task-stats.service.js';
import { TaskCollaboratorService } from './services/task-collaborator.service.js';
import { SubtaskService } from './services/subtask.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { UpdateTaskContentDto } from './dto/update-task-content.dto.js';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto.js';
import { UpdateTaskAssigneeDto } from './dto/update-task-assignee.dto.js';
import { ReturnTaskDto } from './dto/return-task.dto.js';
import { MoveTaskTeamDto } from './dto/move-task-team.dto.js';
import { ReorderTasksDto } from './dto/reorder-tasks.dto.js';
import { FilterTasksDto } from './dto/filter-tasks.dto.js';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto.js';
import { RespondCollaboratorDto } from './dto/respond-collaborator.dto.js';
import { CreateSubtaskDto } from './dto/create-subtask.dto.js';
import { UpdateSubtaskDto } from './dto/update-subtask.dto.js';
import { UpdateSubtaskStatusDto } from './dto/update-subtask-status.dto.js';
import { ReorderSubtasksDto } from './dto/reorder-subtasks.dto.js';
import type { TaskWithTeamAndMembers } from './policies/task-policy.service.js';
import type { Task } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueryService: TaskQueryService,
    private readonly taskCrudService: TaskCrudService,
    private readonly taskTrashService: TaskTrashService,
    private readonly taskWorkflowService: TaskWorkflowService,
    private readonly taskReorderService: TaskReorderService,
    private readonly taskStatsService: TaskStatsService,
    private readonly taskCollaboratorService: TaskCollaboratorService,
    private readonly subtaskService: SubtaskService,
    private readonly realtimeService: RealtimeService,
  ) {}

  findAll(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    return this.taskQueryService.findAll(query, userId);
  }

  findTrash(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    return this.taskTrashService.findTrash(query, userId);
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

    const result = await this.prisma.$transaction(async (tx) => {
      let updated: Task | undefined;

      // Bước 1: Nếu có thay đổi nhóm hoặc phân công, thực hiện moveTeam trước
      // Điều này đảm bảo task đã thuộc phạm vi Team mới (hoặc không gian cá nhân mới)
      // trước khi validate danh mục (categoryId) và nội dung ở bước tiếp theo.
      if (hasTeam) {
        updated = await this.taskWorkflowService.moveTeam(
          id,
          {
            teamId: data.teamId,
            assigneeId: data.assigneeId,
            title: data.title,
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

      // Bước 2: Cập nhật trạng thái mở lại nếu chuyển từ DONE sang TODO/IN_PROGRESS
      // Điều này đảm bảo công việc được mở khóa trước khi cập nhật nội dung
      const isReopening = hasStatus && data.status !== undefined && data.status !== 'DONE';
      if (isReopening) {
        updated = await this.taskWorkflowService.updateStatus(
          id,
          { status: data.status! },
          userId,
          tx,
        );
      }

      // Bước 3: Cập nhật nội dung (tiêu đề, mô tả, ưu tiên, ngày tháng, và categoryId)
      // CategoryId ở đây sẽ được kiểm tra tính hợp lệ đối với Team đích (đã cập nhật ở Bước 1).
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

      // Bước 4: Cập nhật trạng thái hoàn thành DONE (nếu có yêu cầu chuyển sang DONE)
      if (hasStatus && data.status !== undefined && !isReopening) {
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

    void this.realtimeService.emit({
      type: 'TASK_UPDATED',
      actorId: userId,
      teamId: result.teamId,
      targetUserIds: result.teamId
        ? undefined
        : [result.userId, ...(result.assigneeId ? [result.assigneeId] : [])],
      payload: {
        taskId: result.id,
        teamId: result.teamId,
        status: result.status,
      },
    });

    return result;
  }

  updateContent(id: number, data: UpdateTaskContentDto, userId: number): Promise<Task> {
    return this.taskCrudService.updateContent(id, data, userId);
  }

  remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    return this.taskTrashService.remove(id, userId);
  }

  restore(id: number, userId: number): Promise<Task> {
    return this.taskTrashService.restore(id, userId);
  }

  permanentDelete(id: number, userId: number): Promise<{ success: boolean; message: string }> {
    return this.taskTrashService.permanentDelete(id, userId);
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

  // Collaborators
  getCollaborators(taskId: number, userId: number) {
    return this.taskCollaboratorService.getCollaborators(taskId, userId);
  }

  inviteCollaborator(taskId: number, dto: InviteCollaboratorDto, userId: number) {
    return this.taskCollaboratorService.invite(taskId, dto, userId);
  }

  respondCollaborator(taskId: number, dto: RespondCollaboratorDto, userId: number) {
    return this.taskCollaboratorService.respond(taskId, dto, userId);
  }

  removeCollaborator(taskId: number, targetUserId: number, userId: number) {
    return this.taskCollaboratorService.remove(taskId, targetUserId, userId);
  }

  // Subtasks
  getSubtasks(taskId: number, userId: number) {
    return this.subtaskService.getSubtasks(taskId, userId);
  }

  createSubtask(taskId: number, dto: CreateSubtaskDto, userId: number) {
    return this.subtaskService.create(taskId, dto, userId);
  }

  updateSubtask(taskId: number, subtaskId: number, dto: UpdateSubtaskDto, userId: number) {
    return this.subtaskService.update(taskId, subtaskId, dto, userId);
  }

  updateSubtaskStatus(taskId: number, subtaskId: number, dto: UpdateSubtaskStatusDto, userId: number) {
    return this.subtaskService.updateStatus(taskId, subtaskId, dto, userId);
  }

  removeSubtask(taskId: number, subtaskId: number, userId: number) {
    return this.subtaskService.remove(taskId, subtaskId, userId);
  }

  reorderSubtasks(taskId: number, dto: ReorderSubtasksDto, userId: number) {
    return this.subtaskService.reorder(taskId, dto, userId);
  }
}
