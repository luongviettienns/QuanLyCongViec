import { type INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AiActionType, AiPendingActionStatus, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CustomThrottlerGuard } from '../src/common/index.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type {
  AiCompletionInput,
  AiCompletionResult,
  AiProvider,
} from '../src/modules/ai/providers/ai-provider.interface.js';
import { AiProviderRegistry } from '../src/modules/ai/providers/ai-provider.registry.js';

describe('AI Assistant Agent, Atomic Actions & RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const runId = Date.now();
  const password = 'Password123!';

  let mockConfigured = true;
  const chatCompletionMock = vi.fn<(input: AiCompletionInput) => Promise<AiCompletionResult>>();
  const chatCompletionStreamMock = vi.fn<AiProvider['chatCompletionStream']>();

  const mockProviderRegistry = {
    isConfigured: () => mockConfigured,
    getStatus: () => ({
      configured: mockConfigured,
      provider: 'openai-compatible',
      model: mockConfigured ? 'mock-gpt-4o-mini' : null,
    }),
    getProvider: (): AiProvider => {
      if (!mockConfigured) {
        throw new ServiceUnavailableException('AI assistant is not configured');
      }
      return {
        name: 'openai-compatible',
        chatCompletion: chatCompletionMock,
        chatCompletionStream: chatCompletionStreamMock,
      };
    },
  };

  let ownerToken: string;
  let adminToken: string;
  let adminMemberRecordId: number;
  let memberId: number;
  let memberToken: string;
  let outsiderToken: string;

  let teamId: number;
  let categoryId: number;
  let teamTaskId: number;
  let teamSubtaskId: number;
  let outsiderTaskId: number;

  const createdUserIds: number[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AiProviderRegistry)
      .useValue(mockProviderRegistry)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['/', 'health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);

    const createUserAndLogin = async (prefix: string) => {
      const email = `ai_${prefix}_${runId}@taskflow.test`;
      const user = await prisma.user.create({
        data: { name: `AI ${prefix}`, email, passwordHash },
      });
      createdUserIds.push(user.id);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return { id: user.id, email, token: loginRes.body.accessToken as string };
    };

    const owner = await createUserAndLogin('owner');
    ownerToken = owner.token;

    const admin = await createUserAndLogin('admin');
    adminToken = admin.token;

    const member = await createUserAndLogin('member');
    memberId = member.id;
    memberToken = member.token;

    const outsider = await createUserAndLogin('outsider');
    outsiderToken = outsider.token;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `AI Team ${runId}`, description: 'AI E2E team' })
      .expect(201);
    teamId = teamRes.body.id;

    const addAdminRes = await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: admin.email, role: 'ADMIN' })
      .expect(201);
    adminMemberRecordId = addAdminRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: member.email, role: 'MEMBER' })
      .expect(201);

    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `AI Cat ${runId}`, color: '#1677ff', teamId })
      .expect(201);
    categoryId = catRes.body.id;

    const teamTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `AI Team Task ${runId}`,
        description: 'Task assigned to member',
        teamId,
        assigneeId: memberId,
        categoryId,
        priority: TaskPriority.MEDIUM,
      })
      .expect(201);
    teamTaskId = teamTaskRes.body.id;

    const subtaskRes = await request(app.getHttpServer())
      .post(`/api/tasks/${teamTaskId}/subtasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Incomplete Subtask', assigneeId: memberId })
      .expect(201);
    teamSubtaskId = subtaskRes.body.id;

    const outsiderTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({
        title: `AI Outsider Secret ${runId}`,
        priority: TaskPriority.HIGH,
      })
      .expect(201);
    outsiderTaskId = outsiderTaskRes.body.id;
  });

  beforeEach(() => {
    mockConfigured = true;
    chatCompletionMock.mockReset();
    chatCompletionStreamMock.mockReset();
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.aiPendingAction.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.aiConversation.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.task.deleteMany({
        where: { OR: [{ userId: { in: createdUserIds } }, { teamId }] },
      });
      await prisma.category.deleteMany({
        where: { OR: [{ userId: { in: createdUserIds } }, { teamId }] },
      });
      await prisma.team.deleteMany({ where: { id: teamId } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('requires JWT auth (401), validates DTO (400), and fails closed with 503 when unconfigured', async () => {
    await request(app.getHttpServer()).get('/api/ai/status').expect(401);
    await request(app.getHttpServer()).get('/api/ai/conversations').expect(401);
    await request(app.getHttpServer())
      .post('/api/ai/chat')
      .send({ message: 'Xin chào' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/ai/actions/1/confirm')
      .expect(401);

    const statusOk = await request(app.getHttpServer())
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(statusOk.body).toEqual({
      configured: true,
      provider: 'openai-compatible',
      model: 'mock-gpt-4o-mini',
    });

    await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: '   ' })
      .expect(400);

    mockConfigured = false;
    const statusOff = await request(app.getHttpServer())
      .get('/api/ai/status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(statusOff.body).toEqual({
      configured: false,
      provider: 'openai-compatible',
      model: null,
    });

    await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: 'Hôm nay có việc gì?' })
      .expect(503);
  });

  it('enforces conversation CRUD and strict user ownership isolation (404)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/ai/conversations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);

    const convId = createRes.body.id as number;
    expect(createRes.body.title).toBe('Cuộc trò chuyện mới');

    // Outsider cannot read, chat in, or delete owner's conversation
    await request(app.getHttpServer())
      .get(`/api/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ conversationId: convId, message: 'Đọc trộm' })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const listRes = await request(app.getHttpServer())
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect((listRes.body as Array<{ id: number }>).map((c) => c.id)).toContain(convId);

    const delRes = await request(app.getHttpServer())
      .delete(`/api/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(delRes.body).toEqual({ deleted: true, id: convId });

    await request(app.getHttpServer())
      .get(`/api/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('runs a real read tool loop (list_teams + list_tasks) and persists conversation history', async () => {
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          { id: 'c1', name: 'list_teams', rawArguments: '{}', arguments: {} },
        ],
      })
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'c2',
            name: 'list_tasks',
            rawArguments: JSON.stringify({ teamId }),
            arguments: { teamId },
          },
        ],
      })
      .mockImplementationOnce(async (input) => {
        const lastToolMsg = input.messages[input.messages.length - 1];
        const parsed = JSON.parse(lastToolMsg.content ?? '{}') as {
          tasks?: Array<{ id: number }>;
        };
        const ids = (parsed.tasks ?? []).map((t) => t.id);
        expect(ids).toContain(teamTaskId);
        expect(ids).not.toContain(outsiderTaskId);
        return {
          content: `Nhóm của bạn hiện có công việc #${teamTaskId}.`,
          toolCalls: [],
        };
      });

    const prompt = 'Kiểm tra danh sách công việc nhóm của tôi';
    const chatRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: prompt })
      .expect(200);

    const convId = chatRes.body.conversationId as number;
    expect(chatRes.body.userMessage.content).toBe(prompt);
    expect(chatRes.body.assistantMessage.content).toContain(`#${teamTaskId}`);
    expect(chatRes.body.pendingActions).toEqual([]);
    expect(chatRes.body.assistantMessage.toolCallsSummary).toHaveLength(2);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/ai/conversations/${convId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(detailRes.body.conversation.title).toBe(prompt);
    expect(detailRes.body.messages).toHaveLength(2);
  });

  it('creates a create_task proposal without mutating DB, executes atomically once on concurrent double-confirm (200 + 409)', async () => {
    const proposedTitle = `AI Created Task ${runId}`;

    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'c_create',
            name: 'create_task',
            rawArguments: JSON.stringify({
              title: proposedTitle,
              teamId,
              assigneeId: memberId,
              categoryId,
              priority: TaskPriority.HIGH,
            }),
            arguments: {
              title: proposedTitle,
              teamId,
              assigneeId: memberId,
              categoryId,
              priority: TaskPriority.HIGH,
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Tôi đã tạo thẻ đề xuất tạo công việc, vui lòng bấm Xác nhận.',
        toolCalls: [],
      });

    const chatRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: `Tạo việc ${proposedTitle}` })
      .expect(200);

    expect(chatRes.body.pendingActions).toHaveLength(1);
    const pendingAction = chatRes.body.pendingActions[0];
    expect(pendingAction.actionType).toBe(AiActionType.CREATE_TASK);
    expect(pendingAction.status).toBe(AiPendingActionStatus.PENDING);
    expect(pendingAction.payload).toBeUndefined();
    expect(pendingAction.preview).toMatchObject({
      kind: 'CREATE_TASK',
      title: proposedTitle,
      team: { id: teamId },
      assignee: { id: memberId },
      category: { id: categoryId },
    });

    // Task must NOT exist before confirm
    const beforeConfirm = await prisma.task.findFirst({
      where: { title: proposedTitle, teamId, deletedAt: null },
    });
    expect(beforeConfirm).toBeNull();

    // Outsider cannot confirm
    await request(app.getHttpServer())
      .post(`/api/ai/actions/${pendingAction.id}/confirm`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    // Concurrent double-confirm -> exactly 1 succeeds (200) and 1 fails (409)
    const [resA, resB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/ai/actions/${pendingAction.id}/confirm`)
        .set('Authorization', `Bearer ${ownerToken}`),
      request(app.getHttpServer())
        .post(`/api/ai/actions/${pendingAction.id}/confirm`)
        .set('Authorization', `Bearer ${ownerToken}`),
    ]);

    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const winner = resA.status === 200 ? resA : resB;
    expect(winner.body.action.status).toBe(AiPendingActionStatus.EXECUTED);
    expect(winner.body.action.executedTaskId).toBe(winner.body.task.id);
    expect(winner.body.task.title).toBe(proposedTitle);

    const createdInDb = await prisma.task.findUnique({
      where: { id: winner.body.task.id },
    });
    expect(createdInDb).not.toBeNull();
    expect(createdInDb?.teamId).toBe(teamId);
    expect(createdInDb?.assigneeId).toBe(memberId);

    // Confirming or cancelling after EXECUTED -> 409
    await request(app.getHttpServer())
      .post(`/api/ai/actions/${pendingAction.id}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
  });

  it('supports cancelling a pending action (200 -> 409 on replay) and rejects expired actions (400)', async () => {
    const makeProposal = async (title: string) => {
      chatCompletionMock
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: `call_${title}`,
              name: 'create_task',
              rawArguments: JSON.stringify({ title }),
              arguments: { title },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'Vui lòng xác nhận.',
          toolCalls: [],
        });

      const res = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ message: `Tạo ${title}` })
        .expect(200);
      return {
        conversationId: res.body.conversationId as number,
        actionId: res.body.pendingActions[0].id as number,
      };
    };

    // 1. Cancel flow
    const cancelTarget = await makeProposal(`AI Cancelable ${runId}`);
    await request(app.getHttpServer())
      .post(`/api/ai/actions/${cancelTarget.actionId}/cancel`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    const cancelRes = await request(app.getHttpServer())
      .post(`/api/ai/actions/${cancelTarget.actionId}/cancel`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(cancelRes.body.action.status).toBe(AiPendingActionStatus.CANCELLED);

    await request(app.getHttpServer())
      .post(`/api/ai/actions/${cancelTarget.actionId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    // 2. Expired action flow -> 400 on confirm and normalized on conversation read
    const expiredTarget = await makeProposal(`AI Expiring ${runId}`);
    await prisma.aiPendingAction.update({
      where: { id: expiredTarget.actionId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await request(app.getHttpServer())
      .post(`/api/ai/actions/${expiredTarget.actionId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    const convDetail = await request(app.getHttpServer())
      .get(`/api/ai/conversations/${expiredTarget.conversationId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(convDetail.body.pendingActions[0].status).toBe(AiPendingActionStatus.EXPIRED);
  });

  it('enforces full RBAC matrix: outsider 404, member content forbid + step transition, unfinished subtask DONE block, and permission drift ADMIN -> MEMBER', async () => {
    // 1. Outsider cannot update teamTaskId (tool sees NOT_FOUND)
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'out_upd',
            name: 'update_task',
            rawArguments: JSON.stringify({ taskId: teamTaskId, status: TaskStatus.IN_PROGRESS }),
            arguments: { taskId: teamTaskId, status: TaskStatus.IN_PROGRESS },
          },
        ],
      })
      .mockImplementationOnce(async (input) => {
        const toolMsg = JSON.parse(input.messages[input.messages.length - 1].content ?? '{}');
        expect(toolMsg).toMatchObject({ ok: false, code: 'NOT_FOUND' });
        return { content: 'Không tìm thấy công việc.', toolCalls: [] };
      });

    const outsiderRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ message: `Đổi trạng thái task ${teamTaskId}` })
      .expect(200);
    expect(outsiderRes.body.pendingActions).toEqual([]);

    // 2. Member assignee cannot edit content (FORBIDDEN), CAN transition TODO -> IN_PROGRESS
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'mem_content',
            name: 'update_task',
            rawArguments: JSON.stringify({ taskId: teamTaskId, title: 'Hack Title' }),
            arguments: { taskId: teamTaskId, title: 'Hack Title' },
          },
        ],
      })
      .mockImplementationOnce(async (input) => {
        const toolMsg = JSON.parse(input.messages[input.messages.length - 1].content ?? '{}');
        expect(toolMsg).toMatchObject({ ok: false, code: 'FORBIDDEN' });
        return { content: 'Bạn không có quyền sửa nội dung.', toolCalls: [] };
      });

    const memberForbidRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ message: 'Đổi tên công việc' })
      .expect(200);
    expect(memberForbidRes.body.pendingActions).toEqual([]);

    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'mem_step',
            name: 'update_task',
            rawArguments: JSON.stringify({ taskId: teamTaskId, status: TaskStatus.IN_PROGRESS }),
            arguments: { taskId: teamTaskId, status: TaskStatus.IN_PROGRESS },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Đã tạo đề xuất chuyển sang Đang làm.',
        toolCalls: [],
      });

    const memberStepRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ message: 'Chuyển công việc sang đang làm' })
      .expect(200);
    expect(memberStepRes.body.pendingActions).toHaveLength(1);
    const stepActionId = memberStepRes.body.pendingActions[0].id as number;

    const confirmStepRes = await request(app.getHttpServer())
      .post(`/api/ai/actions/${stepActionId}/confirm`)
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(200);
    expect(confirmStepRes.body.task.status).toBe(TaskStatus.IN_PROGRESS);

    // 3. Unfinished subtask blocks transition to DONE
    expect(teamSubtaskId).toBeGreaterThan(0);
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'done_block',
            name: 'update_task',
            rawArguments: JSON.stringify({ taskId: teamTaskId, status: TaskStatus.DONE }),
            arguments: { taskId: teamTaskId, status: TaskStatus.DONE },
          },
        ],
      })
      .mockImplementationOnce(async (input) => {
        const toolMsg = JSON.parse(input.messages[input.messages.length - 1].content ?? '{}');
        expect(toolMsg.ok).toBe(false);
        expect(toolMsg.code).toBe('BAD_REQUEST');
        expect(toolMsg.reason).toContain('công việc con');
        return { content: 'Vẫn còn công việc con chưa hoàn thành.', toolCalls: [] };
      });

    const doneBlockedRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: 'Hoàn thành công việc' })
      .expect(200);
    expect(doneBlockedRes.body.pendingActions).toEqual([]);

    // 4. Permission drift: ADMIN proposes content update, gets demoted to MEMBER before confirm -> 403 + FAILED
    const driftTitle = `Drift Title ${runId}`;
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'admin_edit',
            name: 'update_task',
            rawArguments: JSON.stringify({ taskId: teamTaskId, title: driftTitle }),
            arguments: { taskId: teamTaskId, title: driftTitle },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Đã tạo đề xuất đổi tiêu đề, vui lòng xác nhận.',
        toolCalls: [],
      });

    const adminProposeRes = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: `Đổi tên công việc thành ${driftTitle}` })
      .expect(200);
    expect(adminProposeRes.body.pendingActions).toHaveLength(1);
    const driftActionId = adminProposeRes.body.pendingActions[0].id as number;

    // Owner demotes admin -> MEMBER
    await request(app.getHttpServer())
      .patch(`/api/teams/${teamId}/members/${adminMemberRecordId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'MEMBER' })
      .expect(200);

    // Admin tries to confirm -> 403 Forbidden from TasksService.update, action marked FAILED
    await request(app.getHttpServer())
      .post(`/api/ai/actions/${driftActionId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    const failedAction = await prisma.aiPendingAction.findUnique({
      where: { id: driftActionId },
    });
    expect(failedAction?.status).toBe(AiPendingActionStatus.FAILED);
    expect(failedAction?.errorMessage).toBeTruthy();

    const taskAfterDrift = await prisma.task.findUnique({
      where: { id: teamTaskId },
    });
    expect(taskAfterDrift?.title).toBe(`AI Team Task ${runId}`);
  });
});
