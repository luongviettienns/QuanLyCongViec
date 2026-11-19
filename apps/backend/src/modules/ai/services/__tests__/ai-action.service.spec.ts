import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AiActionType,
  AiPendingActionStatus,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiActionService } from '../ai-action.service.js';

describe('AiActionService', () => {
  let prisma: {
    aiPendingAction: {
      updateMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findUniqueOrThrow: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let tasksService: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    returnTask: ReturnType<typeof vi.fn>;
    createSubtask: ReturnType<typeof vi.fn>;
    updateSubtask: ReturnType<typeof vi.fn>;
    removeSubtask: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let teamsService: {
    addMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
  };
  let service: AiActionService;

  const baseAction = (
    actionType: AiActionType,
    payload: Record<string, unknown>,
    overrides: Partial<{
      id: number;
      userId: number;
      status: AiPendingActionStatus;
      expiresAt: Date;
    }> = {},
  ) => ({
    id: overrides.id ?? 100,
    userId: overrides.userId ?? 7,
    conversationId: 55,
    messageId: 12,
    actionType,
    status: overrides.status ?? AiPendingActionStatus.EXECUTING,
    payload,
    preview: { kind: actionType },
    executedTaskId: null,
    errorMessage: null,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    confirmedAt: null,
    createdAt: new Date('2026-11-19T00:00:00.000Z'),
    updatedAt: new Date('2026-11-19T00:00:00.000Z'),
  });

  const sampleTask = (id = 42, title = 'Sample Task') => ({
    id,
    title,
    description: null,
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    startDate: null,
    dueDate: null,
    teamId: null,
    team: null,
    assignee: null,
    category: null,
    subtasks: [],
    collaborators: [],
  });

  beforeEach(() => {
    prisma = {
      aiPendingAction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        update: vi.fn().mockImplementation(async ({ data }) => ({
          ...baseAction(AiActionType.CREATE_TASK, {}),
          ...data,
        })),
      },
    };
    tasksService = {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      restore: vi.fn(),
      returnTask: vi.fn(),
      createSubtask: vi.fn(),
      updateSubtask: vi.fn(),
      removeSubtask: vi.fn(),
      findOne: vi.fn(),
    };
    teamsService = {
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
    };

    service = new AiActionService(
      prisma as never,
      tasksService as never,
      teamsService as never,
    );
  });

  it('rejects confirmAction when action is missing, expired, or already claimed', async () => {
    prisma.aiPendingAction.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.aiPendingAction.findFirst.mockResolvedValueOnce(null);
    await expect(service.confirmAction(7, 999)).rejects.toThrow(NotFoundException);

    prisma.aiPendingAction.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.aiPendingAction.findFirst.mockResolvedValueOnce(
      baseAction(AiActionType.CREATE_TASK, {}, { status: AiPendingActionStatus.EXPIRED }),
    );
    await expect(service.confirmAction(7, 100)).rejects.toThrow(BadRequestException);

    prisma.aiPendingAction.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    prisma.aiPendingAction.findFirst.mockResolvedValueOnce(
      baseAction(AiActionType.CREATE_TASK, {}, { status: AiPendingActionStatus.EXECUTED }),
    );
    await expect(service.confirmAction(7, 100)).rejects.toThrow(ConflictException);
  });

  it('executes CREATE_TASK and returns serialized task', async () => {
    const claimed = baseAction(AiActionType.CREATE_TASK, { title: 'New Task' });
    const created = sampleTask(10, 'New Task');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.create.mockResolvedValueOnce(created);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 10,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.create).toHaveBeenCalledWith({ title: 'New Task' }, 7);
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: expect.objectContaining({
        status: AiPendingActionStatus.EXECUTED,
        executedTaskId: 10,
        errorMessage: null,
      }),
    });
    expect(res.action.status).toBe(AiPendingActionStatus.EXECUTED);
    expect(res.task).toMatchObject({ id: 10, title: 'New Task' });
  });

  it('executes UPDATE_TASK and returns serialized task', async () => {
    const claimed = baseAction(AiActionType.UPDATE_TASK, { taskId: 15, title: 'Updated' });
    const updated = sampleTask(15, 'Updated');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.update.mockResolvedValueOnce(updated);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 15,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.update).toHaveBeenCalledWith(15, { title: 'Updated' }, 7);
    expect(res.task).toMatchObject({ id: 15, title: 'Updated' });
  });

  it('executes DELETE_TASK via tasksService.remove and returns task: null', async () => {
    const claimed = baseAction(AiActionType.DELETE_TASK, { taskId: 21 });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.remove.mockResolvedValueOnce({ success: true, message: 'ok', deletedTask: sampleTask(21) });
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 21,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.remove).toHaveBeenCalledWith(21, 7);
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: expect.objectContaining({
        status: AiPendingActionStatus.EXECUTED,
        executedTaskId: 21,
        errorMessage: null,
      }),
    });
    expect(res.task).toBeNull();
  });

  it('executes RESTORE_TASK via tasksService.restore and returns serialized task', async () => {
    const claimed = baseAction(AiActionType.RESTORE_TASK, { taskId: 22 });
    const restored = sampleTask(22, 'Restored');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.restore.mockResolvedValueOnce(restored);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 22,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.restore).toHaveBeenCalledWith(22, 7);
    expect(res.task).toMatchObject({ id: 22, title: 'Restored' });
  });

  it('executes RETURN_TASK via tasksService.returnTask and returns serialized task', async () => {
    const claimed = baseAction(AiActionType.RETURN_TASK, { taskId: 23, reason: 'Thiếu yêu cầu' });
    const returned = sampleTask(23, 'Returned');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.returnTask.mockResolvedValueOnce(returned);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 23,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.returnTask).toHaveBeenCalledWith(23, { reason: 'Thiếu yêu cầu' }, 7);
    expect(res.task).toMatchObject({ id: 23, title: 'Returned' });
  });

  it('executes CREATE_SUBTASK and refreshes parent task detail', async () => {
    const claimed = baseAction(AiActionType.CREATE_SUBTASK, {
      taskId: 30,
      title: 'Sub 1',
      description: 'Desc',
      assigneeId: 8,
    });
    const parentTask = sampleTask(30, 'Parent');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.createSubtask.mockResolvedValueOnce({ id: 91, title: 'Sub 1' });
    tasksService.findOne.mockResolvedValueOnce(parentTask);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 30,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.createSubtask).toHaveBeenCalledWith(
      30,
      { title: 'Sub 1', description: 'Desc', assigneeId: 8 },
      7,
    );
    expect(tasksService.findOne).toHaveBeenCalledWith(30, 7);
    expect(res.task).toMatchObject({ id: 30, title: 'Parent' });
  });

  it('executes UPDATE_SUBTASK and refreshes parent task detail', async () => {
    const claimed = baseAction(AiActionType.UPDATE_SUBTASK, {
      taskId: 31,
      subtaskId: 92,
      status: TaskStatus.IN_PROGRESS,
    });
    const parentTask = sampleTask(31, 'Parent 31');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.updateSubtask.mockResolvedValueOnce({ id: 92, status: TaskStatus.IN_PROGRESS });
    tasksService.findOne.mockResolvedValueOnce(parentTask);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 31,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.updateSubtask).toHaveBeenCalledWith(
      31,
      92,
      { status: TaskStatus.IN_PROGRESS },
      7,
    );
    expect(tasksService.findOne).toHaveBeenCalledWith(31, 7);
    expect(res.task).toMatchObject({ id: 31, title: 'Parent 31' });
  });

  it('executes DELETE_SUBTASK via tasksService.removeSubtask and refreshes parent task detail', async () => {
    const claimed = baseAction(AiActionType.DELETE_SUBTASK, { taskId: 32, subtaskId: 93 });
    const parentTask = sampleTask(32, 'Parent 32');
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.removeSubtask.mockResolvedValueOnce({ success: true });
    tasksService.findOne.mockResolvedValueOnce(parentTask);
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: 32,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(tasksService.removeSubtask).toHaveBeenCalledWith(32, 93, 7);
    expect(tasksService.findOne).toHaveBeenCalledWith(32, 7);
    expect(res.task).toMatchObject({ id: 32, title: 'Parent 32' });
  });

  it('executes ADD_TEAM_MEMBER via teamsService.addMember and returns task: null', async () => {
    const claimed = baseAction(AiActionType.ADD_TEAM_MEMBER, {
      teamId: 5,
      email: 'member@test.com',
      role: TeamRole.MEMBER,
    });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    teamsService.addMember.mockResolvedValueOnce({ id: 80 });
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: null,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(teamsService.addMember).toHaveBeenCalledWith(7, 5, {
      email: 'member@test.com',
      role: TeamRole.MEMBER,
    });
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: expect.objectContaining({
        status: AiPendingActionStatus.EXECUTED,
        executedTaskId: null,
        errorMessage: null,
      }),
    });
    expect(res.task).toBeNull();
  });

  it('executes UPDATE_TEAM_MEMBER_ROLE via teamsService.updateMemberRole and returns task: null', async () => {
    const claimed = baseAction(AiActionType.UPDATE_TEAM_MEMBER_ROLE, {
      teamId: 5,
      memberId: 80,
      memberUserId: 12,
      role: TeamRole.ADMIN,
    });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    teamsService.updateMemberRole.mockResolvedValueOnce({ id: 80, role: TeamRole.ADMIN });
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: null,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(teamsService.updateMemberRole).toHaveBeenCalledWith(7, 5, 80, {
      role: TeamRole.ADMIN,
    });
    expect(res.task).toBeNull();
  });

  it('executes REMOVE_TEAM_MEMBER via teamsService.removeMember and returns task: null', async () => {
    const claimed = baseAction(AiActionType.REMOVE_TEAM_MEMBER, {
      teamId: 5,
      memberId: 80,
      memberUserId: 12,
    });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    teamsService.removeMember.mockResolvedValueOnce({ message: 'removed' });
    prisma.aiPendingAction.update.mockResolvedValueOnce({
      ...claimed,
      status: AiPendingActionStatus.EXECUTED,
      executedTaskId: null,
      confirmedAt: new Date(),
    });

    const res = await service.confirmAction(7, 100);

    expect(teamsService.removeMember).toHaveBeenCalledWith(7, 5, 80);
    expect(res.task).toBeNull();
  });

  it('records FAILED status and errorMessage when execution throws HttpException or unexpected error', async () => {
    const claimed = baseAction(AiActionType.DELETE_TASK, { taskId: 21 });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed);
    tasksService.remove.mockRejectedValueOnce(new ForbiddenException('Không có quyền xóa'));

    await expect(service.confirmAction(7, 100)).rejects.toThrow(ForbiddenException);
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        status: AiPendingActionStatus.FAILED,
        errorMessage: 'Không có quyền xóa',
      },
    });

    const claimed2 = baseAction(AiActionType.ADD_TEAM_MEMBER, {
      teamId: 5,
      email: 'a@b.com',
      role: TeamRole.MEMBER,
    });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(claimed2);
    teamsService.addMember.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.confirmAction(7, 100)).rejects.toThrow(BadRequestException);
    expect(prisma.aiPendingAction.update).toHaveBeenLastCalledWith({
      where: { id: 100 },
      data: {
        status: AiPendingActionStatus.FAILED,
        errorMessage: 'Không thể thực thi đề xuất AI lúc này',
      },
    });
  });

  it('records FAILED status on malformed payload (e.g. missing reason or memberId)', async () => {
    const badReturn = baseAction(AiActionType.RETURN_TASK, { taskId: 23, reason: '   ' });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(badReturn);

    await expect(service.confirmAction(7, 100)).rejects.toThrow(BadRequestException);
    expect(tasksService.returnTask).not.toHaveBeenCalled();
    expect(prisma.aiPendingAction.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: expect.objectContaining({
        status: AiPendingActionStatus.FAILED,
      }),
    });
  });

  it('cancels a pending action and rejects non-pending actions', async () => {
    prisma.aiPendingAction.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const cancelled = baseAction(AiActionType.DELETE_TASK, { taskId: 1 }, { status: AiPendingActionStatus.CANCELLED });
    prisma.aiPendingAction.findUniqueOrThrow.mockResolvedValueOnce(cancelled);

    const res = await service.cancelAction(7, 100);
    expect(res.action.status).toBe(AiPendingActionStatus.CANCELLED);
  });
});
