import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { formatDateOnly } from '../../mcp/utils/mcp-serializers.js';
import { TaskPolicyService } from '../../tasks/policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../../tasks/policies/task-workflow-policy.service.js';
import { TaskQueryService } from '../../tasks/services/task-query.service.js';
import {
  assertDateRangeValid,
  parseDateOnly,
  validateScopedCategory,
} from '../../tasks/services/task-validation.utils.js';
import {
  fail,
  parseOptionalPositiveInt,
  resolveTeamOrDbUserRef,
  TASK_STATUS_LABELS as STATUS_LABELS,
  VALID_TASK_STATUSES as VALID_STATUSES,
  type AiCreateTaskPreview,
  type AiUpdateTaskChange,
  type AiUpdateTaskPreview,
  type LoadedTask,
  type TeamWithMembersAndOwner,
  type ValidatedProposalResult,
  type ValidationFailure,
} from './ai-validator.types.js';

export type {
  AiAddTeamMemberPreview,
  AiCreateSubtaskPreview,
  AiCreateTaskPreview,
  AiDeleteSubtaskPreview,
  AiDeleteTaskPreview,
  AiProposalErrorCode,
  AiProposalPreview,
  AiRemoveTeamMemberPreview,
  AiRestoreTaskPreview,
  AiReturnTaskPreview,
  AiUpdateSubtaskPreview,
  AiUpdateTaskChange,
  AiUpdateTaskPreview,
  AiUpdateTeamMemberRolePreview,
  ValidatedProposalResult,
} from './ai-validator.types.js';

const VALID_PRIORITIES = new Set<string>([
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
]);

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Thấp',
  [TaskPriority.MEDIUM]: 'Trung bình',
  [TaskPriority.HIGH]: 'Cao',
};

const UPDATABLE_FIELDS = [
  'title',
  'description',
  'priority',
  'startDate',
  'dueDate',
  'categoryId',
  'teamId',
  'assigneeId',
  'status',
] as const;

function parseOptionalDateInput(
  value: unknown,
  fieldLabel: string,
): { ok: true; value: Date | null } | ValidationFailure {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return fail('BAD_REQUEST', `${fieldLabel} phải là chuỗi ngày YYYY-MM-DD`);
  }
  try {
    return { ok: true, value: parseDateOnly(value) };
  } catch (error) {
    if (error instanceof BadRequestException) {
      return fail('BAD_REQUEST', error.message);
    }
    throw error;
  }
}

function validateTitleString(
  rawTitle: unknown,
  tooShortMessage: string,
): { ok: true; value: string } | ValidationFailure {
  if (typeof rawTitle !== 'string') {
    return fail('BAD_REQUEST', 'Tiêu đề công việc phải là chuỗi ký tự');
  }
  const cleanTitle = rawTitle.trim();
  if (cleanTitle.length < 3) {
    return fail('BAD_REQUEST', tooShortMessage);
  }
  if (cleanTitle.length > 100) {
    return fail('BAD_REQUEST', 'Tiêu đề không được vượt quá 100 ký tự');
  }
  return { ok: true, value: cleanTitle };
}

