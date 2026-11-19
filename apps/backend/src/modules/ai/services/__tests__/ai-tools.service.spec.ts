import { NotFoundException } from '@nestjs/common';
import { AiActionType, AiPendingActionStatus, TaskPriority, TaskStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiToolsService } from '../ai-tools.service.js';

describe('AiToolsService', () => {
  let prisma: { aiPendingAction: { create: ReturnType<typeof vi.fn> } };
  let tasksService: {
    findAll: ReturnType<typeof vi.fn>;
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
  let service: AiToolsService;

  beforeEach(() => {
    prisma = {
      aiPendingAction: {
        create: vi.fn(),
      },
    };
    tasksService = {
      findAll: vi.fn(),
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

    service = new AiToolsService(
      prisma as never,
      tasksService as never,
      teamsService as never,
      categoriesService as never,
      notificationsService as never,
      validator as never,
    );
  });

  it('exposes the 8 read tools and 2 write proposal tools', () => {
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
      'create_task',
      'update_task',
    ]);

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

  it('returns structured ok:false without throwing on unknown tool or service NotFoundException', async () => {
    const unknown = await service.executeTool(
      { userId: 7, conversationId: 99 },
      'delete_task',
      {},
    );
    expect(unknown.ok).toBe(false);
    expect(unknown.summary).toContain('delete_task');

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
      actionType: 'CREATE_TASK',
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
});
