import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import { ReorderTasksDto } from '../dto/reorder-tasks.dto.js';
import { TaskPolicyService, type TaskWithTeamAndMembers } from '../policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../policies/task-workflow-policy.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { Prisma, TaskStatus } from '@prisma/client';

export interface BoardLockScope {
  teamId?: number | null;
  userId?: number;
}

@Injectable()
export class TaskReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
    private readonly realtimeService: RealtimeService,
  ) {}

  private resolveLockKey(scope: BoardLockScope): { namespace: number; key: number } {
    if (scope.teamId !== null && scope.teamId !== undefined) {
      return { namespace: 1001, key: scope.teamId };
    }
    return { namespace: 1002, key: scope.userId ?? 0 };
  }

  async lockScope(tx: Prisma.TransactionClient, scope: BoardLockScope): Promise<void> {
    const { namespace, key } = this.resolveLockKey(scope);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${namespace} AS integer), CAST(${key} AS integer))`;
  }

  async lockScopes(tx: Prisma.TransactionClient, scopes: BoardLockScope[]): Promise<void> {
    const uniqueKeys = new Map<string, { namespace: number; key: number }>();
    for (const s of scopes) {
      const resolved = this.resolveLockKey(s);
      uniqueKeys.set(`${resolved.namespace}:${resolved.key}`, resolved);
    }

    const sorted = Array.from(uniqueKeys.values()).sort((a, b) =>
      a.namespace !== b.namespace ? a.namespace - b.namespace : a.key - b.key,
    );

    for (const item of sorted) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(CAST(${item.namespace} AS integer), CAST(${item.key} AS integer))`;
    }
  }

  async reindexColumn(
    tx: Prisma.TransactionClient,
    scopeWhere: Prisma.TaskWhereInput,
    status: TaskStatus,
    excludeIds: number[] = [],
  ): Promise<void> {
    const remainingTasks = await tx.task.findMany({
      where: {
        ...scopeWhere,
        status,
        deletedAt: null,
        ...(excludeIds.length > 0 ? { NOT: { id: { in: excludeIds } } } : {}),
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    for (let i = 0; i < remainingTasks.length; i++) {
      if (remainingTasks[i].position !== i) {
        await tx.task.update({
          where: { id: remainingTasks[i].id },
          data: { position: i },
        });
      }
    }
  }

  async getNextPosition(
    tx: Prisma.TransactionClient,
    scopeWhere: Prisma.TaskWhereInput,
    status: TaskStatus,
    excludeIds: number[] = [],
  ): Promise<number> {
    return tx.task.count({
      where: {
        ...scopeWhere,
        status,
        deletedAt: null,
        ...(excludeIds.length > 0 ? { NOT: { id: { in: excludeIds } } } : {}),
      },
    });
  }

  async reorder(dto: ReorderTasksDto, userId: number): Promise<{ success: boolean; message: string }> {
    if (!dto.taskIds || dto.taskIds.length === 0) {
      throw new BadRequestException('Danh sách ID công việc không được để trống');
    }

    const uniqueIdSet = new Set(dto.taskIds);
    if (uniqueIdSet.size !== dto.taskIds.length) {
      throw new BadRequestException('Danh sách ID công việc có phần tử trùng lặp');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockScope(tx, { teamId: dto.teamId ?? null, userId });

      if (dto.teamId) {
        const team = await tx.team.findUnique({
          where: { id: dto.teamId },
          include: { members: true },
        });
        if (!this.policy.isTeamMember(userId, team)) {
          throw new NotFoundException('Không tìm thấy nhóm');
        }
      }

      const scopeWhere: Prisma.TaskWhereInput = dto.teamId
        ? { teamId: dto.teamId }
        : { userId, teamId: null };

      const tasksToUpdate = await tx.task.findMany({
        where: {
          id: { in: dto.taskIds },
          ...scopeWhere,
          deletedAt: null,
        },
        include: {
          team: {
            include: {
              members: true,
            },
          },
        },
      });

      if (tasksToUpdate.length !== dto.taskIds.length) {
        if (dto.teamId) {
          throw new BadRequestException('Một hoặc nhiều công việc trong danh sách không thuộc nhóm này');
        }
        throw new NotFoundException('Một hoặc nhiều công việc trong danh sách không tồn tại hoặc không thuộc quyền quản lý của bạn');
      }

      if (dto.status) {
        const targetStatus = dto.status;

        for (const t of tasksToUpdate) {
          const taskWithTeam = t as TaskWithTeamAndMembers;
          if (!this.policy.canReorder(userId, taskWithTeam)) {
            throw new ForbiddenException(`Bạn không có quyền sắp xếp công việc "${t.title}"`);
          }
          if (
            t.status !== targetStatus &&
            !this.workflowPolicy.canTransition(userId, taskWithTeam, targetStatus)
          ) {
            throw new ForbiddenException(`Bạn không có quyền chuyển trạng thái công việc "${t.title}" sang ${targetStatus}`);
          }
        }

        const oldColumns = new Set<TaskStatus>();
        for (const t of tasksToUpdate) {
          if (t.status !== targetStatus) {
            oldColumns.add(t.status);
          }
        }

        for (const oldCol of oldColumns) {
          await this.reindexColumn(tx, scopeWhere, oldCol, dto.taskIds);
        }

        const unmentionedInTarget = await tx.task.findMany({
          where: {
            ...scopeWhere,
            status: targetStatus,
            deletedAt: null,
            NOT: { id: { in: dto.taskIds } },
          },
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        for (let i = 0; i < dto.taskIds.length; i++) {
          await tx.task.update({
            where: { id: dto.taskIds[i] },
            data: {
              position: i,
              status: targetStatus,
            },
          });
        }

        for (let idx = 0; idx < unmentionedInTarget.length; idx++) {
          await tx.task.update({
            where: { id: unmentionedInTarget[idx].id },
            data: { position: dto.taskIds.length + idx },
          });
        }
      } else {
        const firstStatus = tasksToUpdate[0].status;
        const allSameStatus = tasksToUpdate.every((t) => t.status === firstStatus);
        if (!allSameStatus) {
          throw new BadRequestException('Tất cả công việc sắp xếp phải thuộc cùng một trạng thái');
        }

        for (const t of tasksToUpdate) {
          if (!this.policy.canReorder(userId, t as TaskWithTeamAndMembers)) {
            throw new ForbiddenException(`Bạn không có quyền sắp xếp công việc "${t.title}"`);
          }
        }

        const unmentionedInSameCol = await tx.task.findMany({
          where: {
            ...scopeWhere,
            status: firstStatus,
            deletedAt: null,
            NOT: { id: { in: dto.taskIds } },
          },
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        for (let i = 0; i < dto.taskIds.length; i++) {
          await tx.task.update({
            where: { id: dto.taskIds[i] },
            data: { position: i },
          });
        }

        for (let idx = 0; idx < unmentionedInSameCol.length; idx++) {
          const targetPos = dto.taskIds.length + idx;
          if (unmentionedInSameCol[idx].position !== targetPos) {
            await tx.task.update({
              where: { id: unmentionedInSameCol[idx].id },
              data: { position: targetPos },
            });
          }
        }
      }
    });

    void this.realtimeService.emit({
      type: 'TASK_REORDERED',
      actorId: userId,
      teamId: dto.teamId,
      targetUserIds: dto.teamId ? undefined : [userId],
      payload: {
        teamId: dto.teamId,
        status: dto.status,
        taskIds: dto.taskIds,
      },
    });

    return {
      success: true,
      message: 'Cập nhật thứ tự công việc vào database thành công',
    };
  }
}