function parseOptionalDescription(
  rawDescription: unknown,
): { ok: true; value: string | null } | ValidationFailure {
  if (rawDescription === undefined || rawDescription === null) {
    return { ok: true, value: null };
  }
  if (typeof rawDescription !== 'string') {
    return fail('BAD_REQUEST', 'Mô tả phải là chuỗi ký tự');
  }
  const trimmed = rawDescription.trim();
  if (trimmed.length > 1000) {
    return fail('BAD_REQUEST', 'Mô tả không được vượt quá 1000 ký tự');
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

@Injectable()
export class AiTaskValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskQueryService: TaskQueryService,
    private readonly policy: TaskPolicyService,
    private readonly workflowPolicy: TaskWorkflowPolicy,
  ) {}

  async validateCreateTaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult<AiCreateTaskPreview, 'CREATE_TASK'>> {
    const titleCheck = validateTitleString(
      rawArgs.title,
      'Tiêu đề công việc phải có ít nhất 3 ký tự (không tính khoảng trắng thừa)',
    );
    if (!titleCheck.ok) return titleCheck;
    const cleanTitle = titleCheck.value;

    const descCheck = parseOptionalDescription(rawArgs.description);
    if (!descCheck.ok) return descCheck;
    const cleanDescription = descCheck.value;

    let status: TaskStatus = TaskStatus.TODO;
    if (rawArgs.status !== undefined && rawArgs.status !== null) {
      if (typeof rawArgs.status !== 'string' || !VALID_STATUSES.has(rawArgs.status)) {
        return fail('BAD_REQUEST', 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE');
      }
      status = rawArgs.status as TaskStatus;
    }

    let priority: TaskPriority = TaskPriority.MEDIUM;
    if (rawArgs.priority !== undefined && rawArgs.priority !== null) {
      if (typeof rawArgs.priority !== 'string' || !VALID_PRIORITIES.has(rawArgs.priority)) {
        return fail('BAD_REQUEST', 'Độ ưu tiên phải là LOW, MEDIUM hoặc HIGH');
      }
      priority = rawArgs.priority as TaskPriority;
    }

    const startDateCheck = parseOptionalDateInput(rawArgs.startDate, 'Ngày bắt đầu');
    if (!startDateCheck.ok) return startDateCheck;

    const dueDateCheck = parseOptionalDateInput(rawArgs.dueDate, 'Hạn chót');
    if (!dueDateCheck.ok) return dueDateCheck;

    const rangeError = this.validateDateRange(startDateCheck.value, dueDateCheck.value);
    if (rangeError) return rangeError;

    const teamIdCheck = parseOptionalPositiveInt(rawArgs.teamId, 'Mã nhóm');
    if (!teamIdCheck.ok) return teamIdCheck;
    const teamId = teamIdCheck.value;

    const categoryIdCheck = parseOptionalPositiveInt(rawArgs.categoryId, 'Mã danh mục');
    if (!categoryIdCheck.ok) return categoryIdCheck;
    const categoryId = categoryIdCheck.value;

    const assigneeIdCheck = parseOptionalPositiveInt(rawArgs.assigneeId, 'Mã người được phân công');
    if (!assigneeIdCheck.ok) return assigneeIdCheck;
    const assigneeId = assigneeIdCheck.value;

    const collabIdsCheck = this.parseCollaboratorIds(rawArgs.collaboratorIds);
    if (!collabIdsCheck.ok) return collabIdsCheck;
    const uniqueCollabIds = collabIdsCheck.value;

    let targetTeam: TeamWithMembersAndOwner | null = null;
    if (teamId !== null) {
      targetTeam = await this.fetchTeamWithMembers(teamId);
      if (!this.policy.isTeamMember(userId, targetTeam)) {
        return fail('NOT_FOUND', 'Không tìm thấy nhóm');
      }
    }

    const duplicateErr = await this.checkDuplicateTitle(
      cleanTitle,
      teamId !== null ? { teamId, deletedAt: null } : { userId, teamId: null, deletedAt: null },
      `Tiêu đề '${cleanTitle}' đã tồn tại, vui lòng đặt tên khác`,
    );
    if (duplicateErr) return duplicateErr;

    if (categoryId !== null) {
      const catErr = await this.validateCategory(categoryId, teamId, [userId]);
      if (catErr) return catErr;
    }

    if (teamId !== null && targetTeam) {
      if (assigneeId !== null && !this.policy.isTeamMember(assigneeId, targetTeam)) {
        return fail('BAD_REQUEST', 'Người được phân công không thuộc nhóm này');
      }
      for (const collabUserId of uniqueCollabIds) {
        if (collabUserId === userId) {
          return fail('BAD_REQUEST', 'Không thể tự mời chính mình làm người phối hợp');
        }
        if (assigneeId !== null && collabUserId === assigneeId) {
          return fail('BAD_REQUEST', 'Người này đang là người phụ trách chính của công việc');
        }
        if (!this.policy.isTeamMember(collabUserId, targetTeam)) {
          return fail('BAD_REQUEST', 'Người được mời không phải là thành viên trong nhóm');
        }
      }
    } else {
      if (assigneeId !== null && assigneeId !== userId) {
        return fail('BAD_REQUEST', 'Công việc cá nhân chỉ có thể phân công cho chính bạn');
      }
      if (uniqueCollabIds.length > 0) {
        return fail('BAD_REQUEST', 'Chỉ có thể mời người phối hợp cho công việc thuộc nhóm làm việc');
      }
    }

    const startDateStr = formatDateOnly(startDateCheck.value);
    const dueDateStr = formatDateOnly(dueDateCheck.value);

    const payload: Record<string, unknown> = {
      title: cleanTitle,
      status,
      priority,
    };
    if (cleanDescription !== null) payload.description = cleanDescription;
    if (startDateStr !== null) payload.startDate = startDateStr;
    if (dueDateStr !== null) payload.dueDate = dueDateStr;
    if (teamId !== null) payload.teamId = teamId;
    if (categoryId !== null) payload.categoryId = categoryId;
    if (assigneeId !== null) payload.assigneeId = assigneeId;
    if (uniqueCollabIds.length > 0) payload.collaboratorIds = uniqueCollabIds;

    const [assigneePreview, categoryPreview, collaboratorsPreview] = await Promise.all([
      assigneeId !== null ? this.resolveUserRef(assigneeId, targetTeam) : Promise.resolve(null),
      categoryId !== null ? this.resolveCategoryRef(categoryId) : Promise.resolve(null),
      Promise.all(uniqueCollabIds.map((id) => this.resolveUserRef(id, targetTeam))),
    ]);

    return {
      ok: true,
      actionType: 'CREATE_TASK',
      payload,
      preview: {
        kind: 'CREATE_TASK',
        title: cleanTitle,
        description: cleanDescription,
        status,
        priority,
        startDate: startDateStr,
        dueDate: dueDateStr,
        team: targetTeam ? { id: targetTeam.id, name: targetTeam.name } : null,
        assignee: assigneePreview,
        category: categoryPreview,
        collaborators: collaboratorsPreview,
      },
    };
  }

  async validateUpdateTaskProposal(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<ValidatedProposalResult<AiUpdateTaskPreview, 'UPDATE_TASK'>> {
    const taskIdCheck = parseOptionalPositiveInt(rawArgs.taskId, 'Mã công việc (ID)');
    if (!taskIdCheck.ok) return taskIdCheck;
    if (taskIdCheck.value === null) {
      return fail('BAD_REQUEST', 'Mã công việc (ID) phải là số nguyên dương hợp lệ');
    }
    const taskId = taskIdCheck.value;

    const hasAnyField = UPDATABLE_FIELDS.some((field) => rawArgs[field] !== undefined);
    if (!hasAnyField) {
      return fail('BAD_REQUEST', 'Vui lòng cung cấp ít nhất một thông tin cần cập nhật');
    }

    let currentTask: LoadedTask;
    try {
      currentTask = (await this.taskQueryService.findOne(taskId, userId)) as LoadedTask;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return fail('NOT_FOUND', error.message || 'Không tìm thấy công việc');
      }
      if (error instanceof BadRequestException) {
        return fail('BAD_REQUEST', error.message);
      }
      throw error;
    }

    const parsed = this.parseUpdateInputs(rawArgs);
    if (!parsed.ok) return parsed;
    const inputs = parsed.value;

    const hasContent =
      inputs.hasTitle ||
      inputs.hasDescription ||
      inputs.hasPriority ||
      inputs.hasStartDate ||
      inputs.hasDueDate ||
      inputs.hasCategory;

    const isReopening =
      inputs.hasStatus &&
      inputs.status !== TaskStatus.DONE &&
      currentTask.status === TaskStatus.DONE;

    if ((hasContent || inputs.hasTeam) && !this.policy.canEditContent(userId, currentTask)) {
      return fail('FORBIDDEN', 'Bạn không có quyền chỉnh sửa nội dung công việc này');
    }

    if (hasContent && currentTask.status === TaskStatus.DONE && !isReopening) {
      return fail(
        'BAD_REQUEST',
        'Không thể chỉnh sửa nội dung công việc đã hoàn thành. Vui lòng mở lại công việc trước khi chỉnh sửa.',
      );
    }

    if (inputs.hasAssignee && !this.policy.canChangeAssignee(userId, currentTask)) {
      return fail('FORBIDDEN', 'Bạn không có quyền phân công công việc này');
    }

    if (inputs.hasAssignee && currentTask.status === TaskStatus.DONE) {
      if (!inputs.hasTeam) {
        return fail(
          'BAD_REQUEST',
          'Không thể thay đổi người thực hiện khi công việc đã hoàn thành. Vui lòng mở lại công việc trước khi phân công lại.',
        );
      }
      if (inputs.assigneeId !== currentTask.assigneeId) {
        return fail(
          'BAD_REQUEST',
          'Không thể thay đổi người thực hiện khi công việc đã hoàn thành',
        );
      }
    }

    const effectiveTeamId = inputs.hasTeam ? inputs.teamId : currentTask.teamId;
    const isTeamChanged = effectiveTeamId !== currentTask.teamId;
    let effectiveAssigneeId = inputs.hasAssignee ? inputs.assigneeId : currentTask.assigneeId;

    let targetTeam: TeamWithMembersAndOwner | null = null;
    if (isTeamChanged) {
      const transferCheck = await this.validateTeamTransfer(
        userId,
        currentTask,
        effectiveTeamId,
        inputs.hasAssignee,
        effectiveAssigneeId,
        inputs.title ?? currentTask.title,
      );
      if (!transferCheck.ok) return transferCheck;
      targetTeam = transferCheck.targetTeam;
      effectiveAssigneeId = transferCheck.effectiveAssigneeId;
    } else {
      targetTeam = currentTask.team ?? null;
      if (inputs.hasAssignee && effectiveAssigneeId !== null) {
        if (currentTask.teamId !== null) {
          if (!this.policy.isTeamMember(effectiveAssigneeId, currentTask.team)) {
            return fail('BAD_REQUEST', 'Người được phân công không thuộc nhóm này');
          }
        } else if (effectiveAssigneeId !== currentTask.userId) {
          return fail('BAD_REQUEST', 'Công việc cá nhân chỉ có thể phân công cho chính bạn');
        }
      }
    }

    if (!isTeamChanged && inputs.hasTitle && inputs.title !== undefined) {
      const scopeWhere: Prisma.TaskWhereInput = effectiveTeamId
        ? { teamId: effectiveTeamId, deletedAt: null }
        : { userId: currentTask.userId, teamId: null, deletedAt: null };
      const duplicateErr = await this.checkDuplicateTitle(
        inputs.title,
        scopeWhere,
        `Tiêu đề '${inputs.title}' đã được sử dụng bởi một công việc khác`,
        taskId,
      );
      if (duplicateErr) return duplicateErr;
    }

    const effectiveStartDate = inputs.hasStartDate ? inputs.startDate : currentTask.startDate ?? null;
    const effectiveDueDate = inputs.hasDueDate ? inputs.dueDate : currentTask.dueDate ?? null;
    const rangeError = this.validateDateRange(effectiveStartDate, effectiveDueDate);
    if (rangeError) return rangeError;

    let categoryDisconnectedImplicitly = false;
    if (inputs.hasCategory && inputs.categoryId !== null) {
      const catErr = await this.validateCategory(
        inputs.categoryId,
        effectiveTeamId,
        [currentTask.userId, userId],
        isTeamChanged ? null : currentTask.categoryId,
      );
      if (catErr) return catErr;
    } else if (isTeamChanged && !inputs.hasCategory && currentTask.categoryId !== null) {
      const compatibleCategory = await this.prisma.category.findFirst({
        where:
          effectiveTeamId !== null
            ? { id: currentTask.categoryId, teamId: effectiveTeamId }
            : {
                id: currentTask.categoryId,
                userId: currentTask.userId,
                teamId: null,
              },
      });
      categoryDisconnectedImplicitly = !compatibleCategory;
    }

    if (inputs.hasStatus && inputs.status !== undefined) {
      const effectiveTaskForStatus: LoadedTask = {
        ...currentTask,
        teamId: effectiveTeamId,
        team: isTeamChanged ? targetTeam : currentTask.team,
        assigneeId: effectiveAssigneeId,
      };
      if (!this.workflowPolicy.canTransition(userId, effectiveTaskForStatus, inputs.status)) {
        return fail('FORBIDDEN', 'Bạn không có quyền thay đổi trạng thái công việc này');
      }
      if (inputs.status === TaskStatus.DONE && currentTask.status !== TaskStatus.DONE) {
        const unfinishedSubtasksCount = await this.prisma.subtask.count({
          where: {
            taskId,
            status: { not: TaskStatus.DONE },
            deletedAt: null,
          },
        });
        if (unfinishedSubtasksCount > 0) {
          return fail(
            'BAD_REQUEST',
            'Không thể chuyển công việc chính sang hoàn thành khi vẫn còn công việc con chưa hoàn thành',
          );
        }
      }
    }

    const payload = this.buildUpdatePayload(taskId, inputs);
    const changes = await this.buildUpdateChanges(
      currentTask,
      inputs,
      targetTeam,
      isTeamChanged,
      effectiveAssigneeId,
      categoryDisconnectedImplicitly,
    );

    return {
      ok: true,
      actionType: 'UPDATE_TASK',
      payload,
      preview: {
        kind: 'UPDATE_TASK',
        taskId,
        taskTitle: currentTask.title,
        changes,
      },
    };
  }

  private parseUpdateInputs(rawArgs: Record<string, unknown>):
    | {
        ok: true;
        value: {
          hasTitle: boolean;
          title?: string;
          hasDescription: boolean;
          description: string | null;
          hasPriority: boolean;
          priority?: TaskPriority;
          hasStatus: boolean;
          status?: TaskStatus;
          hasStartDate: boolean;
          startDate: Date | null;
          hasDueDate: boolean;
          dueDate: Date | null;
          hasCategory: boolean;
          categoryId: number | null;
          hasTeam: boolean;
          teamId: number | null;
          hasAssignee: boolean;
          assigneeId: number | null;
        };
      }
    | ValidationFailure {
    const hasTitle = rawArgs.title !== undefined;
    let title: string | undefined;
    if (hasTitle) {
      const check = validateTitleString(
        rawArgs.title,
        'Tiêu đề công việc mới phải có ít nhất 3 ký tự',
      );
      if (!check.ok) return check;
      title = check.value;
    }

    const hasDescription = rawArgs.description !== undefined;
    let description: string | null = null;
    if (hasDescription) {
      const check = parseOptionalDescription(rawArgs.description);
      if (!check.ok) return check;
      description = check.value;
    }

    const hasPriority = rawArgs.priority !== undefined;
    let priority: TaskPriority | undefined;
    if (hasPriority) {
      if (typeof rawArgs.priority !== 'string' || !VALID_PRIORITIES.has(rawArgs.priority)) {
        return fail('BAD_REQUEST', 'Độ ưu tiên phải là LOW, MEDIUM hoặc HIGH');
      }
      priority = rawArgs.priority as TaskPriority;
    }

    const hasStatus = rawArgs.status !== undefined;
    let status: TaskStatus | undefined;
    if (hasStatus) {
      if (typeof rawArgs.status !== 'string' || !VALID_STATUSES.has(rawArgs.status)) {
        return fail('BAD_REQUEST', 'Trạng thái phải là TODO, IN_PROGRESS hoặc DONE');
      }
      status = rawArgs.status as TaskStatus;
    }

    const hasStartDate = rawArgs.startDate !== undefined;
    let startDate: Date | null = null;
    if (hasStartDate) {
      const check = parseOptionalDateInput(rawArgs.startDate, 'Ngày bắt đầu');
      if (!check.ok) return check;
      startDate = check.value;
    }

    const hasDueDate = rawArgs.dueDate !== undefined;
    let dueDate: Date | null = null;
    if (hasDueDate) {
      const check = parseOptionalDateInput(rawArgs.dueDate, 'Hạn chót');
      if (!check.ok) return check;
      dueDate = check.value;
    }

    const hasCategory = rawArgs.categoryId !== undefined;
    let categoryId: number | null = null;
    if (hasCategory) {
      const check = parseOptionalPositiveInt(rawArgs.categoryId, 'Mã danh mục');
      if (!check.ok) return check;
      categoryId = check.value;
    }

    const hasTeam = rawArgs.teamId !== undefined;
    let teamId: number | null = null;
    if (hasTeam) {
      const check = parseOptionalPositiveInt(rawArgs.teamId, 'Mã nhóm');
      if (!check.ok) return check;
      teamId = check.value;
    }

    const hasAssignee = rawArgs.assigneeId !== undefined;
    let assigneeId: number | null = null;
    if (hasAssignee) {
      const check = parseOptionalPositiveInt(rawArgs.assigneeId, 'Mã người được phân công');
      if (!check.ok) return check;
      assigneeId = check.value;
    }

    return {
      ok: true,
      value: {
        hasTitle,
        title,
        hasDescription,
        description,
        hasPriority,
        priority,
        hasStatus,
        status,
        hasStartDate,
        startDate,
        hasDueDate,
        dueDate,
        hasCategory,
        categoryId,
        hasTeam,
        teamId,
        hasAssignee,
        assigneeId,
      },
    };
  }

  private async validateTeamTransfer(
    userId: number,
    currentTask: LoadedTask,
    effectiveTeamId: number | null,
    hasAssignee: boolean,
    initialEffectiveAssigneeId: number | null,
    effectiveTitle: string,
  ): Promise<
    | { ok: true; targetTeam: TeamWithMembersAndOwner | null; effectiveAssigneeId: number | null }
    | ValidationFailure
  > {
    let effectiveAssigneeId = initialEffectiveAssigneeId;

    if (effectiveTeamId !== null) {
      const targetTeam = await this.fetchTeamWithMembers(effectiveTeamId);
      if (!targetTeam || !this.policy.isTeamMember(userId, targetTeam)) {
        return fail('NOT_FOUND', 'Không tìm thấy nhóm');
      }

      const duplicateErr = await this.checkDuplicateTitle(
        effectiveTitle,
        { teamId: effectiveTeamId, deletedAt: null },
        `Tiêu đề '${effectiveTitle}' đã được sử dụng bởi một công việc khác`,
        currentTask.id,
      );
      if (duplicateErr) return duplicateErr;

      if (hasAssignee) {
        if (effectiveAssigneeId !== null && !this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
          return fail('BAD_REQUEST', 'Người được phân công không thuộc nhóm này');
        }
      } else if (effectiveAssigneeId !== null && !this.policy.isTeamMember(effectiveAssigneeId, targetTeam)) {
        effectiveAssigneeId = null;
      }

      return { ok: true, targetTeam, effectiveAssigneeId };
    }

    if (currentTask.userId !== userId) {
      return fail(
        'FORBIDDEN',
        'Chỉ người tạo mới có quyền chuyển công việc về không gian cá nhân',
      );
    }

    const duplicateErr = await this.checkDuplicateTitle(
      effectiveTitle,
      { userId: currentTask.userId, teamId: null, deletedAt: null },
      `Tiêu đề '${effectiveTitle}' đã được sử dụng bởi một công việc khác`,
      currentTask.id,
    );
    if (duplicateErr) return duplicateErr;

    if (hasAssignee) {
      if (effectiveAssigneeId !== null && effectiveAssigneeId !== currentTask.userId) {
        return fail('BAD_REQUEST', 'Công việc cá nhân chỉ có thể phân công cho chính bạn');
      }
    } else if (effectiveAssigneeId !== currentTask.userId) {
      effectiveAssigneeId = null;
    }

    return { ok: true, targetTeam: null, effectiveAssigneeId };
  }

  private parseCollaboratorIds(
    rawIds: unknown,
  ): { ok: true; value: number[] } | ValidationFailure {
    if (rawIds === undefined || rawIds === null) {
      return { ok: true, value: [] };
    }
    if (!Array.isArray(rawIds)) {
      return fail('BAD_REQUEST', 'Danh sách người phối hợp phải là mảng số nguyên');
    }
    for (const id of rawIds) {
      if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) {
        return fail('BAD_REQUEST', 'Mỗi mã người phối hợp phải là số nguyên dương');
      }
    }
    return { ok: true, value: Array.from(new Set(rawIds as number[])) };
  }

  private validateDateRange(startDate: Date | null, dueDate: Date | null): ValidationFailure | null {
    try {
      assertDateRangeValid(startDate, dueDate);
      return null;
    } catch (error) {
      if (error instanceof BadRequestException) {
        return fail('BAD_REQUEST', error.message);
      }
      throw error;
    }
  }

  private async fetchTeamWithMembers(teamId: number): Promise<TeamWithMembersAndOwner | null> {
    return this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        owner: { select: { id: true, name: true } },
        members: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  private async checkDuplicateTitle(
    title: string,
    scopeWhere: Prisma.TaskWhereInput,
    conflictMessage: string,
    excludeTaskId?: number,
  ): Promise<ValidationFailure | null> {
    const duplicate = await this.prisma.task.findFirst({
      where: {
        ...scopeWhere,
        title: {
          equals: title,
          mode: 'insensitive',
        },
        ...(excludeTaskId !== undefined ? { NOT: { id: excludeTaskId } } : {}),
      },
    });

    if (duplicate) {
      return fail('CONFLICT', conflictMessage);
    }
    return null;
  }

  private async validateCategory(
    categoryId: number,
    teamId: number | null,
    personalUserIds: number[],
    skipIfUnchangedId?: number | null,
  ): Promise<ValidationFailure | null> {
    try {
      await validateScopedCategory(
        this.prisma,
        categoryId,
        teamId,
        personalUserIds,
        skipIfUnchangedId,
      );
      return null;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return fail('NOT_FOUND', error.message);
      }
      if (error instanceof BadRequestException) {
        return fail('BAD_REQUEST', error.message);
      }
      throw error;
    }
  }

  private async resolveUserRef(
    targetUserId: number,
    team: TeamWithMembersAndOwner | null,
  ): Promise<{ id: number; name: string }> {
    return resolveTeamOrDbUserRef(this.prisma, targetUserId, team);
  }

  private async resolveCategoryRef(categoryId: number): Promise<{ id: number; name: string }> {
    const category = await this.prisma.category?.findUnique?.({
      where: { id: categoryId },
      select: { id: true, name: true },
    });
    return {
      id: categoryId,
      name: category?.name ?? `Danh mục #${categoryId}`,
    };
  }

  private buildUpdatePayload(
    taskId: number,
    inputs: Extract<ReturnType<AiTaskValidatorService['parseUpdateInputs']>, { ok: true }>['value'],
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = { taskId };
    if (inputs.hasTitle && inputs.title !== undefined) payload.title = inputs.title;
    if (inputs.hasDescription) payload.description = inputs.description;
    if (inputs.hasPriority && inputs.priority !== undefined) payload.priority = inputs.priority;
    if (inputs.hasStatus && inputs.status !== undefined) payload.status = inputs.status;
    if (inputs.hasStartDate) payload.startDate = formatDateOnly(inputs.startDate);
    if (inputs.hasDueDate) payload.dueDate = formatDateOnly(inputs.dueDate);
    if (inputs.hasCategory) payload.categoryId = inputs.categoryId;
    if (inputs.hasTeam) payload.teamId = inputs.teamId;
    if (inputs.hasAssignee) payload.assigneeId = inputs.assigneeId;
    return payload;
  }

  private async buildUpdateChanges(
    currentTask: LoadedTask,
    inputs: Extract<ReturnType<AiTaskValidatorService['parseUpdateInputs']>, { ok: true }>['value'],
    targetTeam: TeamWithMembersAndOwner | null,
    isTeamChanged: boolean,
    effectiveAssigneeId: number | null,
    categoryDisconnectedImplicitly: boolean,
  ): Promise<AiUpdateTaskChange[]> {
    const requested: AiUpdateTaskChange[] = [];

    if (inputs.hasTitle && inputs.title !== undefined) {
      requested.push({
        field: 'title',
        label: 'Tiêu đề',
        before: currentTask.title,
        after: inputs.title,
      });
    }

    if (inputs.hasDescription) {
      requested.push({
        field: 'description',
        label: 'Mô tả',
        before: currentTask.description ?? null,
        after: inputs.description,
      });
    }

    if (inputs.hasStatus && inputs.status !== undefined) {
      requested.push({
        field: 'status',
        label: 'Trạng thái',
        before: STATUS_LABELS[currentTask.status] ?? currentTask.status,
        after: STATUS_LABELS[inputs.status] ?? inputs.status,
      });
    }

    if (inputs.hasPriority && inputs.priority !== undefined) {
      requested.push({
        field: 'priority',
        label: 'Độ ưu tiên',
        before: PRIORITY_LABELS[currentTask.priority] ?? currentTask.priority,
        after: PRIORITY_LABELS[inputs.priority] ?? inputs.priority,
      });
    }

    if (inputs.hasTeam) {
      requested.push({
        field: 'teamId',
        label: 'Nhóm',
        before: currentTask.team?.name ?? 'Cá nhân',
        after: targetTeam ? targetTeam.name : 'Cá nhân',
      });
    }

    const assigneeChangedImplicitly = isTeamChanged && effectiveAssigneeId !== currentTask.assigneeId;
    if (inputs.hasAssignee || assigneeChangedImplicitly) {
      const afterAssignee =
        effectiveAssigneeId !== null
          ? (await this.resolveUserRef(effectiveAssigneeId, targetTeam)).name
          : null;
      requested.push({
        field: 'assigneeId',
        label: 'Người thực hiện',
        before: currentTask.assignee?.name ?? null,
        after: afterAssignee,
      });
    }

    if (inputs.hasCategory) {
      const afterCategory =
        inputs.categoryId !== null
          ? (await this.resolveCategoryRef(inputs.categoryId)).name
          : null;
      requested.push({
        field: 'categoryId',
        label: 'Danh mục',
        before: currentTask.category?.name ?? null,
        after: afterCategory,
      });
    } else if (categoryDisconnectedImplicitly && currentTask.categoryId !== null) {
      requested.push({
        field: 'categoryId',
        label: 'Danh mục',
        before: currentTask.category?.name ?? `#${currentTask.categoryId}`,
        after: null,
      });
    }

    if (inputs.hasStartDate) {
      requested.push({
        field: 'startDate',
        label: 'Ngày bắt đầu',
        before: formatDateOnly(currentTask.startDate),
        after: formatDateOnly(inputs.startDate),
      });
    }

    if (inputs.hasDueDate) {
      requested.push({
        field: 'dueDate',
        label: 'Hạn chót',
        before: formatDateOnly(currentTask.dueDate),
        after: formatDateOnly(inputs.dueDate),
      });
    }

    const diffOnly = requested.filter((c) => c.before !== c.after);
    return diffOnly.length > 0 ? diffOnly : requested;
  }
}
