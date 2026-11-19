import { NotFoundException } from '@nestjs/common';
import {
  AiActionType,
  AiPendingActionStatus,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiToolsService } from '../ai-tools.service.js';

describe('AiToolsService', () => {
  let prisma: { aiPendingAction: { create: ReturnType<typeof vi.fn> } };
  let tasksService: {
    findAll: ReturnType<typeof vi.fn>;
    findTrash: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };
  let teamsService: {
    findAllForUser: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let categoriesService: {
    findAll: ReturnType<typeof vi.fn>;
  };
  let notificationsService: {
    findAllForUser: ReturnType<typeof vi.fn>;
  };
  let validator: {
    validateCreateTaskProposal: ReturnType<typeof vi.fn>;
    validateUpdateTaskProposal: ReturnType<typeof vi.fn>;
  };
  let extendedValidator: {
    validateDeleteTaskProposal: ReturnType<typeof vi.fn>;
    validateRestoreTaskProposal: ReturnType<typeof vi.fn>;
    validateReturnTaskProposal: ReturnType<typeof vi.fn>;
    validateCreateSubtaskProposal: ReturnType<typeof vi.fn>;
    validateUpdateSubtaskProposal: ReturnType<typeof vi.fn>;
    validateDeleteSubtaskProposal: ReturnType<typeof vi.fn>;
  };
  let teamValidator: {
    validateAddTeamMemberProposal: ReturnType<typeof vi.fn>;
    validateUpdateTeamMemberRoleProposal: ReturnType<typeof vi.fn>;
    validateRemoveTeamMemberProposal: ReturnType<typeof vi.fn>;
  };
  let service: AiToolsService;

  beforeEach(() => {
    prisma = {
      aiPendingAction: {
        create: vi.fn(),
      },
    };
    tasksService = {
      findAll: vi.fn(),
      findTrash: vi.fn(),
      findOne: vi.fn(),
      getStats: vi.fn(),
    };
    teamsService = {
      findAllForUser: vi.fn(),
      findOne: vi.fn(),
    };
    categoriesService = {
      findAll: vi.fn(),
    };
    notificationsService = {
      findAllForUser: vi.fn(),
    };
    validator = {
      validateCreateTaskProposal: vi.fn(),
      validateUpdateTaskProposal: vi.fn(),
    };
    extendedValidator = {
      validateDeleteTaskProposal: vi.fn(),
      validateRestoreTaskProposal: vi.fn(),
      validateReturnTaskProposal: vi.fn(),
      validateCreateSubtaskProposal: vi.fn(),
      validateUpdateSubtaskProposal: vi.fn(),
      validateDeleteSubtaskProposal: vi.fn(),
    };
    teamValidator = {
      validateAddTeamMemberProposal: vi.fn(),
      validateUpdateTeamMemberRoleProposal: vi.fn(),
      validateRemoveTeamMemberProposal: vi.fn(),
    };

    service = new AiToolsService(
      prisma as never,
      tasksService as never,
      teamsService as never,
      categoriesService as never,
      notificationsService as never,
      validator as never,
      extendedValidator as never,
      teamValidator as never,
    );
  });

  it('exposes the 9 read tools and 11 write proposal tools (20 total, safe-tier only)', () => {
    const definitions = service.getToolDefinitions();
    const names = definitions.map((t) => t.function.name);
    expect(names).toEqual([
      'get_my_tasks',
      'list_tasks',
      'get_task_detail',
      'get_task_stats',
      'list_teams',
      'get_team_detail',
      'list_categories',
      'list_notifications',
      'list_trash_tasks',
      'create_task',
      'update_task',
      'delete_task',
      'restore_task',
      'return_task',
      'create_subtask',
      'update_subtask',
      'delete_subtask',
      'add_team_member',
      'update_team_member_role',
      'remove_team_member',
    ]);

    expect(names).not.toContain('permanent_delete');
    expect(names).not.toContain('empty_trash');
    expect(names).not.toContain('transfer_ownership');
    expect(names).not.toContain('delete_team');

    const updateTaskTool = definitions.find((t) => t.function.name === 'update_task');
    const props = (updateTaskTool?.function.parameters.properties ?? {}) as Record<
      string,
      { type?: unknown; minimum?: unknown }
    >;
    expect(props.description?.type).toEqual(['string', 'null']);
    expect(props.startDate?.type).toEqual(['string', 'null']);
    expect(props.dueDate?.type).toEqual(['string', 'null']);
    expect(props.categoryId).toMatchObject({ type: ['integer', 'null'], minimum: 1 });
    expect(props.teamId).toMatchObject({ type: ['integer', 'null'], minimum: 1 });
    expect(props.assigneeId).toMatchObject({ type: ['integer', 'null'], minimum: 1 });

    const deleteTaskTool = definitions.find((t) => t.function.name === 'delete_task');
    expect(deleteTaskTool?.function.description).toMatch(/thùng rác|trash/i);
    expect(deleteTaskTool?.function.description).toMatch(/xác nhận/i);

    const listTrashTool = definitions.find((t) => t.function.name === 'list_trash_tasks');
    expect(listTrashTool?.function.parameters.properties).toMatchObject({
      teamId: { type: 'integer', minimum: 1 },
      personalOnly: { type: 'boolean' },
      priority: { type: 'string', enum: [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH] },
      search: { type: 'string', maxLength: 100 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    });

    const updateSubtaskTool = definitions.find((t) => t.function.name === 'update_subtask');
    expect(updateSubtaskTool?.function.parameters.required).toEqual(['taskId', 'subtaskId']);

    const addMemberTool = definitions.find((t) => t.function.name === 'add_team_member');
    expect(addMemberTool?.function.parameters.required).toEqual(['teamId', 'email']);
  });

  it('executes read tools via domain services and shared serializers', async () => {
    tasksService.findAll.mockResolvedValueOnce([
      {
        id: 1,
        title: 'Task A',
        status: TaskStatus.TODO,
        priority: TaskPriority.HIGH,
        startDate: null,
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
        team: null,
        assignee: null,
        category: null,
        subtasks: [{ id: 10, title: 'Sub', status: TaskStatus.DONE }],
      },
    ]);

    const res = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'get_my_tasks',
      { status: 'INCOMPLETE', limit: 10 },
    );

    expect(tasksService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'my_work', status: 'INCOMPLETE' }),
      7,
    );
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      totalMatched: 1,
      returned: 1,
      truncated: false,
      tasks: [
        expect.objectContaining({
          id: 1,
          title: 'Task A',
          dueDate: '2026-11-20',
          checklist: { completed: 1, total: 1 },
        }),
      ],
    });
  });

  it('executes list_trash_tasks via tasksService.findTrash with limit clamping', async () => {
    tasksService.findTrash.mockResolvedValueOnce([
      {
        id: 11,
        title: 'Deleted A',
        status: TaskStatus.TODO,
        priority: TaskPriority.LOW,
        startDate: null,
        dueDate: null,
        team: { id: 3, name: 'Core' },
        assignee: null,
        category: null,
        subtasks: [],
      },
      {
        id: 12,
        title: 'Deleted B',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        startDate: null,
        dueDate: null,
        team: null,
        assignee: null,
        category: null,
        subtasks: [],
      },
    ]);

    const res = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'list_trash_tasks',
      { teamId: 3, priority: TaskPriority.LOW, search: 'Deleted', limit: 1 },
    );

    expect(tasksService.findTrash).toHaveBeenCalledWith(
      {
        teamId: 3,
        personalOnly: undefined,
        priority: TaskPriority.LOW,
        search: 'Deleted',
      },
      7,
    );
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      totalMatched: 2,
      returned: 1,
      truncated: true,
      tasks: [expect.objectContaining({ id: 11, title: 'Deleted A' })],
    });
  });

  it('returns structured ok:false without throwing on unknown tool or service NotFoundException', async () => {
    const unknown = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'permanent_delete',
      {},
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.summary).toContain('permanent_delete');

    tasksService.findOne.mockRejectedValueOnce(new NotFoundException('Không tìm thấy công việc với mã #55'));
    const notFound = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'get_task_detail',
      { taskId: 55 },
    );
    expect(notFound.ok).toBe(false);
    expect(notFound.data.reason).toBe('Không tìm thấy công việc với mã #55');
  });

  it('persists AiPendingAction with ~10 min expiresAt when create_task passes validation', async () => {
    const preview = {
      kind: 'CREATE_TASK',
      title: 'Viết báo cáo',
      description: null,
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      startDate: null,
      dueDate: '2026-11-21',
      team: null,
      assignee: null,
      category: null,
      collaborators: [],
    };
    validator.validateCreateTaskProposal.mockResolvedValueOnce({
      ok: true,
      actionType: AiActionType.CREATE_TASK,
      payload: { title: 'Viết báo cáo', dueDate: '2026-11-21' },
      preview,
    });

    const createdRecord = {
      id: 42,
      userId: 7,
      conversationId: 99,
      messageId: null,
      actionType: AiActionType.CREATE_TASK,
      status: AiPendingActionStatus.PENDING,
      payload: { title: 'Viết báo cáo', dueDate: '2026-11-21' },
      preview,
      executedTaskId: null,
      errorMessage: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.aiPendingAction.create.mockResolvedValueOnce(createdRecord);

    const before = Date.now();
    const res = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'create_task',
      { title: 'Viết báo cáo', dueDate: '2026-11-21' },
    );

    expect(res.ok).toBe(true);
    expect(res.pendingAction).toEqual(createdRecord);
    expect(res.data).toMatchObject({
      ok: true,
      requiresConfirmation: true,
      actionId: 42,
      actionType: AiActionType.CREATE_TASK,
      preview,
    });

    const createCall = prisma.aiPendingAction.create.mock.calls[0][0];
    const ttlMs = (createCall.data.expiresAt as Date).getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(9.5 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(10.5 * 60 * 1000);
  });

  it('does NOT create AiPendingAction when update_task pre-flight validation fails', async () => {
    validator.validateUpdateTaskProposal.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      reason: 'Bạn không có quyền chỉnh sửa nội dung công việc này',
    });

    const res = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'update_task',
      { taskId: 10, title: 'Sửa trái phép' },
    );

    expect(prisma.aiPendingAction.create).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.pendingAction).toBeUndefined();
    expect(res.data).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      reason: 'Bạn không có quyền chỉnh sửa nội dung công việc này',
    });
  });

  it.each([
    {
      toolName: 'delete_task',
      args: { taskId: 15 },
      getValidatorFn: () => extendedValidator.validateDeleteTaskProposal,
      actionType: AiActionType.DELETE_TASK,
      payload: { taskId: 15 },
      preview: { kind: 'DELETE_TASK', taskId: 15, taskTitle: 'Old task', teamName: null, subtaskCount: 2 },
    },
    {
      toolName: 'restore_task',
      args: { taskId: 15 },
      getValidatorFn: () => extendedValidator.validateRestoreTaskProposal,
      actionType: AiActionType.RESTORE_TASK,
      payload: { taskId: 15 },
      preview: { kind: 'RESTORE_TASK', taskId: 15, taskTitle: 'Old task', teamName: null },
    },
    {
      toolName: 'return_task',
      args: { taskId: 15, reason: 'Thiếu spec' },
      getValidatorFn: () => extendedValidator.validateReturnTaskProposal,
      actionType: AiActionType.RETURN_TASK,
      payload: { taskId: 15, reason: 'Thiếu spec' },
      preview: { kind: 'RETURN_TASK', taskId: 15, taskTitle: 'Team task', teamName: 'Alpha', reason: 'Thiếu spec' },
    },
    {
      toolName: 'create_subtask',
      args: { taskId: 15, title: 'Sub A' },
      getValidatorFn: () => extendedValidator.validateCreateSubtaskProposal,
      actionType: AiActionType.CREATE_SUBTASK,
      payload: { taskId: 15, title: 'Sub A' },
      preview: { kind: 'CREATE_SUBTASK', taskId: 15, taskTitle: 'Task', title: 'Sub A', description: null, assignee: null },
    },
    {
      toolName: 'update_subtask',
      args: { taskId: 15, subtaskId: 22, status: TaskStatus.IN_PROGRESS },
      getValidatorFn: () => extendedValidator.validateUpdateSubtaskProposal,
      actionType: AiActionType.UPDATE_SUBTASK,
      payload: { taskId: 15, subtaskId: 22, status: TaskStatus.IN_PROGRESS },
      preview: {
        kind: 'UPDATE_SUBTASK',
        taskId: 15,
        taskTitle: 'Task',
        subtaskId: 22,
        subtaskTitle: 'Sub A',
        changes: [],
      },
    },
    {
      toolName: 'delete_subtask',
      args: { taskId: 15, subtaskId: 22 },
      getValidatorFn: () => extendedValidator.validateDeleteSubtaskProposal,
      actionType: AiActionType.DELETE_SUBTASK,
      payload: { taskId: 15, subtaskId: 22 },
      preview: { kind: 'DELETE_SUBTASK', taskId: 15, taskTitle: 'Task', subtaskId: 22, subtaskTitle: 'Sub A' },
    },
    {
      toolName: 'add_team_member',
      args: { teamId: 3, email: 'new@test.com', role: TeamRole.MEMBER },
      getValidatorFn: () => teamValidator.validateAddTeamMemberProposal,
      actionType: AiActionType.ADD_TEAM_MEMBER,
      payload: { teamId: 3, email: 'new@test.com', role: TeamRole.MEMBER },
      preview: {
        kind: 'ADD_TEAM_MEMBER',
        teamId: 3,
        teamName: 'Alpha',
        targetUser: { id: 9, name: 'New', email: 'new@test.com' },
        role: TeamRole.MEMBER,
      },
    },
    {
      toolName: 'update_team_member_role',
      args: { teamId: 3, memberUserId: 9, role: TeamRole.ADMIN },
      getValidatorFn: () => teamValidator.validateUpdateTeamMemberRoleProposal,
      actionType: AiActionType.UPDATE_TEAM_MEMBER_ROLE,
      payload: { teamId: 3, memberId: 50, memberUserId: 9, role: TeamRole.ADMIN },
      preview: {
        kind: 'UPDATE_TEAM_MEMBER_ROLE',
        teamId: 3,
        teamName: 'Alpha',
        memberUser: { id: 9, name: 'New' },
        oldRole: TeamRole.MEMBER,
        newRole: TeamRole.ADMIN,
      },
    },
    {
      toolName: 'remove_team_member',
      args: { teamId: 3, memberUserId: 9 },
      getValidatorFn: () => teamValidator.validateRemoveTeamMemberProposal,
      actionType: AiActionType.REMOVE_TEAM_MEMBER,
      payload: { teamId: 3, memberId: 50, memberUserId: 9 },
      preview: {
        kind: 'REMOVE_TEAM_MEMBER',
        teamId: 3,
        teamName: 'Alpha',
        memberUser: { id: 9, name: 'New' },
        memberRole: TeamRole.MEMBER,
        isSelfLeaving: false,
      },
    },
  ])('routes $toolName proposal through its validator and persists AiPendingAction', async ({
    toolName,
    args,
    getValidatorFn,
    actionType,
    payload,
    preview,
  }) => {
    const validatorFn = getValidatorFn();
    validatorFn.mockResolvedValueOnce({
      ok: true,
      actionType,
      payload,
      preview,
    });

    const createdRecord = {
      id: 101,
      userId: 7,
      conversationId: 99,
      messageId: null,
      actionType,
      status: AiPendingActionStatus.PENDING,
      payload,
      preview,
      executedTaskId: null,
      errorMessage: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prisma.aiPendingAction.create.mockResolvedValueOnce(createdRecord);

    const res = await service.executeTool({ userId: 7, conversationId: 99 }, toolName, args);

    expect(validatorFn).toHaveBeenCalledWith(7, args);
    expect(prisma.aiPendingAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        conversationId: 99,
        actionType,
        status: AiPendingActionStatus.PENDING,
        payload,
        preview,
      }),
    });
    expect(res.ok).toBe(true);
    expect(res.pendingAction).toEqual(createdRecord);
    expect(res.data).toMatchObject({
      ok: true,
      requiresConfirmation: true,
      actionId: 101,
      actionType,
      preview,
    });
    expect(res.summary.length).toBeGreaterThan(0);
  });

  it('returns failTool and skips persistence when an extended/team validator fails', async () => {
    teamValidator.validateAddTeamMemberProposal.mockResolvedValueOnce({
      ok: false,
      code: 'FORBIDDEN',
      reason: 'Chỉ chủ nhóm mới có quyền thêm Quản trị viên',
    });

    const res = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'add_team_member',
      { teamId: 3, email: 'a@b.com', role: TeamRole.ADMIN },
    );

    expect(prisma.aiPendingAction.create).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.data).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      reason: 'Chỉ chủ nhóm mới có quyền thêm Quản trị viên',
    });
  });
});
