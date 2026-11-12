import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { FilterTasksDto } from '../dto/filter-tasks.dto.js';
import { TaskPolicyService } from '../policies/task-policy.service.js';
import { TaskQueryService } from './task-query.service.js';
import { TaskReorderService } from './task-reorder.service.js';
import { NotificationEventService } from '../../notifications/services/notification-event.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { TeamActivityService } from '../../team-activity/team-activity.service.js';
import { type Task, Prisma, TeamActivityAction } from '@prisma/client';
import { runSequentialTaskBatch, type BulkTaskResult } from './task-batch.utils.js';

@Injectable()
export class TaskTrashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly queryService: TaskQueryService,
    private readonly reorderService: TaskReorderService,
    private readonly notificationEventService: NotificationEventService,
    private readonly realtimeService: RealtimeService,
    private readonly teamActivityService: TeamActivityService,
  ) {}

  async findTrash(query: FilterTasksDto | undefined, userId: number): Promise<Task[]> {
    return this.queryService.findTrash(query, userId);
  }

  async remove(id: number, userId: number): Promise<{ success: boolean; message: string; deletedTask: Task }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx);
      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });
      const taskToDelete = await this.queryService.findOne(id, userId, tx);

      if (!this.policy.canDeleteTask(userId, taskToDelete)) {
        throw new ForbiddenException('Bạn không có quyền xóa công việc này');
      }

      await this.notificationEventService.publish(
        {
          type: 'TASK_DELETED',
          actorId: userId,
          taskId: taskToDelete.id,
          taskTitle: taskToDelete.title,
          teamId: taskToDelete.teamId,
          assigneeId: taskToDelete.assigneeId,
          creatorId: taskToDelete.userId,
        },
        tx,
      );

      const remainingTasksScope: Prisma.TaskWhereInput = taskToDelete.teamId
        ? { teamId: taskToDelete.teamId, deletedAt: null }
        : { userId: taskToDelete.userId, teamId: null, deletedAt: null };

      const deletedTask = await tx.task.update({
        where: { id },
        data: { deletedAt: new Date(), deletedById: userId },
      });

      await tx.subtask.updateMany({
        where: { taskId: id, deletedAt: null },
        data: { deletedAt: new Date(), deletedWithTask: true },
      });

      await this.reorderService.reindexColumn(tx, remainingTasksScope, taskToDelete.status, [id]);

      if (taskToDelete.teamId) {
        await this.teamActivityService.logActivity(tx, {
          teamId: taskToDelete.teamId,
          actorId: userId,
          action: TeamActivityAction.TASK_DELETED,
          metadata: { taskId: taskToDelete.id, taskTitle: taskToDelete.title },
        });
      }

      return {
        success: true,
        message: `Đã xoá thành công công việc #${id} - "${taskToDelete.title}"`,
        deletedTask,
      };
    });

    void this.realtimeService.emit({
      type: 'TASK_DELETED',
      actorId: userId,
      teamId: result.deletedTask.teamId,
      targetUserIds: result.deletedTask.teamId
        ? undefined
        : [result.deletedTask.userId, ...(result.deletedTask.assigneeId ? [result.deletedTask.assigneeId] : [])],
      payload: { taskId: id, teamId: result.deletedTask.teamId },
    });

    return result;
  }

  async restore(id: number, userId: number): Promise<Task> {
    const result = await this.prisma.$transaction(async (tx) => {
      const currentTask = await this.queryService.findOne(id, userId, tx, { includeDeleted: true });

      if (!currentTask.deletedAt) {
        throw new BadRequestException('Công việc này chưa bị xóa, không thể khôi phục');
      }

      if (!this.policy.canRestoreTask(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền khôi phục công việc này');
      }

      await this.reorderService.lockScope(tx, {
        teamId: currentTask.teamId,
        userId: currentTask.userId,
      });

      const duplicateScopeWhere: Prisma.TaskWhereInput = currentTask.teamId
        ? { teamId: currentTask.teamId, deletedAt: null }
        : { userId: currentTask.userId, teamId: null, deletedAt: null };

      const duplicateTask = await tx.task.findFirst({
        where: {
          ...duplicateScopeWhere,
          title: { equals: currentTask.title, mode: 'insensitive' },
          NOT: { id },
        },
      });

      if (duplicateTask) {
        throw new ConflictException(
          `Không thể khôi phục: Tiêu đề '${currentTask.title}' đang được sử dụng bởi một công việc khác`,
        );
      }

      let effectiveAssigneeId = currentTask.assigneeId;
      if (effectiveAssigneeId) {
        if (currentTask.teamId) {
          if (!this.policy.isTeamMember(effectiveAssigneeId, currentTask.team)) {
            effectiveAssigneeId = null;
          }
        } else if (effectiveAssigneeId !== currentTask.userId) {
          effectiveAssigneeId = null;
        }
      }

      let effectiveCategoryId = currentTask.categoryId;
      if (effectiveCategoryId) {
        const category = await tx.category.findFirst({
          where: currentTask.teamId
            ? { id: effectiveCategoryId, teamId: currentTask.teamId }
            : { id: effectiveCategoryId, userId: currentTask.userId, teamId: null },
        });
        if (!category) {
          effectiveCategoryId = null;
        }
      }

      const newPosition = await this.reorderService.getNextPosition(
        tx,
        duplicateScopeWhere,
        currentTask.status,
      );

      const restoredTask = await tx.task.update({
        where: { id },
        data: {
          deletedAt: null,
          deletedById: null,
          position: newPosition,
          assigneeId: effectiveAssigneeId,
          categoryId: effectiveCategoryId,
        },
        include: {
          category: true,
          assignee: { select: { id: true, name: true, email: true } },
          team: { select: { id: true, name: true } },
        },
      });

      await tx.subtask.updateMany({
        where: { taskId: id, deletedWithTask: true },
        data: { deletedAt: null, deletedWithTask: false },
      });

      if (restoredTask.teamId) {
        await this.teamActivityService.logActivity(tx, {
          teamId: restoredTask.teamId,
          actorId: userId,
          action: TeamActivityAction.TASK_RESTORED,
          metadata: { taskId: restoredTask.id, taskTitle: restoredTask.title },
        });
      }

      return restoredTask;
    });

    void this.realtimeService.emit({
      type: 'TASK_CREATED',
      actorId: userId,
      teamId: result.teamId,
      targetUserIds: result.teamId
        ? undefined
        : [result.userId, ...(result.assigneeId ? [result.assigneeId] : [])],
      payload: { taskId: result.id, teamId: result.teamId, status: result.status },
    });

    return result;
  }

  async permanentDelete(id: number, userId: number): Promise<{ success: boolean; message: string }> {
    const deletedSnapshot = await this.prisma.$transaction(async (tx) => {
      const initialTask = await this.queryService.findOne(id, userId, tx, { includeDeleted: true });
      await this.reorderService.lockScope(tx, {
        teamId: initialTask.teamId,
        userId: initialTask.userId,
      });
      const currentTask = await this.queryService.findOne(id, userId, tx, { includeDeleted: true });

      if (!currentTask.deletedAt) {
        throw new BadRequestException('Công việc phải được chuyển vào thùng rác trước khi xóa vĩnh viễn');
      }

      if (!this.policy.canRestoreTask(userId, currentTask)) {
        throw new ForbiddenException('Bạn không có quyền xóa vĩnh viễn công việc này');
      }

      if (currentTask.teamId) {
        await this.teamActivityService.logActivity(tx, {
          teamId: currentTask.teamId,
          actorId: userId,
          action: TeamActivityAction.TASK_DELETED,
          metadata: {
            taskId: currentTask.id,
            taskTitle: currentTask.title,
            permanent: true,
          },
        });
      }

      await tx.task.delete({ where: { id } });

      return {
        id: currentTask.id,
        title: currentTask.title,
        teamId: currentTask.teamId,
        userId: currentTask.userId,
        assigneeId: currentTask.assigneeId,
      };
    });

    void this.realtimeService.emit({
      type: 'TASK_DELETED',
      actorId: userId,
      teamId: deletedSnapshot.teamId,
      targetUserIds: deletedSnapshot.teamId
        ? undefined
        : [
            deletedSnapshot.userId,
            ...(deletedSnapshot.assigneeId ? [deletedSnapshot.assigneeId] : []),
          ],
      payload: {
        taskId: deletedSnapshot.id,
        teamId: deletedSnapshot.teamId,
        permanent: true,
      },
    });

    return {
      success: true,
      message: `Đã xóa vĩnh viễn công việc #${deletedSnapshot.id} - "${deletedSnapshot.title}"`,
    };
  }

  async bulkRemove(taskIds: number[], userId: number): Promise<BulkTaskResult> {
    return runSequentialTaskBatch(taskIds, (id) => this.remove(id, userId));
  }

  async bulkRestore(taskIds: number[], userId: number): Promise<BulkTaskResult> {
    return runSequentialTaskBatch(taskIds, (id) => this.restore(id, userId));
  }

  async bulkPermanentDelete(taskIds: number[], userId: number): Promise<BulkTaskResult> {
    return runSequentialTaskBatch(taskIds, (id) => this.permanentDelete(id, userId));
  }

  async emptyTrash(userId: number, teamId?: number): Promise<BulkTaskResult> {
    if (teamId !== undefined) {
      await this.queryService.buildTeamAccessWhere(userId, teamId);
    }

    const manageableTeamWhere: Prisma.TeamWhereInput = {
      OR: [
        { ownerId: userId },
        { members: { some: { userId, role: 'ADMIN' } } },
      ],
    };

    const trashTasks = await this.prisma.task.findMany({
      where: {
        deletedAt: { not: null },
        ...(teamId !== undefined
          ? { teamId, team: manageableTeamWhere }
          : {
              OR: [
                { teamId: null, userId },
                { team: manageableTeamWhere },
              ],
            }),
      },
      select: { id: true },
      orderBy: [{ deletedAt: 'desc' }, { id: 'asc' }],
    });

    return runSequentialTaskBatch(
      trashTasks.map((t) => t.id),
      (id) => this.permanentDelete(id, userId),
    );
  }
}
