import { BadGatewayException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AiActionType, AiMessageRole, AiPendingActionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiAgentService, type AiStreamEvent } from '../ai-agent.service.js';

describe('AiAgentService', () => {
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
    aiConversation: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    aiMessage: {
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    aiPendingAction: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  let provider: {
    name: string;
    chatCompletion: ReturnType<typeof vi.fn>;
    chatCompletionStream: ReturnType<typeof vi.fn>;
  };

  let providerRegistry: {
    isConfigured: ReturnType<typeof vi.fn>;
    getStatus: ReturnType<typeof vi.fn>;
    getProvider: ReturnType<typeof vi.fn>;
  };

  let aiToolsService: {
    getToolDefinitions: ReturnType<typeof vi.fn>;
    executeTool: ReturnType<typeof vi.fn>;
  };

  let service: AiAgentService;

  const sampleTools = [
    {
      type: 'function',
      function: { name: 'list_teams', description: 'List teams', parameters: {} },
    },
    {
      type: 'function',
      function: { name: 'create_task', description: 'Create task', parameters: {} },
    },
  ];

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 7, name: 'Nguyễn Văn A' }),
      },
      aiConversation: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn(),
      },
      aiMessage: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      aiPendingAction: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    provider = {
      name: 'openai-compatible',
      chatCompletion: vi.fn(),
      chatCompletionStream: vi.fn(),
    };

    providerRegistry = {
      isConfigured: vi.fn().mockReturnValue(true),
      getStatus: vi.fn().mockReturnValue({
        configured: true,
        provider: 'openai-compatible',
        model: 'gpt-4o-mini',
      }),
      getProvider: vi.fn().mockReturnValue(provider),
    };

    aiToolsService = {
      getToolDefinitions: vi.fn().mockReturnValue(sampleTools),
      executeTool: vi.fn(),
    };

    service = new AiAgentService(
      prisma as never,
      providerRegistry as never,
      aiToolsService as never,
    );
  });

  it('throws 503 ServiceUnavailableException when AI provider is not configured', async () => {
    providerRegistry.isConfigured.mockReturnValue(false);
    providerRegistry.getProvider.mockImplementation(() => {
      throw new ServiceUnavailableException('AI assistant is not configured');
    });

    await expect(service.chat(7, { message: 'Hôm nay có việc gì?' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.aiConversation.create).not.toHaveBeenCalled();
    expect(prisma.aiMessage.create).not.toHaveBeenCalled();
  });

  it('includes Vietnam date (Asia/Ho_Chi_Minh YYYY-MM-DD) and user info in system prompt', async () => {
    const expectedVnToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.create.mockResolvedValue({
      id: 10,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });
    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 101,
        conversationId: 10,
        role: AiMessageRole.USER,
        content: 'Chào trợ lý',
        toolCallsSummary: null,
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: 102,
        conversationId: 10,
        role: AiMessageRole.ASSISTANT,
        content: 'Xin chào Nguyễn Văn A!',
        toolCallsSummary: null,
        createdAt: now,
      });

    provider.chatCompletion.mockResolvedValueOnce({
      content: 'Xin chào Nguyễn Văn A!',
      toolCalls: [],
      finishReason: 'stop',
    });

    await service.chat(7, { message: 'Chào trợ lý' });

    const callInput = provider.chatCompletion.mock.calls[0]?.[0];
    expect(callInput.messages[0].role).toBe('system');
    expect(callInput.messages[0].content).toContain(expectedVnToday);
    expect(callInput.messages[0].content).toContain('7');
    expect(callInput.messages[0].content).toContain('Nguyễn Văn A');
    expect(callInput.messages[0].content).toContain('Xác nhận');
    expect(callInput.messages[0].content).toContain('list_teams');
  });

  it('loads the last 20 AiMessage rows chronologically for context', async () => {
    const baseTime = new Date('2026-11-19T01:00:00.000Z');
    prisma.aiConversation.findFirst.mockResolvedValue({
      id: 15,
      userId: 7,
      title: 'Cuộc trò chuyện cũ',
      createdAt: baseTime,
      updatedAt: baseTime,
    });

    // Prisma returns newest-first when ordered desc
    const recentDesc = Array.from({ length: 20 }, (_, i) => {
      const idx = 20 - i; // 20 down to 1
      return {
        id: idx,
        conversationId: 15,
        role: idx % 2 === 1 ? AiMessageRole.USER : AiMessageRole.ASSISTANT,
        content: `Msg ${idx}`,
        toolCallsSummary: null,
        createdAt: new Date(baseTime.getTime() + idx * 1000),
      };
    });
    prisma.aiMessage.findMany.mockResolvedValue(recentDesc);

    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 21,
        conversationId: 15,
        role: AiMessageRole.USER,
        content: 'Câu hỏi mới',
        toolCallsSummary: null,
        createdAt: baseTime,
      })
      .mockResolvedValueOnce({
        id: 22,
        conversationId: 15,
        role: AiMessageRole.ASSISTANT,
        content: 'Trả lời mới',
        toolCallsSummary: null,
        createdAt: baseTime,
      });

    provider.chatCompletion.mockResolvedValueOnce({
      content: 'Trả lời mới',
      toolCalls: [],
      finishReason: 'stop',
    });

    await service.chat(7, { conversationId: 15, message: 'Câu hỏi mới' });

    expect(prisma.aiMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 15 },
        take: 20,
      }),
    );

    const sentMessages = provider.chatCompletion.mock.calls[0]?.[0]?.messages;
    // system + 20 history + 1 current user = 22
    expect(sentMessages).toHaveLength(22);
    expect(sentMessages[1]).toEqual({ role: 'user', content: 'Msg 1' });
    expect(sentMessages[2]).toEqual({ role: 'assistant', content: 'Msg 2' });
    expect(sentMessages[20]).toEqual({ role: 'assistant', content: 'Msg 20' });
    expect(sentMessages[21]).toEqual({ role: 'user', content: 'Câu hỏi mới' });
  });

  it('executes multi-step read -> write proposal loop, links pending actions, and sets conversation title up to 60 chars', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    const expiresAt = new Date('2026-11-19T03:10:00.000Z');
    const longPrompt =
      'Tạo giúp tôi một công việc mới trong nhóm Backend để rà soát bảo mật API tuần này nhé';

    prisma.aiConversation.create.mockResolvedValue({
      id: 42,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });

    const pendingRecord = {
      id: 501,
      userId: 7,
      conversationId: 42,
      messageId: null,
      actionType: AiActionType.CREATE_TASK,
      status: AiPendingActionStatus.PENDING,
      payload: { title: 'Rà soát bảo mật API', teamId: 3 },
      preview: { kind: 'CREATE_TASK', title: 'Rà soát bảo mật API' },
      executedTaskId: null,
      errorMessage: null,
      expiresAt,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    provider.chatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call_1',
            name: 'list_teams',
            rawArguments: '{}',
            arguments: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call_2',
            name: 'create_task',
            rawArguments: '{"title":"Rà soát bảo mật API","teamId":3}',
            arguments: { title: 'Rà soát bảo mật API', teamId: 3 },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Tôi đã chuẩn bị thẻ đề xuất tạo công việc. Vui lòng bấm Xác nhận để lưu.',
        toolCalls: [],
      });

    aiToolsService.executeTool
      .mockResolvedValueOnce({
        ok: true,
        data: { total: 1, teams: [{ id: 3, name: 'Backend' }] },
        summary: 'Đã liệt kê 1 nhóm làm việc',
      })
      .mockResolvedValueOnce({
        ok: true,
        data: { ok: true, requiresConfirmation: true, actionId: 501 },
        pendingAction: pendingRecord,
        summary: 'Đã tạo đề xuất tạo công việc "Rà soát bảo mật API"',
      });

    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 201,
        conversationId: 42,
        role: AiMessageRole.USER,
        content: longPrompt,
        toolCallsSummary: null,
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: 202,
        conversationId: 42,
        role: AiMessageRole.ASSISTANT,
        content: 'Tôi đã chuẩn bị thẻ đề xuất tạo công việc. Vui lòng bấm Xác nhận để lưu.',
        toolCallsSummary: [
          { name: 'list_teams', ok: true, summary: 'Đã liệt kê 1 nhóm làm việc' },
          {
            name: 'create_task',
            ok: true,
            summary: 'Đã tạo đề xuất tạo công việc "Rà soát bảo mật API"',
          },
        ],
        createdAt: now,
      });

    const result = await service.chat(7, { message: longPrompt });

    expect(aiToolsService.executeTool).toHaveBeenCalledTimes(2);
    expect(aiToolsService.executeTool).toHaveBeenNthCalledWith(
      1,
      { userId: 7, conversationId: 42 },
      'list_teams',
      {},
    );
    expect(aiToolsService.executeTool).toHaveBeenNthCalledWith(
      2,
      { userId: 7, conversationId: 42 },
      'create_task',
      { title: 'Rà soát bảo mật API', teamId: 3 },
    );

    expect(prisma.aiPendingAction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [501] } },
      data: { messageId: 202 },
    });

    expect(prisma.aiConversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42 },
        data: expect.objectContaining({
          title: longPrompt.slice(0, 60),
        }),
      }),
    );

    expect(result.conversationId).toBe(42);
    expect(result.pendingActions).toHaveLength(1);
    expect(result.pendingActions[0]).toMatchObject({
      id: 501,
      messageId: 202,
      status: 'PENDING',
    });
    expect((result.pendingActions[0] as unknown as Record<string, unknown>).payload).toBeUndefined();
    expect(result.assistantMessage.pendingActions).toHaveLength(1);
  });

  it('recovers from malformed tool call parseError and unknown tool calls without crashing', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.create.mockResolvedValue({
      id: 55,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });

    provider.chatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call_bad_json',
            name: 'create_task',
            rawArguments: '{broken json',
            arguments: {},
            parseError: 'Unexpected token b in JSON',
          },
          {
            id: 'call_unknown',
            name: 'non_existent_tool',
            rawArguments: '{}',
            arguments: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Xin lỗi, tôi cần bạn cung cấp lại tiêu đề công việc rõ hơn.',
        toolCalls: [],
      });

    aiToolsService.executeTool.mockResolvedValueOnce({
      ok: false,
      data: { ok: false, reason: "Công cụ 'non_existent_tool' không tồn tại" },
      summary: "Công cụ 'non_existent_tool' không tồn tại",
    });

    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 301,
        conversationId: 55,
        role: AiMessageRole.USER,
        content: 'Tạo task',
        toolCallsSummary: null,
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: 302,
        conversationId: 55,
        role: AiMessageRole.ASSISTANT,
        content: 'Xin lỗi, tôi cần bạn cung cấp lại tiêu đề công việc rõ hơn.',
        toolCallsSummary: [],
        createdAt: now,
      });

    const result = await service.chat(7, { message: 'Tạo task' });

    // parseError must NOT call executeTool
    expect(aiToolsService.executeTool).toHaveBeenCalledTimes(1);
    expect(aiToolsService.executeTool).toHaveBeenCalledWith(
      { userId: 7, conversationId: 55 },
      'non_existent_tool',
      {},
    );

    const secondRoundMessages = provider.chatCompletion.mock.calls[1]?.[0]?.messages;
    const badJsonToolMsg = secondRoundMessages.find(
      (m: { role: string; tool_call_id?: string }) =>
        m.role === 'tool' && m.tool_call_id === 'call_bad_json',
    );
    expect(JSON.parse(badJsonToolMsg.content)).toEqual({
      ok: false,
      reason: 'Tham số tool không phải JSON hợp lệ: Unexpected token b in JSON',
    });
    expect(result.assistantMessage.content).toContain('Xin lỗi');
  });

  it('enforces the 6-round cap and returns a safe fallback message', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.create.mockResolvedValue({
      id: 66,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });

    provider.chatCompletion.mockResolvedValue({
      content: null,
      toolCalls: [
        {
          id: 'loop_call',
          name: 'list_teams',
          rawArguments: '{}',
          arguments: {},
        },
      ],
    });

    aiToolsService.executeTool.mockResolvedValue({
      ok: true,
      data: { total: 0, teams: [] },
      summary: 'Đã liệt kê 0 nhóm làm việc',
    });

    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 401,
        conversationId: 66,
        role: AiMessageRole.USER,
        content: 'Kiểm tra liên tục',
        toolCallsSummary: null,
        createdAt: now,
      })
      .mockImplementationOnce(async ({ data }) => ({
        id: 402,
        conversationId: 66,
        role: AiMessageRole.ASSISTANT,
        content: data.content,
        toolCallsSummary: data.toolCallsSummary ?? null,
        createdAt: now,
      }));

    const result = await service.chat(7, { message: 'Kiểm tra liên tục' });

    expect(provider.chatCompletion).toHaveBeenCalledTimes(6);
    expect(provider.chatCompletion.mock.calls[0]?.[0]?.tools).toEqual(sampleTools);
    expect(provider.chatCompletion.mock.calls[4]?.[0]?.tools).toEqual(sampleTools);
    expect(provider.chatCompletion.mock.calls[5]?.[0]?.tools).toBeUndefined();
    expect(result.assistantMessage.content.length).toBeGreaterThan(0);
  });

  it('enforces the 15-tool-execution cap within a single turn', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.create.mockResolvedValue({
      id: 77,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });

    const twentyCalls = Array.from({ length: 20 }, (_, i) => ({
      id: `batch_call_${i}`,
      name: 'list_teams',
      rawArguments: '{}',
      arguments: {},
    }));

    provider.chatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: twentyCalls,
      })
      .mockResolvedValueOnce({
        content: 'Đã tổng hợp xong.',
        toolCalls: [],
      });

    aiToolsService.executeTool.mockResolvedValue({
      ok: true,
      data: { total: 0, teams: [] },
      summary: 'OK',
    });

    prisma.aiMessage.create
      .mockResolvedValueOnce({
        id: 411,
        conversationId: 77,
        role: AiMessageRole.USER,
        content: 'Chạy nhiều công cụ',
        toolCallsSummary: null,
        createdAt: now,
      })
      .mockImplementationOnce(async ({ data }) => ({
        id: 412,
        conversationId: 77,
        role: AiMessageRole.ASSISTANT,
        content: data.content,
        toolCallsSummary: data.toolCallsSummary ?? null,
        createdAt: now,
      }));

    const result = await service.chat(7, { message: 'Chạy nhiều công cụ' });

    expect(aiToolsService.executeTool).toHaveBeenCalledTimes(15);
    expect(provider.chatCompletion).toHaveBeenCalledTimes(2);
    expect(provider.chatCompletion.mock.calls[1]?.[0]?.tools).toBeUndefined();
    expect(result.assistantMessage.content).toBe('Đã tổng hợp xong.');
  });

  it('throws 404 NotFoundException when conversation does not exist or belongs to another user', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue(null);

    await expect(
      service.chat(7, { conversationId: 999, message: 'Hello' }),
    ).rejects.toThrow(NotFoundException);

    await expect(service.getConversation(7, 999)).rejects.toThrow(NotFoundException);

    prisma.aiConversation.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteConversation(7, 999)).rejects.toThrow(NotFoundException);
  });

  it('cleans up pending actions, user message, and newly created conversation on mid-loop BadGatewayException', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.create.mockResolvedValueOnce({
      id: 88,
      userId: 7,
      title: 'Cuộc trò chuyện mới',
      createdAt: now,
      updatedAt: now,
    });
    prisma.aiMessage.create.mockResolvedValueOnce({
      id: 501,
      conversationId: 88,
      role: AiMessageRole.USER,
      content: 'Tạo công việc mới',
      toolCallsSummary: null,
      createdAt: now,
    });

    const pendingRecord = {
      id: 701,
      userId: 7,
      conversationId: 88,
      messageId: null,
      actionType: AiActionType.CREATE_TASK,
      status: AiPendingActionStatus.PENDING,
      payload: { title: 'Task A' },
      preview: { kind: 'CREATE_TASK', title: 'Task A' },
      executedTaskId: null,
      errorMessage: null,
      expiresAt: now,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    provider.chatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call_create',
            name: 'create_task',
            rawArguments: '{"title":"Task A"}',
            arguments: { title: 'Task A' },
          },
        ],
      })
      .mockRejectedValueOnce(new BadGatewayException('AI provider upstream error'));

    aiToolsService.executeTool.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, requiresConfirmation: true, actionId: 701 },
      pendingAction: pendingRecord,
      summary: 'Đã tạo đề xuất',
    });

    await expect(service.chat(7, { message: 'Tạo công việc mới' })).rejects.toThrow(
      BadGatewayException,
    );

    expect(prisma.aiPendingAction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [701] }, status: AiPendingActionStatus.PENDING },
    });
    expect(prisma.aiMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: 501 },
    });
    expect(prisma.aiConversation.deleteMany).toHaveBeenCalledWith({
      where: { id: 88 },
    });
  });

  it('cleans up pending actions and user message without deleting existing conversation on mid-loop failure', async () => {
    const now = new Date('2026-11-19T03:00:00.000Z');
    prisma.aiConversation.findFirst.mockResolvedValueOnce({
      id: 99,
      userId: 7,
      title: 'Cuộc trò chuyện có sẵn',
      createdAt: now,
      updatedAt: now,
    });
    prisma.aiMessage.create.mockResolvedValueOnce({
      id: 502,
      conversationId: 99,
      role: AiMessageRole.USER,
      content: 'Tạo thêm công việc',
      toolCallsSummary: null,
      createdAt: now,
    });

    const pendingRecord = {
      id: 702,
      userId: 7,
      conversationId: 99,
      messageId: null,
      actionType: AiActionType.CREATE_TASK,
      status: AiPendingActionStatus.PENDING,
      payload: { title: 'Task B' },
      preview: { kind: 'CREATE_TASK', title: 'Task B' },
      executedTaskId: null,
      errorMessage: null,
      expiresAt: now,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    provider.chatCompletion
      .mockResolvedValueOnce({
        content: null,
        toolCalls: [
          {
            id: 'call_create_2',
            name: 'create_task',
            rawArguments: '{"title":"Task B"}',
            arguments: { title: 'Task B' },
          },
        ],
      })
      .mockRejectedValueOnce(new BadGatewayException('AI provider upstream error'));

    aiToolsService.executeTool.mockResolvedValueOnce({
      ok: true,
      data: { ok: true, requiresConfirmation: true, actionId: 702 },
      pendingAction: pendingRecord,
      summary: 'Đã tạo đề xuất',
    });

    await expect(
      service.chat(7, { conversationId: 99, message: 'Tạo thêm công việc' }),
    ).rejects.toThrow(BadGatewayException);

    expect(prisma.aiPendingAction.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [702] }, status: AiPendingActionStatus.PENDING },
    });
    expect(prisma.aiMessage.deleteMany).toHaveBeenCalledWith({
      where: { id: 502 },
    });
    expect(prisma.aiConversation.deleteMany).not.toHaveBeenCalled();
  });

  describe('assertCanStartStream & chatStream', () => {
    it('assertCanStartStream validates provider (503) and conversation ownership (404)', async () => {
      providerRegistry.getProvider.mockImplementationOnce(() => {
        throw new ServiceUnavailableException('AI assistant is not configured');
      });

      await expect(service.assertCanStartStream(7)).rejects.toThrow(
        ServiceUnavailableException,
      );

      prisma.aiConversation.findFirst.mockResolvedValueOnce(null);
      await expect(service.assertCanStartStream(7, 999)).rejects.toThrow(
        NotFoundException,
      );

      prisma.aiConversation.findFirst.mockResolvedValueOnce({ id: 12, userId: 7 });
      await expect(service.assertCanStartStream(7, 12)).resolves.toBeUndefined();
    });

    it('throws 503 / 404 before emitting meta or creating DB rows in chatStream', async () => {
      const events: AiStreamEvent[] = [];
      providerRegistry.getProvider.mockImplementationOnce(() => {
        throw new ServiceUnavailableException('AI assistant is not configured');
      });

      await expect(
        service.chatStream(7, { message: 'Stream test' }, (evt) => events.push(evt)),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(events).toEqual([]);
      expect(prisma.aiConversation.create).not.toHaveBeenCalled();

      prisma.aiConversation.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.chatStream(
          7,
          { conversationId: 999, message: 'Stream test' },
          (evt) => events.push(evt),
        ),
      ).rejects.toThrow(NotFoundException);
      expect(events).toEqual([]);
      expect(prisma.aiMessage.create).not.toHaveBeenCalled();
    });

    it('emits meta, tool_start, tool_result, pending_action, delta, and done in order and passes tools: undefined on final round', async () => {
      const now = new Date('2026-11-19T03:00:00.000Z');
      const expiresAt = new Date('2026-11-19T03:10:00.000Z');
      prisma.aiConversation.create.mockResolvedValueOnce({
        id: 120,
        userId: 7,
        title: 'Cuộc trò chuyện mới',
        createdAt: now,
        updatedAt: now,
      });

      const pendingRecord = {
        id: 801,
        userId: 7,
        conversationId: 120,
        messageId: null,
        actionType: AiActionType.CREATE_TASK,
        status: AiPendingActionStatus.PENDING,
        payload: { title: 'Task Stream' },
        preview: { kind: 'CREATE_TASK', title: 'Task Stream' },
        executedTaskId: null,
        errorMessage: null,
        expiresAt,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      let roundCounter = 0;
      provider.chatCompletionStream.mockImplementation(async (input, onDelta) => {
        roundCounter += 1;
        if (roundCounter <= 5) {
          if (roundCounter === 1) {
            return {
              content: null,
              toolCalls: [
                { id: 's_call_1', name: 'list_teams', rawArguments: '{}', arguments: {} },
              ],
            };
          }
          if (roundCounter === 2) {
            return {
              content: null,
              toolCalls: [
                {
                  id: 's_call_2',
                  name: 'create_task',
                  rawArguments: '{"title":"Task Stream"}',
                  arguments: { title: 'Task Stream' },
                },
              ],
            };
          }
          onDelta('Đang ');
          onDelta('hoàn tất.');
          return {
            content: 'Đang hoàn tất.',
            toolCalls: [],
          };
        }
        return { content: 'Done', toolCalls: [] };
      });

      aiToolsService.executeTool
        .mockResolvedValueOnce({
          ok: true,
          data: { total: 1, teams: [{ id: 1, name: 'Core' }] },
          summary: 'Đã liệt kê 1 nhóm làm việc',
        })
        .mockResolvedValueOnce({
          ok: true,
          data: { ok: true, requiresConfirmation: true, actionId: 801 },
          pendingAction: pendingRecord,
          summary: 'Đã tạo đề xuất tạo công việc "Task Stream"',
        });

      prisma.aiMessage.create
        .mockResolvedValueOnce({
          id: 901,
          conversationId: 120,
          role: AiMessageRole.USER,
          content: 'Tạo công việc stream',
          toolCallsSummary: null,
          createdAt: now,
        })
        .mockResolvedValueOnce({
          id: 902,
          conversationId: 120,
          role: AiMessageRole.ASSISTANT,
          content: 'Đang hoàn tất.',
          toolCallsSummary: [
            { name: 'list_teams', ok: true, summary: 'Đã liệt kê 1 nhóm làm việc' },
            {
              name: 'create_task',
              ok: true,
              summary: 'Đã tạo đề xuất tạo công việc "Task Stream"',
            },
          ],
          createdAt: now,
        });

      const events: AiStreamEvent[] = [];
      const controller = new AbortController();
      const response = await service.chatStream(
        7,
        { message: 'Tạo công việc stream' },
        (evt) => events.push(evt),
        controller.signal,
      );

      expect(events.map((e) => e.event)).toEqual([
        'meta',
        'tool_start',
        'tool_result',
        'tool_start',
        'tool_result',
        'pending_action',
        'delta',
        'delta',
        'done',
      ]);
      expect(events[0]).toEqual({ event: 'meta', data: { conversationId: 120 } });
      expect(events[5]).toMatchObject({
        event: 'pending_action',
        data: { action: { id: 801, actionType: AiActionType.CREATE_TASK } },
      });
      expect(events[6]).toEqual({ event: 'delta', data: { text: 'Đang ' } });
      expect(events[7]).toEqual({ event: 'delta', data: { text: 'hoàn tất.' } });
      expect(events[8]).toEqual({ event: 'done', data: response });
      expect(provider.chatCompletionStream.mock.calls[0]?.[0]?.signal).toBe(controller.signal);
      expect(provider.chatCompletionStream.mock.calls[0]?.[0]?.tools).toEqual(sampleTools);
      expect(prisma.aiPendingAction.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [801] } },
        data: { messageId: 902 },
      });
    });

    it('passes tools: undefined on round MAX_AGENT_ROUNDS - 1 in chatStream', async () => {
      const now = new Date('2026-11-19T03:00:00.000Z');
      prisma.aiConversation.create.mockResolvedValueOnce({
        id: 121,
        userId: 7,
        title: 'Cuộc trò chuyện mới',
        createdAt: now,
        updatedAt: now,
      });

      provider.chatCompletionStream.mockImplementation(async () => ({
        content: null,
        toolCalls: [{ id: 'loop', name: 'list_teams', rawArguments: '{}', arguments: {} }],
      }));

      aiToolsService.executeTool.mockResolvedValue({
        ok: true,
        data: { total: 0, teams: [] },
        summary: 'OK',
      });

      prisma.aiMessage.create
        .mockResolvedValueOnce({
          id: 911,
          conversationId: 121,
          role: AiMessageRole.USER,
          content: 'Loop stream',
          toolCallsSummary: null,
          createdAt: now,
        })
        .mockImplementationOnce(async ({ data }) => ({
          id: 912,
          conversationId: 121,
          role: AiMessageRole.ASSISTANT,
          content: data.content,
          toolCallsSummary: data.toolCallsSummary ?? null,
          createdAt: now,
        }));

      const events: AiStreamEvent[] = [];
      const res = await service.chatStream(7, { message: 'Loop stream' }, (e) => events.push(e));

      expect(provider.chatCompletionStream).toHaveBeenCalledTimes(6);
      expect(provider.chatCompletionStream.mock.calls[4]?.[0]?.tools).toEqual(sampleTools);
      expect(provider.chatCompletionStream.mock.calls[5]?.[0]?.tools).toBeUndefined();
      expect(events[events.length - 1]?.event).toBe('done');
      expect(res.assistantMessage.content.length).toBeGreaterThan(0);
    });

    it('aborts on AbortSignal mid-stream and cleans up newly created conversation, user message, and pending actions', async () => {
      const now = new Date('2026-11-19T03:00:00.000Z');
      const controller = new AbortController();

      prisma.aiConversation.create.mockResolvedValueOnce({
        id: 130,
        userId: 7,
        title: 'Cuộc trò chuyện mới',
        createdAt: now,
        updatedAt: now,
      });
      prisma.aiMessage.create.mockResolvedValueOnce({
        id: 920,
        conversationId: 130,
        role: AiMessageRole.USER,
        content: 'Abort test',
        toolCallsSummary: null,
        createdAt: now,
      });

      const pendingRecord = {
        id: 820,
        userId: 7,
        conversationId: 130,
        messageId: null,
        actionType: AiActionType.CREATE_TASK,
        status: AiPendingActionStatus.PENDING,
        payload: { title: 'Orphan Task' },
        preview: { kind: 'CREATE_TASK', title: 'Orphan Task' },
        executedTaskId: null,
        errorMessage: null,
        expiresAt: now,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      provider.chatCompletionStream
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call_orphan',
              name: 'create_task',
              rawArguments: '{"title":"Orphan Task"}',
              arguments: { title: 'Orphan Task' },
            },
          ],
        })
        .mockImplementationOnce(async (_input, onDelta) => {
          onDelta('Partial ');
          controller.abort();
          return { content: 'Partial ', toolCalls: [] };
        });

      aiToolsService.executeTool.mockResolvedValueOnce({
        ok: true,
        data: { ok: true, requiresConfirmation: true, actionId: 820 },
        pendingAction: pendingRecord,
        summary: 'Đã tạo đề xuất',
      });

      const events: AiStreamEvent[] = [];
      await expect(
        service.chatStream(
          7,
          { message: 'Abort test' },
          (evt) => events.push(evt),
          controller.signal,
        ),
      ).rejects.toThrow();

      expect(events.some((e) => e.event === 'done')).toBe(false);
      expect(prisma.aiPendingAction.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [820] }, status: AiPendingActionStatus.PENDING },
      });
      expect(prisma.aiMessage.deleteMany).toHaveBeenCalledWith({
        where: { id: 920 },
      });
      expect(prisma.aiConversation.deleteMany).toHaveBeenCalledWith({
        where: { id: 130 },
      });
    });

    it('cleans up user message and pending actions without deleting existing conversation on mid-stream provider failure', async () => {
      const now = new Date('2026-11-19T03:00:00.000Z');
      prisma.aiConversation.findFirst.mockResolvedValueOnce({
        id: 140,
        userId: 7,
        title: 'Cuộc trò chuyện có sẵn',
        createdAt: now,
        updatedAt: now,
      });
      prisma.aiMessage.create.mockResolvedValueOnce({
        id: 930,
        conversationId: 140,
        role: AiMessageRole.USER,
        content: 'Mid-stream fail',
        toolCallsSummary: null,
        createdAt: now,
      });

      const pendingRecord = {
        id: 830,
        userId: 7,
        conversationId: 140,
        messageId: null,
        actionType: AiActionType.CREATE_TASK,
        status: AiPendingActionStatus.PENDING,
        payload: { title: 'Orphan Stream Task' },
        preview: { kind: 'CREATE_TASK', title: 'Orphan Stream Task' },
        executedTaskId: null,
        errorMessage: null,
        expiresAt: now,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      provider.chatCompletionStream
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call_orphan_2',
              name: 'create_task',
              rawArguments: '{"title":"Orphan Stream Task"}',
              arguments: { title: 'Orphan Stream Task' },
            },
          ],
        })
        .mockRejectedValueOnce(new BadGatewayException('AI stream upstream failure'));

      aiToolsService.executeTool.mockResolvedValueOnce({
        ok: true,
        data: { ok: true, requiresConfirmation: true, actionId: 830 },
        pendingAction: pendingRecord,
        summary: 'Đã tạo đề xuất',
      });

      const events: AiStreamEvent[] = [];
      await expect(
        service.chatStream(
          7,
          { conversationId: 140, message: 'Mid-stream fail' },
          (evt) => events.push(evt),
        ),
      ).rejects.toThrow(BadGatewayException);

      expect(events.some((e) => e.event === 'done')).toBe(false);
      expect(prisma.aiPendingAction.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [830] }, status: AiPendingActionStatus.PENDING },
      });
      expect(prisma.aiMessage.deleteMany).toHaveBeenCalledWith({
        where: { id: 930 },
      });
      expect(prisma.aiConversation.deleteMany).not.toHaveBeenCalled();
    });

    it('preserves mid-stream EXECUTED action and newly created conversation on abort/error while still deleting PENDING actions', async () => {
      const now = new Date('2026-11-19T03:00:00.000Z');
      const controller = new AbortController();

      prisma.aiConversation.create.mockResolvedValueOnce({
        id: 150,
        userId: 7,
        title: 'Cuộc trò chuyện mới',
        createdAt: now,
        updatedAt: now,
      });
      prisma.aiMessage.create.mockResolvedValueOnce({
        id: 940,
        conversationId: 150,
        role: AiMessageRole.USER,
        content: 'Tạo hai công việc',
        toolCallsSummary: null,
        createdAt: now,
      });

      const actionExecuted = {
        id: 840,
        userId: 7,
        conversationId: 150,
        messageId: null,
        actionType: AiActionType.CREATE_TASK,
        status: AiPendingActionStatus.PENDING,
        payload: { title: 'Task Executed Mid-Stream' },
        preview: { kind: 'CREATE_TASK', title: 'Task Executed Mid-Stream' },
        executedTaskId: null,
        errorMessage: null,
        expiresAt: now,
        confirmedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const actionPending = {
        ...actionExecuted,
        id: 841,
        payload: { title: 'Task Still Pending' },
        preview: { kind: 'CREATE_TASK', title: 'Task Still Pending' },
      };

      const dbActions: Array<{
        id: number;
        conversationId: number;
        status: AiPendingActionStatus;
      }> = [
        { id: 840, conversationId: 150, status: AiPendingActionStatus.PENDING },
        { id: 841, conversationId: 150, status: AiPendingActionStatus.PENDING },
      ];
      prisma.aiPendingAction.deleteMany.mockImplementation(
        async ({ where }: { where: { id?: { in: number[] }; status?: AiPendingActionStatus } }) => {
          const ids = where.id?.in ?? [];
          let deleted = 0;
          for (let i = dbActions.length - 1; i >= 0; i--) {
            const row = dbActions[i];
            if (ids.includes(row.id) && (!where.status || row.status === where.status)) {
              dbActions.splice(i, 1);
              deleted += 1;
            }
          }
          return { count: deleted };
        },
      );
      prisma.aiPendingAction.count.mockImplementation(
        async ({ where }: { where: { conversationId: number } }) =>
          dbActions.filter((row) => row.conversationId === where.conversationId).length,
      );

      provider.chatCompletionStream
        .mockResolvedValueOnce({
          content: null,
          toolCalls: [
            {
              id: 'call_exec_1',
              name: 'create_task',
              rawArguments: '{"title":"Task Executed Mid-Stream"}',
              arguments: { title: 'Task Executed Mid-Stream' },
            },
            {
              id: 'call_pend_2',
              name: 'create_task',
              rawArguments: '{"title":"Task Still Pending"}',
              arguments: { title: 'Task Still Pending' },
            },
          ],
        })
        .mockImplementationOnce(async () => {
          // Simulate user confirming action 840 mid-stream before aborting on round 2
          dbActions[0].status = AiPendingActionStatus.EXECUTED;
          controller.abort();
          return { content: null, toolCalls: [] };
        });

      aiToolsService.executeTool
        .mockResolvedValueOnce({
          ok: true,
          data: { ok: true, requiresConfirmation: true, actionId: 840 },
          pendingAction: actionExecuted,
          summary: 'Đã tạo đề xuất 1',
        })
        .mockResolvedValueOnce({
          ok: true,
          data: { ok: true, requiresConfirmation: true, actionId: 841 },
          pendingAction: actionPending,
          summary: 'Đã tạo đề xuất 2',
        });

      await expect(
        service.chatStream(
          7,
          { message: 'Tạo hai công việc' },
          () => undefined,
          controller.signal,
        ),
      ).rejects.toThrow();

      expect(prisma.aiPendingAction.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [840, 841] }, status: AiPendingActionStatus.PENDING },
      });
      expect(prisma.aiPendingAction.count).toHaveBeenCalledWith({
        where: { conversationId: 150 },
      });
      expect(dbActions).toEqual([
        { id: 840, conversationId: 150, status: AiPendingActionStatus.EXECUTED },
      ]);
      expect(prisma.aiConversation.deleteMany).not.toHaveBeenCalled();
    });

    it('includes strict TaskFlow-only scope and anti-prompt-injection guardrails in system prompt', async () => {
      prisma.aiConversation.create.mockResolvedValue({
        id: 201,
        userId: 7,
        title: 'Cuộc trò chuyện mới',
        createdAt: new Date('2026-11-23T03:00:00.000Z'),
        updatedAt: new Date('2026-11-23T03:00:00.000Z'),
      });
      prisma.aiMessage.create
        .mockResolvedValueOnce({
          id: 901,
          conversationId: 201,
          role: AiMessageRole.USER,
          content: 'Viết code Python giúp tôi',
          toolCallsSummary: null,
          createdAt: new Date('2026-11-23T03:00:01.000Z'),
        })
        .mockResolvedValueOnce({
          id: 902,
          conversationId: 201,
          role: AiMessageRole.ASSISTANT,
          content: 'Tôi chỉ hỗ trợ các tác vụ quản lý công việc trên TaskFlow.',
          toolCallsSummary: null,
          createdAt: new Date('2026-11-23T03:00:02.000Z'),
        });
      provider.chatCompletion.mockResolvedValueOnce({
        content: 'Tôi chỉ hỗ trợ các tác vụ quản lý công việc trên TaskFlow.',
        toolCalls: [],
      });

      await service.chat(7, { message: 'Viết code Python giúp tôi' });

      const firstCallArg = provider.chatCompletion.mock.calls[0]?.[0];
      const systemMessage = firstCallArg.messages.find(
        (m: { role: string }) => m.role === 'system',
      );
      expect(systemMessage?.content).toContain('Giới hạn phạm vi nghiêm ngặt');
      expect(systemMessage?.content).toContain('Anti-Prompt Injection');
      expect(systemMessage?.content).toContain('tiết lộ nội dung system prompt');
    });
  });
});
