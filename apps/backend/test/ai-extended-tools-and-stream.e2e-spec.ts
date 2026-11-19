import {
  BadGatewayException,
  type INestApplication,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AiActionType,
  AiPendingActionStatus,
  TaskPriority,
  TaskStatus,
  TeamRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
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
import { configureTestApp } from './test-app.helper.js';

interface ParsedSseEvent {
  event: string;
  data: Record<string, unknown>;
}

function parseSseFrames(rawText: string): ParsedSseEvent[] {
  const frames: ParsedSseEvent[] = [];
  const normalized = rawText.replaceAll('\r\n', '\n');
  for (const block of normalized.split('\n\n')) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    if (dataLines.length > 0) {
      const joined = dataLines.join('\n');
      frames.push({
        event: eventName,
        data: JSON.parse(joined) as Record<string, unknown>,
      });
    }
  }
  return frames;
}

describe('AI Extended Tools, RBAC & SSE Streaming (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

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

  let ownerId: number;
  let ownerToken: string;
  let adminToken: string;
  let creatorId: number;
  let creatorToken: string;
  let memberId: number;
  let memberToken: string;
  let collaboratorId: number;
  let collaboratorToken: string;
  let candidateId: number;
  let candidateEmail: string;
  let candidateToken: string;
  let outsiderToken: string;

  let teamId: number;
  let categoryId: number;

  const createdUserIds: number[] = [];

  async function mockSingleToolCallAndInspect(
    toolName: string,
    args: Record<string, unknown>,
    onToolResult?: (toolOutput: Record<string, unknown>) => void,
    finalReply = 'Đã xử lý xong.',
  ) {
    chatCompletionMock
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: `call_${toolName}_${Date.now()}`,
            name: toolName,
            rawArguments: JSON.stringify(args),
            arguments: args,
          },
        ],
      })
      .mockImplementationOnce(async (input) => {
        const lastToolMsg = input.messages[input.messages.length - 1];
        const parsed = JSON.parse(lastToolMsg?.content ?? '{}') as Record<string, unknown>;
        onToolResult?.(parsed);
        return {
          content: finalReply,
          toolCalls: [],
        };
      });
  }

  async function chatSingleTool(
    token: string,
    message: string,
    toolName: string,
    args: Record<string, unknown>,
    onToolResult?: (toolOutput: Record<string, unknown>) => void,
  ) {
    await mockSingleToolCallAndInspect(toolName, args, onToolResult);
    const res = await request(app.getHttpServer())
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ message })
      .expect(200);
    return res.body as {
      conversationId: number;
      pendingActions: Array<{
        id: number;
        actionType: AiActionType;
        status: AiPendingActionStatus;
        preview: Record<string, unknown>;
      }>;
    };
  }

  async function proposeAndExpectBlocked(
    token: string,
    message: string,
    toolName: string,
    args: Record<string, unknown>,
    expectedCode: 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'CONFLICT',
  ) {
    let observedToolOutput: Record<string, unknown> | undefined;
    const body = await chatSingleTool(token, message, toolName, args, (output) => {
      observedToolOutput = output;
    });
    expect(observedToolOutput).toMatchObject({ ok: false, code: expectedCode });
    expect(body.pendingActions).toEqual([]);
    return observedToolOutput;
  }

  async function proposeAndConfirm(
    token: string,
    message: string,
    toolName: string,
    args: Record<string, unknown>,
  ) {
    const body = await chatSingleTool(token, message, toolName, args);
    expect(body.pendingActions).toHaveLength(1);
    const action = body.pendingActions[0];
    const confirmRes = await request(app.getHttpServer())
      .post(`/api/ai/actions/${action.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return {
      action,
      confirmBody: confirmRes.body as {
        action: { id: number; status: AiPendingActionStatus; executedTaskId: number | null };
        task: Record<string, unknown> | null;
      },
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(AiProviderRegistry)
      .useValue(mockProviderRegistry)
      .compile();

    app = configureTestApp(moduleFixture.createNestApplication());
    await app.listen(0);
    const addr = (app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${addr.port}`;

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash(password, 10);

    const createUserAndLogin = async (prefix: string) => {
      const email = `ai_ext_${prefix}_${runId}@taskflow.test`;
      const user = await prisma.user.create({
        data: { name: `AI Ext ${prefix}`, email, passwordHash },
      });
      createdUserIds.push(user.id);
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200);
      return { id: user.id, email, token: loginRes.body.accessToken as string };
    };

    const owner = await createUserAndLogin('owner');
    ownerId = owner.id;
    ownerToken = owner.token;

    const admin = await createUserAndLogin('admin');
    adminToken = admin.token;

    const creator = await createUserAndLogin('creator');
    creatorId = creator.id;
    creatorToken = creator.token;

    const member = await createUserAndLogin('member');
    memberId = member.id;
    memberToken = member.token;

    const collaborator = await createUserAndLogin('collab');
    collaboratorId = collaborator.id;
    collaboratorToken = collaborator.token;

    const candidate = await createUserAndLogin('candidate');
    candidateId = candidate.id;
    candidateEmail = candidate.email;
    candidateToken = candidate.token;

    const outsider = await createUserAndLogin('outsider');
    outsiderToken = outsider.token;

    const teamRes = await request(app.getHttpServer())
      .post('/api/teams')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `AI Ext Team ${runId}`, description: 'Extended E2E Team' })
      .expect(201);
    teamId = teamRes.body.id as number;

    const initialMembers = [
      { email: admin.email, role: TeamRole.ADMIN },
      { email: creator.email, role: TeamRole.MEMBER },
      { email: member.email, role: TeamRole.MEMBER },
      { email: collaborator.email, role: TeamRole.MEMBER },
    ];
    for (const item of initialMembers) {
      await request(app.getHttpServer())
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(item)
        .expect(201);
    }

    const catRes = await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `AI Ext Cat ${runId}`, color: '#52c41a', teamId })
      .expect(201);
    categoryId = catRes.body.id as number;
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
        where: {
          OR: [
            { userId: { in: createdUserIds } },
            ...(teamId !== undefined ? [{ teamId }] : []),
          ],
        },
      });
      await prisma.category.deleteMany({
        where: {
          OR: [
            { userId: { in: createdUserIds } },
            ...(teamId !== undefined ? [{ teamId }] : []),
          ],
        },
      });
      if (teamId !== undefined) {
        await prisma.team.deleteMany({ where: { id: teamId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    if (app) {
      await app.close();
    }
  });

  it('validates POST /api/ai/chat/stream pre-stream errors (401, 400, 503, 404) as JSON before flushing SSE', async () => {
    // 401 unauthenticated
    await request(app.getHttpServer())
      .post('/api/ai/chat/stream')
      .send({ message: 'Xin chào' })
      .expect(401);

    // 400 invalid DTO
    await request(app.getHttpServer())
      .post('/api/ai/chat/stream')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: '   ' })
      .expect(400);

    // 503 unconfigured AI provider (JSON before headers flushed)
    mockConfigured = false;
    const res503 = await request(app.getHttpServer())
      .post('/api/ai/chat/stream')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ message: 'Stream test 503' })
      .expect(503);
    expect(res503.headers['content-type']).toContain('application/json');

    // 404 outsider conversationId (JSON before headers flushed)
    mockConfigured = true;
    const convRes = await request(app.getHttpServer())
      .post('/api/ai/conversations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const ownerConvId = convRes.body.id as number;

    const res404 = await request(app.getHttpServer())
      .post('/api/ai/chat/stream')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ conversationId: ownerConvId, message: 'Đọc trộm stream' })
      .expect(404);
    expect(res404.headers['content-type']).toContain('application/json');

    const msgCount = await prisma.aiMessage.count({ where: { conversationId: ownerConvId } });
    expect(msgCount).toBe(0);
  });

  it('streams SSE events (meta, tool_start, tool_result, pending_action, delta, done) and cleans up mid-stream errors & aborts', async () => {
    const streamTaskTitle = `Stream Task ${runId}`;
    let round = 0;

    chatCompletionStreamMock.mockImplementation(async (_input, onDelta) => {
      round += 1;
      if (round === 1) {
        return {
          content: null,
          toolCalls: [{ id: 'st_1', name: 'list_teams', rawArguments: '{}', arguments: {} }],
        };
      }
      if (round === 2) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'st_2',
              name: 'create_task',
              rawArguments: JSON.stringify({
                title: streamTaskTitle,
                teamId,
                categoryId,
                priority: TaskPriority.HIGH,
              }),
              arguments: {
                title: streamTaskTitle,
                teamId,
                categoryId,
                priority: TaskPriority.HIGH,
              },
            },
          ],
        };
      }
      onDelta('Tôi đã ');
      onDelta('tạo thẻ ');
      onDelta('đề xuất.');
      return {
        content: 'Tôi đã tạo thẻ đề xuất.',
        toolCalls: [],
      };
    });

    const sseRes = await fetch(`${baseUrl}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `Tạo việc stream ${streamTaskTitle}` }),
    });

    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');
    expect(sseRes.headers.get('cache-control')).toContain('no-cache');
    expect(sseRes.headers.get('x-accel-buffering')).toBe('no');

    const rawBody = await sseRes.text();
    const events = parseSseFrames(rawBody);

    expect(events.map((e) => e.event)).toEqual([
      'meta',
      'tool_start',
      'tool_result',
      'tool_start',
      'tool_result',
      'pending_action',
      'delta',
      'delta',
      'delta',
      'done',
    ]);

    const metaConvId = events[0].data.conversationId as number;
    expect(metaConvId).toBeGreaterThan(0);
    expect(events[1].data).toEqual({ name: 'list_teams' });
    expect(events[2].data).toMatchObject({ name: 'list_teams', ok: true });
    expect(events[3].data).toEqual({ name: 'create_task' });
    expect(events[4].data).toMatchObject({ name: 'create_task', ok: true });
    expect(events[5].data.action).toMatchObject({
      actionType: AiActionType.CREATE_TASK,
      status: AiPendingActionStatus.PENDING,
    });
    expect(events.slice(6, 9).map((e) => e.data.text)).toEqual(['Tôi đã ', 'tạo thẻ ', 'đề xuất.']);

    const donePayload = events[9].data as {
      conversationId: number;
      assistantMessage: { id: number; content: string; pendingActions: Array<{ id: number }> };
      pendingActions: Array<{ id: number; messageId: number | null }>;
    };
    expect(donePayload.conversationId).toBe(metaConvId);
    expect(donePayload.assistantMessage.content).toBe('Tôi đã tạo thẻ đề xuất.');
    expect(donePayload.pendingActions).toHaveLength(1);
    expect(donePayload.pendingActions[0].messageId).toBe(donePayload.assistantMessage.id);

    const persistedActions = await prisma.aiPendingAction.findMany({
      where: { conversationId: metaConvId },
    });
    expect(persistedActions).toHaveLength(1);
    expect(persistedActions[0].messageId).toBe(donePayload.assistantMessage.id);

    // Mid-stream provider error: emits event: error and deletes newly created conversation, user message, and pending action
    const errPrompt = `Stream Error Orphan ${runId}`;
    let errRound = 0;
    chatCompletionStreamMock.mockReset();
    chatCompletionStreamMock.mockImplementation(async () => {
      errRound += 1;
      if (errRound === 1) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'err_call',
              name: 'create_task',
              rawArguments: JSON.stringify({ title: `Should Cleanup ${runId}`, teamId }),
              arguments: { title: `Should Cleanup ${runId}`, teamId },
            },
          ],
        };
      }
      throw new BadGatewayException('Upstream stream dropped');
    });

    const errSseRes = await fetch(`${baseUrl}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: errPrompt }),
    });
    expect(errSseRes.status).toBe(200);
    const errEvents = parseSseFrames(await errSseRes.text());
    const errMetaConvId = errEvents[0].data.conversationId as number;
    expect(errEvents[errEvents.length - 1]).toMatchObject({
      event: 'error',
      data: { statusCode: 502 },
    });
    expect(errEvents.some((e) => e.event === 'done')).toBe(false);

    expect(
      await prisma.aiConversation.findUnique({ where: { id: errMetaConvId } }),
    ).toBeNull();
    expect(
      await prisma.aiMessage.count({ where: { conversationId: errMetaConvId } }),
    ).toBe(0);
    expect(
      await prisma.aiPendingAction.count({ where: { conversationId: errMetaConvId } }),
    ).toBe(0);

    // Client abort mid-stream over HTTP closes response and triggers DB cleanup
    const abortPrompt = `Abort Client Disconnect ${runId}`;
    let abortRound = 0;
    let resolveWaiter: (() => void) | undefined;
    const providerNotifiedAbort = new Promise<void>((resolve) => {
      resolveWaiter = resolve;
    });

    chatCompletionStreamMock.mockReset();
    chatCompletionStreamMock.mockImplementation(async (input) => {
      abortRound += 1;
      if (abortRound === 1) {
        return {
          content: null,
          toolCalls: [
            {
              id: 'abort_call',
              name: 'create_task',
              rawArguments: JSON.stringify({ title: `Abort Cleanup ${runId}`, teamId }),
              arguments: { title: `Abort Cleanup ${runId}`, teamId },
            },
          ],
        };
      }
      return new Promise<AiCompletionResult>((resolve) => {
        const timer = setTimeout(() => {
          resolve({ content: 'Late reply', toolCalls: [] });
        }, 3000);
        input.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolveWaiter?.();
            resolve({ content: null, toolCalls: [] });
          },
          { once: true },
        );
      });
    });

    const clientAbort = new AbortController();
    const abortRes = await fetch(`${baseUrl}/api/ai/chat/stream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: abortPrompt }),
      signal: clientAbort.signal,
    });
    const reader = abortRes.body!.getReader();
    const decoder = new TextDecoder();
    let streamedSoFar = '';
    while (!streamedSoFar.includes('pending_action')) {
      const { value, done } = await reader.read();
      if (done) break;
      streamedSoFar += decoder.decode(value, { stream: true });
    }
    const abortedConvId = parseSseFrames(streamedSoFar)[0].data.conversationId as number;
    clientAbort.abort();
    await providerNotifiedAbort;

    // Wait deterministically for the catch-block cleanup transaction/queries to commit
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const remainingConv = await prisma.aiConversation.findUnique({
        where: { id: abortedConvId },
      });
      if (!remainingConv) break;
      await new Promise((r) => setTimeout(r, 25));
    }

    expect(
      await prisma.aiConversation.findUnique({ where: { id: abortedConvId } }),
    ).toBeNull();
    expect(
      await prisma.aiPendingAction.count({ where: { conversationId: abortedConvId } }),
    ).toBe(0);
  });

  it('covers delete_task -> list_trash_tasks -> restore_task lifecycle and RBAC enforcement', async () => {
    // Creator (MEMBER) creates a task assigned to member
    const createRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: `Trash Lifecycle ${runId}`,
        teamId,
        assigneeId: memberId,
        priority: TaskPriority.MEDIUM,
      })
      .expect(201);
    const trashTaskId = createRes.body.id as number;

    // Non-creator MEMBER (even though assignee) is blocked on delete_task
    await proposeAndExpectBlocked(
      memberToken,
      'Xóa công việc không phải của mình',
      'delete_task',
      { taskId: trashTaskId },
      'FORBIDDEN',
    );

    // Creator (MEMBER) can propose & confirm delete_task -> soft-deleted
    const { action: deleteAction } = await proposeAndConfirm(
      creatorToken,
      'Xóa công việc của tôi',
      'delete_task',
      { taskId: trashTaskId },
    );
    expect(deleteAction.actionType).toBe(AiActionType.DELETE_TASK);
    expect(deleteAction.preview).toMatchObject({
      kind: 'DELETE_TASK',
      taskId: trashTaskId,
    });

    const softDeleted = await prisma.task.findUnique({ where: { id: trashTaskId } });
    expect(softDeleted?.deletedAt).not.toBeNull();

    // list_trash_tasks lists the deleted task
    let trashResult: Record<string, unknown> | undefined;
    await chatSingleTool(
      ownerToken,
      'Xem thùng rác nhóm',
      'list_trash_tasks',
      { teamId },
      (out) => {
        trashResult = out;
      },
    );
    const trashIds = ((trashResult?.tasks as Array<{ id: number }>) ?? []).map((t) => t.id);
    expect(trashIds).toContain(trashTaskId);

    // Creator (non-admin MEMBER) is blocked on restore_task
    await proposeAndExpectBlocked(
      creatorToken,
      'Khôi phục công việc tôi đã xóa',
      'restore_task',
      { taskId: trashTaskId },
      'FORBIDDEN',
    );

    // Admin/Owner can propose & confirm restore_task -> restored
    const { action: restoreAction, confirmBody } = await proposeAndConfirm(
      adminToken,
      'Khôi phục công việc trong thùng rác',
      'restore_task',
      { taskId: trashTaskId },
    );
    expect(restoreAction.actionType).toBe(AiActionType.RESTORE_TASK);
    expect(confirmBody.task).toMatchObject({ id: trashTaskId, title: `Trash Lifecycle ${runId}` });

    const restoredInDb = await prisma.task.findUnique({ where: { id: trashTaskId } });
    expect(restoredInDb?.deletedAt).toBeNull();
  });

  it('covers create_subtask, update_subtask, delete_subtask RBAC, TODO->DONE skip block, and parent DONE lock', async () => {
    // Owner creates parent task assigned to member
    const parentRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: `Subtask Parent ${runId}`,
        teamId,
        assigneeId: memberId,
      })
      .expect(201);
    const parentTaskId = parentRes.body.id as number;

    // Move parent to IN_PROGRESS so it can later move to DONE cleanly
    await request(app.getHttpServer())
      .patch(`/api/tasks/${parentTaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    // Invite & accept collaborator
    await request(app.getHttpServer())
      .post(`/api/tasks/${parentTaskId}/collaborators`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: collaboratorId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/tasks/${parentTaskId}/collaborators/respond`)
      .set('Authorization', `Bearer ${collaboratorToken}`)
      .send({ action: 'ACCEPT' })
      .expect(201);

    // Collaborator cannot create subtask (only manager: owner/admin/creator/assignee)
    await proposeAndExpectBlocked(
      collaboratorToken,
      'Thêm subtask hộ manager',
      'create_subtask',
      { taskId: parentTaskId, title: 'Unauthorized Subtask' },
      'FORBIDDEN',
    );

    // Manager (owner) creates subtask assigned to accepted collaborator
    const { action: createSubAction, confirmBody: createSubConfirm } = await proposeAndConfirm(
      ownerToken,
      'Tạo công việc con cho collaborator',
      'create_subtask',
      {
        taskId: parentTaskId,
        title: 'Triển khai API con',
        assigneeId: collaboratorId,
      },
    );
    expect(createSubAction.actionType).toBe(AiActionType.CREATE_SUBTASK);
    const createdSubtasks = (createSubConfirm.task?.subtasks as Array<{ id: number; title: string }>) ?? [];
    expect(createdSubtasks).toHaveLength(1);
    const subtaskId = createdSubtasks[0].id;

    // Manager & Collaborator both blocked from skipping TODO -> DONE directly (BAD_REQUEST / 400)
    await proposeAndExpectBlocked(
      ownerToken,
      'Nhảy cóc TODO -> DONE',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, status: TaskStatus.DONE },
      'BAD_REQUEST',
    );
    await proposeAndExpectBlocked(
      collaboratorToken,
      'Collab nhảy cóc TODO -> DONE',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, status: TaskStatus.DONE },
      'BAD_REQUEST',
    );

    // Collaborator cannot edit subtask content (title)
    await proposeAndExpectBlocked(
      collaboratorToken,
      'Collab tự đổi tên subtask',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, title: 'Renamed By Collab' },
      'FORBIDDEN',
    );

    // Collaborator CAN transition TODO -> IN_PROGRESS
    await proposeAndConfirm(
      collaboratorToken,
      'Bắt đầu làm subtask',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, status: TaskStatus.IN_PROGRESS },
    );

    // Collaborator CAN transition IN_PROGRESS -> DONE
    await proposeAndConfirm(
      collaboratorToken,
      'Hoàn thành subtask',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, status: TaskStatus.DONE },
    );

    const subAfterDone = await prisma.subtask.findUnique({ where: { id: subtaskId } });
    expect(subAfterDone?.status).toBe(TaskStatus.DONE);

    // Propose a new subtask while parent is IN_PROGRESS, then complete parent before confirm -> confirm fails with 400
    const staleProposalChat = await chatSingleTool(
      ownerToken,
      'Đề xuất thêm subtask trước khi đóng task cha',
      'create_subtask',
      { taskId: parentTaskId, title: 'Stale Subtask After Done' },
    );
    const staleCreateSubActionId = staleProposalChat.pendingActions[0].id;

    // Manager completes parent task -> parent DONE lock kicks in
    await request(app.getHttpServer())
      .patch(`/api/tasks/${parentTaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.DONE })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/ai/actions/${staleCreateSubActionId}/confirm`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);

    const failedStaleAction = await prisma.aiPendingAction.findUnique({
      where: { id: staleCreateSubActionId },
    });
    expect(failedStaleAction?.status).toBe(AiPendingActionStatus.FAILED);

    // Parent DONE lock blocks create_subtask, reopening update_subtask, content edit, and delete_subtask
    await proposeAndExpectBlocked(
      ownerToken,
      'Thêm subtask khi cha đã DONE',
      'create_subtask',
      { taskId: parentTaskId, title: 'Locked Subtask' },
      'BAD_REQUEST',
    );
    await proposeAndExpectBlocked(
      ownerToken,
      'Sửa subtask khi cha đã DONE',
      'update_subtask',
      { taskId: parentTaskId, subtaskId, title: 'Edit When Done' },
      'BAD_REQUEST',
    );
    await proposeAndExpectBlocked(
      ownerToken,
      'Xóa subtask khi cha đã DONE',
      'delete_subtask',
      { taskId: parentTaskId, subtaskId },
      'BAD_REQUEST',
    );

    // Reopen parent to IN_PROGRESS -> collaborator still cannot delete, manager CAN delete_subtask
    await request(app.getHttpServer())
      .patch(`/api/tasks/${parentTaskId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    await proposeAndExpectBlocked(
      collaboratorToken,
      'Collab xóa subtask',
      'delete_subtask',
      { taskId: parentTaskId, subtaskId },
      'FORBIDDEN',
    );

    const { action: delSubAction } = await proposeAndConfirm(
      ownerToken,
      'Xóa subtask',
      'delete_subtask',
      { taskId: parentTaskId, subtaskId },
    );
    expect(delSubAction.actionType).toBe(AiActionType.DELETE_SUBTASK);

    const subAfterDelete = await prisma.subtask.findUnique({ where: { id: subtaskId } });
    expect(subAfterDelete?.deletedAt).not.toBeNull();
  });

  it('covers return_task: assignee returns with reason -> TODO + creator reassigned; blocks non-assignee and personal task', async () => {
    // Creator creates a team task assigned to member, move to IN_PROGRESS
    const teamTaskRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({
        title: `Returnable Task ${runId}`,
        teamId,
        assigneeId: memberId,
      })
      .expect(201);
    const returnTaskId = teamTaskRes.body.id as number;

    await request(app.getHttpServer())
      .patch(`/api/tasks/${returnTaskId}/status`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ status: TaskStatus.IN_PROGRESS })
      .expect(200);

    // Personal task blocked
    const personalRes = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ title: `Personal No Return ${runId}` })
      .expect(201);
    const personalTaskId = personalRes.body.id as number;

    await proposeAndExpectBlocked(
      memberToken,
      'Trả lại việc cá nhân',
      'return_task',
      { taskId: personalTaskId, reason: 'Không hợp lệ' },
      'BAD_REQUEST',
    );

    // Non-assignee (owner / creator) blocked
    await proposeAndExpectBlocked(
      ownerToken,
      'Owner trả lại việc của người khác',
      'return_task',
      { taskId: returnTaskId, reason: 'Không phải assignee' },
      'FORBIDDEN',
    );

    // Assignee proposes & confirms return_task -> status resets to TODO and assignee becomes creator
    const reason = 'Thiếu thông số kỹ thuật đầu vào';
    const { action: returnAction, confirmBody } = await proposeAndConfirm(
      memberToken,
      'Trả lại công việc cho người giao',
      'return_task',
      { taskId: returnTaskId, reason },
    );
    expect(returnAction.actionType).toBe(AiActionType.RETURN_TASK);
    expect(returnAction.preview).toMatchObject({
      kind: 'RETURN_TASK',
      taskId: returnTaskId,
      reason,
    });
    expect(confirmBody.task).toMatchObject({
      id: returnTaskId,
      status: TaskStatus.TODO,
      assignee: { id: creatorId },
    });

    const dbReturned = await prisma.task.findUnique({ where: { id: returnTaskId } });
    expect(dbReturned?.status).toBe(TaskStatus.TODO);
    expect(dbReturned?.assigneeId).toBe(creatorId);
  });

  it('covers add_team_member, update_team_member_role, and remove_team_member RBAC & lifecycle', async () => {
    // Admin blocked from adding an ADMIN
    await proposeAndExpectBlocked(
      adminToken,
      'Admin bổ nhiệm thêm ADMIN',
      'add_team_member',
      { teamId, email: candidateEmail, role: TeamRole.ADMIN },
      'FORBIDDEN',
    );

    // Admin CAN add candidate as MEMBER
    const { action: addAction } = await proposeAndConfirm(
      adminToken,
      'Admin thêm thành viên thường',
      'add_team_member',
      { teamId, email: candidateEmail, role: TeamRole.MEMBER },
    );
    expect(addAction.actionType).toBe(AiActionType.ADD_TEAM_MEMBER);

    const addedMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: candidateId } },
    });
    expect(addedMembership?.role).toBe(TeamRole.MEMBER);

    // Owner promotes candidate MEMBER -> ADMIN (validator maps memberUserId -> TeamMember.id)
    const { action: promoteAction } = await proposeAndConfirm(
      ownerToken,
      'Owner thăng chức lên ADMIN',
      'update_team_member_role',
      { teamId, memberUserId: candidateId, role: TeamRole.ADMIN },
    );
    expect(promoteAction.actionType).toBe(AiActionType.UPDATE_TEAM_MEMBER_ROLE);
    expect(promoteAction.preview).toMatchObject({
      kind: 'UPDATE_TEAM_MEMBER_ROLE',
      oldRole: TeamRole.MEMBER,
      newRole: TeamRole.ADMIN,
    });

    const promotedMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: candidateId } },
    });
    expect(promotedMembership?.role).toBe(TeamRole.ADMIN);

    // Admin blocked from removing another ADMIN
    await proposeAndExpectBlocked(
      adminToken,
      'Admin xóa một Admin khác',
      'remove_team_member',
      { teamId, memberUserId: candidateId },
      'FORBIDDEN',
    );

    // Owner demotes candidate ADMIN -> MEMBER
    await proposeAndConfirm(
      ownerToken,
      'Owner hạ cấp xuống MEMBER',
      'update_team_member_role',
      { teamId, memberUserId: candidateId, role: TeamRole.MEMBER },
    );

    const demotedMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: candidateId } },
    });
    expect(demotedMembership?.role).toBe(TeamRole.MEMBER);

    // Owner removal is blocked
    await proposeAndExpectBlocked(
      ownerToken,
      'Owner tự rời nhóm khi chưa chuyển quyền',
      'remove_team_member',
      { teamId, memberUserId: ownerId },
      'BAD_REQUEST',
    );
    await proposeAndExpectBlocked(
      adminToken,
      'Admin xóa Owner khỏi nhóm',
      'remove_team_member',
      { teamId, memberUserId: ownerId },
      'BAD_REQUEST',
    );

    // Non-owner (candidate) self-leave is allowed
    const { action: selfLeaveAction } = await proposeAndConfirm(
      candidateToken,
      'Tự rời khỏi nhóm',
      'remove_team_member',
      { teamId, memberUserId: candidateId },
    );
    expect(selfLeaveAction.actionType).toBe(AiActionType.REMOVE_TEAM_MEMBER);
    expect(selfLeaveAction.preview).toMatchObject({
      kind: 'REMOVE_TEAM_MEMBER',
      isSelfLeaving: true,
    });

    const afterLeave = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: candidateId } },
    });
    expect(afterLeave).toBeNull();
  });
});
