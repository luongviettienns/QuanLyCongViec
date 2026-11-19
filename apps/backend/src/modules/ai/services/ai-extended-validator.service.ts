import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AiActionType,
  CollaboratorStatus,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { TaskPolicyService } from '../../tasks/policies/task-policy.service.js';
import { TaskQueryService } from '../../tasks/services/task-query.service.js';
import {
  fail,
  parseOptionalPositiveInt,
  parseRequiredPositiveInt,
  resolveTeamOrDbUserRef,
  TASK_STATUS_LABELS,
  VALID_TASK_STATUSES,
  type AiUpdateTaskChange,
  type LoadedTask,
  type ValidatedProposalResult,
  type ValidationFailure,
} from './ai-validator.types.js';

type SubtaskRecord = {
  id: number;
  taskId: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeId: number | null;
  assignee?: { id: number; name: string } | null;
};

/** Validates and previews delete, restore, return, and subtask AI action proposals. */
@Injectable()
export class AiExtendedValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueryService: TaskQueryService,
    private readonly policy: TaskPolicyService,
  ) {}

  /** Validates a soft-delete task proposal against TaskTrashService and TaskPolicyService rules. */
  async validateDeleteTaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const taskCheck = await this.findTaskOrFail(taskId, userId);
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    if (!this.policy.canDeleteTask(userId, task)) {
      return fail('FORBIDDEN', 'Bạn không có quyền xóa công việc này');
    }

    const subtaskCount = await this.prisma.subtask.count({
      where: { taskId, deletedAt: null },
    });

    return {
      ok: true,
      actionType: AiActionType.DELETE_TASK,
      payload: { taskId },
      preview: {
        kind: 'DELETE_TASK',
        taskId,
        taskTitle: task.title,
        teamName: task.team?.name ?? null,
        subtaskCount,
      },
    };
  }

  /** Validates a task restoration proposal from trash, including title conflict checks. */
  async validateRestoreTaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const taskCheck = await this.findTaskOrFail(taskId, userId, { includeDeleted: true });
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    if (!task.deletedAt) {
      return fail('BAD_REQUEST', 'Công việc này chưa bị xóa, không thể khôi phục');
    }

    if (!this.policy.canRestoreTask(userId, task)) {
      return fail('FORBIDDEN', 'Bạn không có quyền khôi phục công việc này');
    }

    const duplicateScopeWhere: Prisma.TaskWhereInput = task.teamId
      ? { teamId: task.teamId, deletedAt: null }
      : { userId: task.userId, teamId: null, deletedAt: null };

    const duplicate = await this.prisma.task.findFirst({
      where: {
        ...duplicateScopeWhere,
        title: { equals: task.title, mode: 'insensitive' },
        NOT: { id: taskId },
      },
    });

    if (duplicate) {
      return fail(
        'CONFLICT',
        `Không thể khôi phục: Tiêu đề '${task.title}' đang được sử dụng bởi một công việc khác`,
      );
    }

    return {
      ok: true,
      actionType: AiActionType.RESTORE_TASK,
      payload: { taskId },
      preview: {
        kind: 'RESTORE_TASK',
        taskId,
        taskTitle: task.title,
        teamName: task.team?.name ?? null,
      },
    };
  }

  /** Validates returning a team task from its current assignee back to the creator. */
  async validateReturnTaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const reasonCheck = this.parseReturnReason(rawArgs.reason);
    if (!reasonCheck.ok) return reasonCheck;
    const reason = reasonCheck.value;

    const taskCheck = await this.findTaskOrFail(taskId, userId);
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    if (task.teamId === null) {
      return fail('BAD_REQUEST', 'Công việc cá nhân không thể thực hiện thao tác trả về');
    }

    if (task.status === TaskStatus.DONE) {
      return fail('BAD_REQUEST', 'Không thể trả lại công việc đã hoàn thành');
    }

    if (!this.policy.canReturnTask(userId, task)) {
      return fail('FORBIDDEN', 'Chỉ người đang được phân công mới có quyền trả lại công việc');
    }

    return {
      ok: true,
      actionType: AiActionType.RETURN_TASK,
      payload: { taskId, reason },
      preview: {
        kind: 'RETURN_TASK',
        taskId,
        taskTitle: task.title,
        teamName: task.team?.name ?? '',
        reason,
      },
    };
  }

  /** Validates creating a subtask on an active task and resolving eligible assignee metadata. */
  async validateCreateSubtaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const titleCheck = this.parseSubtaskTitle(rawArgs.title);
    if (!titleCheck.ok) return titleCheck;
    const title = titleCheck.value;

    let description: string | null | undefined;
    if (rawArgs.description !== undefined) {
      const descCheck = this.parseSubtaskDescription(rawArgs.description);
      if (!descCheck.ok) return descCheck;
      description = descCheck.value;
    }

    let assigneeId: number | null | undefined;
    if (rawArgs.assigneeId !== undefined) {
      const assigneeCheck = parseOptionalPositiveInt(
        rawArgs.assigneeId,
        'Mã người thực hiện (assigneeId)',
      );
      if (!assigneeCheck.ok) return assigneeCheck;
      assigneeId = assigneeCheck.value;
    }

    const taskCheck = await this.findTaskOrFail(taskId, userId);
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    if (!this.policy.canCreateSubtask(userId, task)) {
      return fail('FORBIDDEN', 'Bạn không có quyền tạo công việc con cho công việc này');
    }

    if (task.status === TaskStatus.DONE) {
      return fail(
        'BAD_REQUEST',
        'Không thể thêm công việc con vào công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      );
    }

    let assigneePreview: { id: number; name: string } | null = null;
    if (assigneeId !== undefined && assigneeId !== null) {
      const assigneeErr = await this.assertValidSubtaskAssignee(task, assigneeId);
      if (assigneeErr) return assigneeErr;
      assigneePreview = await this.resolveSubtaskUserRef(task, assigneeId);
    }

    const payload: Record<string, unknown> = {
      taskId,
      title,
      ...(description !== undefined ? { description } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
    };

    return {
      ok: true,
      actionType: AiActionType.CREATE_SUBTASK,
      payload,
      preview: {
        kind: 'CREATE_SUBTASK',
        taskId,
        taskTitle: task.title,
        title,
        description: description ?? null,
        assignee: assigneePreview,
      },
    };
  }

  /** Validates updating a subtask, enforcing manager vs collaborator status rules and parent locks. */
  async validateUpdateSubtaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const subtaskIdCheck = parseRequiredPositiveInt(rawArgs.subtaskId, 'Mã công việc con (ID)');
    if (!subtaskIdCheck.ok) return subtaskIdCheck;
    const subtaskId = subtaskIdCheck.value;

    const parsed = this.parseUpdateSubtaskInputs(rawArgs);
    if (!parsed.ok) return parsed;
    const inputs = parsed.value;

    const taskCheck = await this.findTaskOrFail(taskId, userId);
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    const subtask = (await this.prisma.subtask.findFirst({
      where: { id: subtaskId, taskId, deletedAt: null },
      include: { assignee: { select: { id: true, name: true } } },
    })) as SubtaskRecord | null;

    if (!subtask) {
      return fail('NOT_FOUND', 'Không tìm thấy công việc con');
    }

    const isModifyingContent = inputs.hasTitle || inputs.hasDescription || inputs.hasAssignee;
    const canManage = this.policy.canManageSubtask(userId, task);

    if (isModifyingContent && task.status === TaskStatus.DONE) {
      return fail(
        'BAD_REQUEST',
        'Không thể chỉnh sửa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      );
    }

    if (isModifyingContent && !canManage) {
      return fail(
        'FORBIDDEN',
        'Bạn không có quyền chỉnh sửa nội dung hoặc người thực hiện của công việc con',
      );
    }

    if (inputs.hasStatus && inputs.status !== undefined) {
      const statusErr = await this.validateSubtaskStatusTransition(
        userId,
        task,
        subtask,
        inputs.status,
        canManage,
      );
      if (statusErr) return statusErr;
    }

    if (inputs.hasAssignee && inputs.assigneeId !== null) {
      const assigneeErr = await this.assertValidSubtaskAssignee(task, inputs.assigneeId);
      if (assigneeErr) return assigneeErr;
    }

    const payload: Record<string, unknown> = {
      taskId,
      subtaskId,
      ...(inputs.hasTitle && inputs.title !== undefined ? { title: inputs.title } : {}),
      ...(inputs.hasDescription ? { description: inputs.description } : {}),
      ...(inputs.hasAssignee ? { assigneeId: inputs.assigneeId } : {}),
      ...(inputs.hasStatus && inputs.status !== undefined ? { status: inputs.status } : {}),
    };

    const changes = await this.buildUpdateSubtaskChanges(task, subtask, inputs);

    return {
      ok: true,
      actionType: AiActionType.UPDATE_SUBTASK,
      payload,
      preview: {
        kind: 'UPDATE_SUBTASK',
        taskId,
        taskTitle: task.title,
        subtaskId,
        subtaskTitle: subtask.title,
        changes,
      },
    };
  }

  /** Validates soft-deleting a subtask against parent DONE lock and manager permissions. */
  async validateDeleteSubtaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult> {
    const taskIdCheck = parseRequiredPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    const taskId = taskIdCheck.value;

    const subtaskIdCheck = parseRequiredPositiveInt(rawArgs.subtaskId, 'Mã công việc con (ID)');
    if (!subtaskIdCheck.ok) return subtaskIdCheck;
    const subtaskId = subtaskIdCheck.value;

    const taskCheck = await this.findTaskOrFail(taskId, userId);
    if (!taskCheck.ok) return taskCheck;
    const task = taskCheck.task;

    if (task.status === TaskStatus.DONE) {
      return fail(
        'BAD_REQUEST',
        'Không thể xóa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      );
    }

    if (!this.policy.canManageSubtask(userId, task)) {
      return fail('FORBIDDEN', 'Bạn không có quyền xóa công việc con này');
    }

    const subtask = await this.prisma.subtask.findFirst({
      where: { id: subtaskId, taskId, deletedAt: null },
    });

    if (!subtask) {
      return fail('NOT_FOUND', 'Không tìm thấy công việc con');
    }

    return {
      ok: true,
      actionType: AiActionType.DELETE_SUBTASK,
      payload: { taskId, subtaskId },
      preview: {
        kind: 'DELETE_SUBTASK',
        taskId,
        taskTitle: task.title,
        subtaskId,
        subtaskTitle: subtask.title,
      },
    };
  }

  private async findTaskOrFail(
    taskId: number,
    userId: number,
    options?: { includeDeleted?: boolean },
  ): Promise<{ ok: true; task: LoadedTask } | ValidationFailure> {
    try {
      const task = (await this.taskQueryService.findOne(
        taskId,
        userId,
        undefined,
        options,
      )) as LoadedTask;
      return { ok: true, task };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return fail('NOT_FOUND', error.message || 'Không tìm thấy công việc');
      }
      if (error instanceof BadRequestException) {
        return fail('BAD_REQUEST', error.message);
      }
      throw error;
    }
  }

  private parseReturnReason(
    rawReason: unknown,
  ): { ok: true; value: string } | ValidationFailure {
    if (typeof rawReason !== 'string') {
      return fail('BAD_REQUEST', 'Vui lòng nhập lý do trả lại công việc');
    }
    const cleanReason = rawReason.trim();
    if (!cleanReason) {
      return fail('BAD_REQUEST', 'Vui lòng nhập lý do trả lại công việc');
    }
    if (cleanReason.length > 500) {
      return fail('BAD_REQUEST', 'Lý do trả lại không được vượt quá 500 ký tự');
    }
    return { ok: true, value: cleanReason };
  }

  private parseSubtaskTitle(
    rawTitle: unknown,
  ): { ok: true; value: string } | ValidationFailure {
    if (typeof rawTitle !== 'string') {
      return fail('BAD_REQUEST', 'Tiêu đề công việc con phải là chuỗi ký tự');
    }
    const cleanTitle = rawTitle.trim();
    if (cleanTitle.length === 0) {
      return fail('BAD_REQUEST', 'Tiêu đề công việc con không được để trống');
    }
    if (cleanTitle.length < 2) {
      return fail('BAD_REQUEST', 'Tiêu đề công việc con phải có ít nhất 2 ký tự');
    }
    if (cleanTitle.length > 255) {
      return fail('BAD_REQUEST', 'Tiêu đề công việc con không được vượt quá 255 ký tự');
    }
    return { ok: true, value: cleanTitle };
  }

  private parseSubtaskDescription(
    rawDescription: unknown,
  ): { ok: true; value: string | null } | ValidationFailure {
    if (rawDescription === null) {
      return { ok: true, value: null };
    }
    if (typeof rawDescription !== 'string') {
      return fail('BAD_REQUEST', 'Mô tả công việc con phải là chuỗi ký tự');
    }
    const trimmed = rawDescription.trim();
    if (trimmed.length > 1000) {
      return fail('BAD_REQUEST', 'Mô tả công việc con không được vượt quá 1000 ký tự');
    }
    return { ok: true, value: trimmed.length > 0 ? trimmed : null };
  }

  private parseUpdateSubtaskInputs(rawArgs: Record<string, unknown>):
    | {
        ok: true;
        value: {
          hasTitle: boolean;
          title?: string;
          hasDescription: boolean;
          description: string | null;
          hasAssignee: boolean;
          assigneeId: number | null;
          hasStatus: boolean;
          status?: TaskStatus;
        };
      }
    | ValidationFailure {
    const hasTitle = rawArgs.title !== undefined;
    const hasDescription = rawArgs.description !== undefined;
    const hasAssignee = rawArgs.assigneeId !== undefined;
    const hasStatus = rawArgs.status !== undefined;

    if (!hasTitle && !hasDescription && !hasAssignee && !hasStatus) {
      return fail('BAD_REQUEST', 'Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    let title: string | undefined;
    if (hasTitle) {
      const check = this.parseSubtaskTitle(rawArgs.title);
      if (!check.ok) return check;
      title = check.value;
    }

    let description: string | null = null;
    if (hasDescription) {
      const check = this.parseSubtaskDescription(rawArgs.description);
      if (!check.ok) return check;
      description = check.value;
    }

    let assigneeId: number | null = null;
    if (hasAssignee) {
      const check = parseOptionalPositiveInt(
        rawArgs.assigneeId,
        'Mã người thực hiện (assigneeId)',
      );
      if (!check.ok) return check;
      assigneeId = check.value;
    }

    let status: TaskStatus | undefined;
    if (hasStatus) {
      if (typeof rawArgs.status !== 'string' || !VALID_TASK_STATUSES.has(rawArgs.status)) {
        return fail('BAD_REQUEST', 'Trạng thái công việc con phải là TODO, IN_PROGRESS hoặc DONE');
      }
      status = rawArgs.status as TaskStatus;
    }

    return {
      ok: true,
      value: {
        hasTitle,
        title,
        hasDescription,
        description,
        hasAssignee,
        assigneeId,
        hasStatus,
        status,
      },
    };
  }

  private async validateSubtaskStatusTransition(
    userId: number,
    task: LoadedTask,
    subtask: SubtaskRecord,
    nextStatus: TaskStatus,
    canManage: boolean,
  ): Promise<ValidationFailure | null> {
    if (!canManage) {
      const isAssigned = subtask.assigneeId === userId;
      const acceptedCollab = isAssigned
        ? await this.prisma.taskCollaborator.findFirst({
            where: {
              taskId: task.id,
              userId,
              status: CollaboratorStatus.ACCEPTED,
            },
          })
        : null;

      if (!isAssigned || !acceptedCollab) {
        return fail('FORBIDDEN', 'Bạn không có quyền thay đổi trạng thái công việc con này');
      }

      if (subtask.status === TaskStatus.DONE) {
        return fail(
          'BAD_REQUEST',
          'Không thể thay đổi trạng thái công việc con đã hoàn thành. Hãy nhờ người quản lý mở lại nếu cần.',
        );
      }

      if (subtask.status === TaskStatus.TODO && nextStatus !== TaskStatus.IN_PROGRESS) {
        return fail(
          'BAD_REQUEST',
          'Người phối hợp chỉ có thể chuyển công việc con từ Cần làm sang Đang làm (TODO -> IN_PROGRESS)',
        );
      }

      if (subtask.status === TaskStatus.IN_PROGRESS && nextStatus !== TaskStatus.DONE) {
        return fail(
          'BAD_REQUEST',
          'Người phối hợp chỉ có thể chuyển công việc con từ Đang làm sang Hoàn thành (IN_PROGRESS -> DONE)',
        );
      }
    }

    if (subtask.status === TaskStatus.TODO && nextStatus === TaskStatus.DONE) {
      return fail(
        'BAD_REQUEST',
        'Không thể chuyển công việc con trực tiếp từ Cần làm sang Hoàn thành (TODO -> DONE). Phải chuyển sang Đang làm (TODO -> IN_PROGRESS) trước.',
      );
    }

    if (nextStatus !== TaskStatus.DONE && task.status === TaskStatus.DONE) {
      return fail(
        'BAD_REQUEST',
        'Không thể đổi công việc con thành chưa hoàn thành khi công việc chính đang ở trạng thái hoàn thành. Hãy mở lại công việc chính trước.',
      );
    }

    return null;
  }

  private async assertValidSubtaskAssignee(
    task: LoadedTask,
    targetUserId: number,
  ): Promise<ValidationFailure | null> {
    if (task.assigneeId === targetUserId) {
      return null;
    }

    const collab = await this.prisma.taskCollaborator.findFirst({
      where: {
        taskId: task.id,
        userId: targetUserId,
        status: CollaboratorStatus.ACCEPTED,
      },
    });

    if (!collab) {
      return fail(
        'BAD_REQUEST',
        'Người được giao công việc con phải là người phụ trách chính hoặc người phối hợp đã chấp nhận lời mời',
      );
    }

    if (task.team && !this.policy.isTeamMember(targetUserId, task.team)) {
      return fail('BAD_REQUEST', 'Người được giao không còn là thành viên của nhóm');
    }

    return null;
  }

  private async resolveSubtaskUserRef(
    task: LoadedTask,
    targetUserId: number,
  ): Promise<{ id: number; name: string }> {
    if (task.assignee && task.assignee.id === targetUserId) {
      return { id: task.assignee.id, name: task.assignee.name };
    }
    const collab = (task.collaborators as Array<{ userId: number; user?: { id: number; name: string } | null }> | undefined)
      ?.find((c) => c.userId === targetUserId);
    if (collab?.user) {
      return { id: collab.user.id, name: collab.user.name };
    }
    return resolveTeamOrDbUserRef(this.prisma, targetUserId, task.team ?? null);
  }

  private async buildUpdateSubtaskChanges(
    task: LoadedTask,
    subtask: SubtaskRecord,
    inputs: Extract<
      ReturnType<AiExtendedValidatorService['parseUpdateSubtaskInputs']>,
      { ok: true }
    >['value'],
  ): Promise<AiUpdateTaskChange[]> {
    const requested: AiUpdateTaskChange[] = [];

    if (inputs.hasTitle && inputs.title !== undefined) {
      requested.push({
        field: 'title',
        label: 'Tiêu đề',
        before: subtask.title,
        after: inputs.title,
      });
    }

    if (inputs.hasDescription) {
      requested.push({
        field: 'description',
        label: 'Mô tả',
        before: subtask.description ?? null,
        after: inputs.description,
      });
    }

    if (inputs.hasStatus && inputs.status !== undefined) {
      requested.push({
        field: 'status',
        label: 'Trạng thái',
        before: TASK_STATUS_LABELS[subtask.status] ?? subtask.status,
        after: TASK_STATUS_LABELS[inputs.status] ?? inputs.status,
      });
    }

    if (inputs.hasAssignee) {
      const beforeName = subtask.assignee
        ? subtask.assignee.name
        : subtask.assigneeId !== null
          ? (await this.resolveSubtaskUserRef(task, subtask.assigneeId)).name
          : null;
      const afterName =
        inputs.assigneeId !== null
          ? (await this.resolveSubtaskUserRef(task, inputs.assigneeId)).name
          : null;
      requested.push({
        field: 'assigneeId',
        label: 'Người thực hiện',
        before: beforeName,
        after: afterName,
      });
    }

    const diffOnly = requested.filter((c) => c.before !== c.after);
    return diffOnly.length > 0 ? diffOnly : requested;
  }
}
