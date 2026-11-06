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
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TaskReorderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
  ) {}

  async reorder(dto: ReorderTasksDto, userId: number): Promise<{ success: boolean; message: string }> {
    if (!dto.taskIds || dto.taskIds.length === 0) {
      throw new BadRequestException('Danh sách ID công việc không được để trống');
    }

    const uniqueIdSet = new Set(dto.taskIds);
    if (uniqueIdSet.size !== dto.taskIds.length) {
      throw new BadRequestException('Danh sách ID công việc có phần tử trùng lặp');
    }

    if (dto.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: dto.teamId },
        include: { members: true },
      });
      if (!this.policy.isTeamMember(userId, team)) {
        throw new NotFoundException('Không tìm thấy nhóm');
      }

      const tasksToUpdate = await this.prisma.task.findMany({
        where: {
          id: { in: dto.taskIds },
          teamId: dto.teamId,
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
        throw new BadRequestException('Một hoặc nhiều công việc trong danh sách không thuộc nhóm này');
      }

      if (dto.status) {
        const targetStatus = dto.status;

        for (const t of tasksToUpdate) {
          if (!this.policy.canReorder(userId, t as TaskWithTeamAndMembers, targetStatus)) {
            throw new ForbiddenException(`Bạn không có quyền chuyển trạng thái công việc "${t.title}" sang ${targetStatus}`);
          }
          if (t.status !== targetStatus) {
            if (!this.workflowPolicy.canTransition(userId, t as TaskWithTeamAndMembers, targetStatus)) {
              throw new ForbiddenException(`Bạn không có quyền chuyển trạng thái công việc "${t.title}" sang ${targetStatus}`);
            }
          }
        }

        const oldColumns = new Set<TaskStatus>();
        for (const t of tasksToUpdate) {
          if (t.status !== targetStatus) {
            oldColumns.add(t.status);
          }
        }

        const oldColReindexOps = [];
        for (const oldCol of oldColumns) {
          const remainingInOldCol = await this.prisma.task.findMany({
            where: {
              teamId: dto.teamId,
              status: oldCol,
              NOT: { id: { in: dto.taskIds } },
            },
            orderBy: [
              { position: 'asc' },
              { createdAt: 'desc' },
            ],
          });

          for (let i = 0; i < remainingInOldCol.length; i++) {
            oldColReindexOps.push(
              this.prisma.task.update({
                where: { id: remainingInOldCol[i].id },
                data: { position: i },
              }),
            );
          }
        }

        const unmentionedInTarget = await this.prisma.task.findMany({
          where: {
            teamId: dto.teamId,
            status: targetStatus,
            NOT: { id: { in: dto.taskIds } },
          },
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        const unmentionedOps = unmentionedInTarget.map((t, idx) =>
          this.prisma.task.update({
            where: { id: t.id },
            data: { position: dto.taskIds.length + idx },
          }),
        );

        const targetOps = dto.taskIds.map((taskId, newPosition) =>
          this.prisma.task.update({
            where: { id: taskId },
            data: {
              position: newPosition,
              status: targetStatus,
            },
          }),
        );

        await this.prisma.$transaction([
          ...oldColReindexOps,
          ...targetOps,
          ...unmentionedOps,
        ]);
      } else {
        const firstStatus = tasksToUpdate[0].status;
        const allSameStatus = tasksToUpdate.every((t) => t.status === firstStatus);
        if (!allSameStatus) {
          throw new BadRequestException('Tất cả công việc sắp xếp phải thuộc cùng một trạng thái');
        }

        for (const t of tasksToUpdate) {
          if (!this.policy.canReorder(userId, t as TaskWithTeamAndMembers, firstStatus)) {
            throw new ForbiddenException(`Bạn không có quyền sắp xếp công việc "${t.title}"`);
          }
        }

        const targetOps = dto.taskIds.map((taskId, newPosition) =>
          this.prisma.task.update({
            where: { id: taskId },
            data: { position: newPosition },
          }),
        );

        await this.prisma.$transaction(targetOps);
      }
    } else {
      const tasksToUpdate = await this.prisma.task.findMany({
        where: {
          id: { in: dto.taskIds },
          userId,
          teamId: null,
        },
      });

      if (tasksToUpdate.length !== dto.taskIds.length) {
        throw new NotFoundException('Một hoặc nhiều công việc trong danh sách không tồn tại hoặc không thuộc quyền quản lý của bạn');
      }

      if (dto.status) {
        const targetStatus = dto.status;

        const oldColumns = new Set<TaskStatus>();
        for (const t of tasksToUpdate) {
          if (t.status !== targetStatus) {
            oldColumns.add(t.status);
          }
        }

        const oldColReindexOps = [];
        for (const oldCol of oldColumns) {
          const remainingInOldCol = await this.prisma.task.findMany({
            where: {
              userId,
              teamId: null,
              status: oldCol,
              NOT: { id: { in: dto.taskIds } },
            },
            orderBy: [
              { position: 'asc' },
              { createdAt: 'desc' },
            ],
          });

          for (let i = 0; i < remainingInOldCol.length; i++) {
            oldColReindexOps.push(
              this.prisma.task.update({
                where: { id: remainingInOldCol[i].id },
                data: { position: i },
              }),
            );
          }
        }

        const unmentionedInTarget = await this.prisma.task.findMany({
          where: {
            userId,
            teamId: null,
            status: targetStatus,
            NOT: { id: { in: dto.taskIds } },
          },
          orderBy: [
            { position: 'asc' },
            { createdAt: 'desc' },
          ],
        });

        const unmentionedOps = unmentionedInTarget.map((t, idx) =>
          this.prisma.task.update({
            where: { id: t.id },
            data: { position: dto.taskIds.length + idx },
          }),
        );

        const targetOps = dto.taskIds.map((taskId, newPosition) =>
          this.prisma.task.update({
            where: { id: taskId },
            data: {
              position: newPosition,
              status: targetStatus,
            },
          }),
        );

        await this.prisma.$transaction([
          ...oldColReindexOps,
          ...targetOps,
          ...unmentionedOps,
        ]);
      } else {
        const firstStatus = tasksToUpdate[0].status;
        const allSameStatus = tasksToUpdate.every((t) => t.status === firstStatus);
        if (!allSameStatus) {
          throw new BadRequestException('Tất cả công việc sắp xếp phải thuộc cùng một trạng thái');
        }

        const targetOps = dto.taskIds.map((taskId, newPosition) =>
          this.prisma.task.update({
            where: { id: taskId },
            data: { position: newPosition },
          }),
        );

        await this.prisma.$transaction(targetOps);
      }
    }

    return {
      success: true,
      message: 'Cập nhật thứ tự công việc vào database thành công',
    };
  }
}
