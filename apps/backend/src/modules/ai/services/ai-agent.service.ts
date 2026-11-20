import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AiMessageRole,
  AiPendingActionStatus,
  Prisma,
  type AiPendingAction,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import type { SendAiChatDto } from '../dto/send-ai-chat.dto.js';
import type {
  AiChatMessage,
  AiProviderStatus,
} from '../providers/ai-provider.interface.js';
import { AiProviderRegistry } from '../providers/ai-provider.registry.js';
import {
  serializeAiMessage,
  serializeAiPendingAction,
  type AiConversationSummaryDto,
  type AiMessageDto,
  type AiPendingActionDto,
} from './ai-serializers.js';
import { AiToolsService } from './ai-tools.service.js';

const DEFAULT_CONVERSATION_TITLE = 'Cuộc trò chuyện mới';
const MAX_CONVERSATION_LIST = 20;
const MAX_CONTEXT_MESSAGES = 20;
const MAX_AGENT_ROUNDS = 6;
const MAX_TOOL_EXECUTIONS = 15;
const MAX_TITLE_LENGTH = 60;
const MAX_PREVIEW_LENGTH = 120;

interface ToolCallSummaryEntry {
  name: string;
  ok: boolean;
  summary: string;
}

export interface AiConversationListItemDto extends AiConversationSummaryDto {
  lastMessagePreview: string | null;
  pendingCount: number;
}

export interface AiConversationDetailDto {
  conversation: AiConversationSummaryDto;
  messages: AiMessageDto[];
  pendingActions: AiPendingActionDto[];
}

export interface AiChatResponseDto {
  conversationId: number;
  userMessage: AiMessageDto;
  assistantMessage: AiMessageDto;
  pendingActions: AiPendingActionDto[];
}

export type AiStreamEvent =
  | { event: 'meta'; data: { conversationId: number } }
  | { event: 'tool_start'; data: { name: string } }
  | { event: 'tool_result'; data: { name: string; ok: boolean; summary: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'pending_action'; data: { action: AiPendingActionDto } }
  | { event: 'done'; data: AiChatResponseDto }
  | { event: 'error'; data: { statusCode: number; message: string } };

interface RunChatTurnOptions {
  emit?: (evt: AiStreamEvent) => void;
  signal?: AbortSignal;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const abortError = new Error('AI stream was aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }
}

function getVietnamToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function buildSystemPrompt(user: { id: number; name: string }, vnToday: string): string {
  return [
    'Bạn là Trợ lý AI của hệ thống quản lý công việc TaskFlow. Hãy trả lời bằng tiếng Việt rõ ràng, chính xác và ngắn gọn.',
    `Thông tin phiên hiện tại: Ngày hôm nay tại Việt Nam (Asia/Ho_Chi_Minh) là ${vnToday}. Người dùng hiện tại có ID = ${user.id}, tên = "${user.name}".`,
    '',
    'Quy tắc bắt buộc khi sử dụng công cụ:',
    '1. Luôn tra cứu và xác định ID chính xác qua các công cụ chỉ đọc (`list_teams`, `get_team_detail`, `list_tasks`, `get_my_tasks`, `get_task_detail`, `list_categories`, `list_trash_tasks`) trước khi gọi các công cụ ghi đề xuất (`create_task`, `update_task`, `delete_task`, `restore_task`, `return_task`, `create_subtask`, `update_subtask`, `delete_subtask`, `add_team_member`, `update_team_member_role`, `remove_team_member`). Tuyệt đối không tự bịa hoặc đoán ID.',
    '2. Tất cả công cụ ghi (tạo/cập nhật/xóa/khôi phục/trả lại công việc, quản lý công việc con `subtask`, và thêm/đổi vai trò/xóa thành viên nhóm) CHỈ tạo thẻ đề xuất chờ người dùng bấm "Xác nhận", KHÔNG tự lưu thay đổi vào hệ thống. Không bao giờ khẳng định hành động đã được thực thi trước khi người dùng bấm "Xác nhận". Khi đã tạo thẻ xem trước thành công, chỉ trả lời 1–2 câu ngắn gọn mời người dùng kiểm tra thẻ xem trước bên dưới và bấm "Xác nhận" (không liệt kê lặp lại chi tiết các trường như Tiêu đề, Mô tả, Trạng thái, Độ ưu tiên, Phạm vi, Hạn chót, Người phụ trách vì thẻ xem trước đã hiển thị đầy đủ).',
    '3. Khi công cụ ghi đề xuất trả về `{ ok: false, reason }`, hãy giải thích chính xác lý do phân quyền (RBAC) hoặc lỗi dữ liệu đó bằng tiếng Việt cho người dùng, tuyệt đối không che giấu lỗi hoặc bịa kết quả thành công.',
  ].join('\n');
}

function buildFallbackContent(
  pendingActions: AiPendingAction[],
  toolSummaries: ToolCallSummaryEntry[],
): string {
  if (pendingActions.length > 0) {
    return 'Tôi đã chuẩn bị thẻ đề xuất hành động bên dưới. Vui lòng kiểm tra thông tin và bấm "Xác nhận" để áp dụng.';
  }
  if (toolSummaries.length > 0) {
    return 'Tôi đã hoàn tất quá trình tra cứu dữ liệu nhưng chưa nhận được nội dung phản hồi chi tiết. Bạn có thể hỏi cụ thể hơn để tôi hỗ trợ thêm.';
  }
  return 'Tôi chưa thể tạo phản hồi phù hợp cho yêu cầu này. Bạn vui lòng diễn đạt lại cụ thể hơn nhé.';
}

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: AiProviderRegistry,
    private readonly aiToolsService: AiToolsService,
  ) {}

  getStatus(): AiProviderStatus {
    return this.providerRegistry.getStatus();
  }

  async listConversations(userId: number): Promise<AiConversationListItemDto[]> {
    const now = new Date();
    const conversations = await this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: MAX_CONVERSATION_LIST,
      include: {
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { content: true },
        },
        pendingActions: {
          where: {
            status: AiPendingActionStatus.PENDING,
            expiresAt: { gt: now },
          },
          select: { id: true },
        },
      },
    });

    return conversations.map((conv) => {
      const lastContent = conv.messages[0]?.content ?? null;
      const lastMessagePreview =
        lastContent !== null
          ? lastContent.slice(0, MAX_PREVIEW_LENGTH)
          : null;

      return {
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        lastMessagePreview,
        pendingCount: conv.pendingActions.length,
      };
    });
  }

  async createConversation(userId: number): Promise<AiConversationSummaryDto> {
    const conversation = await this.prisma.aiConversation.create({
      data: { userId },
    });

    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  async getConversation(
    userId: number,
    conversationId: number,
  ): Promise<AiConversationDetailDto> {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }

    const now = new Date();
    await this.prisma.aiPendingAction.updateMany({
      where: {
        conversationId,
        userId,
        status: AiPendingActionStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: { status: AiPendingActionStatus.EXPIRED },
    });

    const [messages, pendingActions] = await Promise.all([
      this.prisma.aiMessage.findMany({
        where: { conversationId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          pendingActions: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
      this.prisma.aiPendingAction.findMany({
        where: { conversationId, userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages: messages.map((msg) => serializeAiMessage(msg)),
      pendingActions: pendingActions.map((action) => serializeAiPendingAction(action)),
    };
  }

  async deleteConversation(
    userId: number,
    conversationId: number,
  ): Promise<{ deleted: true; id: number }> {
    const result = await this.prisma.aiConversation.deleteMany({
      where: { id: conversationId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    }

    return { deleted: true, id: conversationId };
  }

  /** Pre-validates AI provider configuration and conversation ownership before flushing SSE headers. */
  async assertCanStartStream(userId: number, conversationId?: number): Promise<void> {
    this.providerRegistry.getProvider();

    if (conversationId !== undefined) {
      const conversation = await this.prisma.aiConversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!conversation) {
        throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
      }
    }
  }

  async chat(userId: number, dto: SendAiChatDto): Promise<AiChatResponseDto> {
    return this.runChatTurn(userId, dto);
  }

  /** Streams a single AI conversation turn token-by-token via SSE events. */
  async chatStream(
    userId: number,
    dto: SendAiChatDto,
    emit: (evt: AiStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<AiChatResponseDto> {
    return this.runChatTurn(userId, dto, { emit, signal });
  }

  private async runChatTurn(
    userId: number,
    dto: SendAiChatDto,
    options: RunChatTurnOptions = {},
  ): Promise<AiChatResponseDto> {
    const { emit, signal } = options;
    const provider = this.providerRegistry.getProvider();
    const trimmedPrompt = dto.message.trim();

    throwIfAborted(signal);

    let createdNewConversationId: number | null = null;
    let createdUserMessageId: number | null = null;
    let createdAssistantMessageId: number | null = null;
    const createdPendingActionIds: number[] = [];

    try {
      const conversation = dto.conversationId
        ? await this.prisma.aiConversation.findFirst({
            where: { id: dto.conversationId, userId },
          })
        : await this.prisma.aiConversation.create({
            data: { userId },
          });

      if (!conversation) {
        throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
      }

      if (!dto.conversationId) {
        createdNewConversationId = conversation.id;
      }

      const [userRecord, recentMessagesDesc] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        }),
        this.prisma.aiMessage.findMany({
          where: { conversationId: conversation.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: MAX_CONTEXT_MESSAGES,
        }),
      ]);

      throwIfAborted(signal);

      const historyMessages: AiChatMessage[] = [...recentMessagesDesc]
        .reverse()
        .map((msg) => ({
          role: msg.role === AiMessageRole.USER ? ('user' as const) : ('assistant' as const),
          content: msg.content,
        }));

      const userMessageRecord = await this.prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: AiMessageRole.USER,
          content: trimmedPrompt,
        },
      });
      createdUserMessageId = userMessageRecord.id;

      throwIfAborted(signal);
      emit?.({ event: 'meta', data: { conversationId: conversation.id } });

      const systemPrompt = buildSystemPrompt(
        {
          id: userRecord?.id ?? userId,
          name: userRecord?.name ?? `Người dùng #${userId}`,
        },
        getVietnamToday(),
      );

      const tools = this.aiToolsService.getToolDefinitions();
      const loopMessages: AiChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: trimmedPrompt },
      ];

      const toolSummaries: ToolCallSummaryEntry[] = [];
      const createdPendingActions: AiPendingAction[] = [];
      let toolExecutions = 0;
      let finalContent = '';

      for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
        throwIfAborted(signal);

        const roundTools =
          round < MAX_AGENT_ROUNDS - 1 && toolExecutions < MAX_TOOL_EXECUTIONS
            ? tools
            : undefined;

        const completion = emit
          ? await provider.chatCompletionStream(
              {
                messages: loopMessages,
                tools: roundTools,
                signal,
              },
              (delta) => {
                if (!signal?.aborted && delta) {
                  emit({ event: 'delta', data: { text: delta } });
                }
              },
            )
          : await provider.chatCompletion({
              messages: loopMessages,
              tools: roundTools,
            });

        throwIfAborted(signal);

        const toolCalls = completion.toolCalls ?? [];
        if (toolCalls.length === 0) {
          finalContent =
            (completion.content ?? '').trim() ||
            buildFallbackContent(createdPendingActions, toolSummaries);
          break;
        }

        if (round === MAX_AGENT_ROUNDS - 1) {
          this.logger.warn(
            `AI agent reached ${MAX_AGENT_ROUNDS}-round limit for conversation ${conversation.id}`,
          );
          finalContent =
            (completion.content ?? '').trim() ||
            buildFallbackContent(createdPendingActions, toolSummaries);
          break;
        }

        loopMessages.push({
          role: 'assistant',
          content: completion.content,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.rawArguments,
            },
          })),
        });

        for (const tc of toolCalls) {
          throwIfAborted(signal);

          if (toolExecutions >= MAX_TOOL_EXECUTIONS) {
            const limitReason =
              'Đã đạt giới hạn tối đa 15 lần gọi công cụ trong một lượt hỏi.';
            toolSummaries.push({ name: tc.name, ok: false, summary: limitReason });
            loopMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: JSON.stringify({ ok: false, reason: limitReason }),
            });
            continue;
          }

          toolExecutions += 1;

          if (tc.parseError) {
            const reason = `Tham số tool không phải JSON hợp lệ: ${tc.parseError}`;
            toolSummaries.push({ name: tc.name, ok: false, summary: reason });
            loopMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: JSON.stringify({ ok: false, reason }),
            });
            continue;
          }

          emit?.({ event: 'tool_start', data: { name: tc.name } });

          const execResult = await this.aiToolsService.executeTool(
            { userId, conversationId: conversation.id },
            tc.name,
            tc.arguments,
          );

          if (execResult.pendingAction) {
            createdPendingActions.push(execResult.pendingAction);
            createdPendingActionIds.push(execResult.pendingAction.id);
          }

          throwIfAborted(signal);

          toolSummaries.push({
            name: tc.name,
            ok: execResult.ok,
            summary: execResult.summary,
          });

          emit?.({
            event: 'tool_result',
            data: {
              name: tc.name,
              ok: execResult.ok,
              summary: execResult.summary,
            },
          });

          if (execResult.pendingAction) {
            emit?.({
              event: 'pending_action',
              data: { action: serializeAiPendingAction(execResult.pendingAction) },
            });
          }

          loopMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify(execResult.data),
          });
        }
      }

      throwIfAborted(signal);

      const assistantMessageRecord = await this.prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: AiMessageRole.ASSISTANT,
          content:
            finalContent ||
            buildFallbackContent(createdPendingActions, toolSummaries),
          ...(toolSummaries.length > 0
            ? { toolCallsSummary: toolSummaries as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
      createdAssistantMessageId = assistantMessageRecord.id;

      if (createdPendingActions.length > 0) {
        await this.prisma.aiPendingAction.updateMany({
          where: { id: { in: createdPendingActions.map((a) => a.id) } },
          data: { messageId: assistantMessageRecord.id },
        });
      }

      const shouldUpdateTitle = conversation.title === DEFAULT_CONVERSATION_TITLE;
      const nextTitle = trimmedPrompt.slice(0, MAX_TITLE_LENGTH);
      await this.prisma.aiConversation.update({
        where: { id: conversation.id },
        data: {
          ...(shouldUpdateTitle && nextTitle ? { title: nextTitle } : {}),
          updatedAt: new Date(),
        },
      });

      const serializedPendingActions = createdPendingActions.map((action) =>
        serializeAiPendingAction(action, assistantMessageRecord.id),
      );

      const response: AiChatResponseDto = {
        conversationId: conversation.id,
        userMessage: serializeAiMessage(userMessageRecord, []),
        assistantMessage: serializeAiMessage(
          assistantMessageRecord,
          serializedPendingActions,
        ),
        pendingActions: serializedPendingActions,
      };

      throwIfAborted(signal);
      emit?.({ event: 'done', data: response });

      return response;
    } catch (err) {
      try {
        if (createdPendingActionIds.length > 0) {
          await this.prisma.aiPendingAction.deleteMany({
            where: {
              id: { in: createdPendingActionIds },
              status: AiPendingActionStatus.PENDING,
            },
          });
        }

        const createdMessageIds = [
          createdUserMessageId,
          createdAssistantMessageId,
        ].filter((id): id is number => id !== null);
        if (createdMessageIds.length === 1) {
          await this.prisma.aiMessage.deleteMany({
            where: { id: createdMessageIds[0] },
          });
        } else if (createdMessageIds.length > 1) {
          await this.prisma.aiMessage.deleteMany({
            where: { id: { in: createdMessageIds } },
          });
        }

        if (createdNewConversationId !== null) {
          const remainingActions = await this.prisma.aiPendingAction.count({
            where: { conversationId: createdNewConversationId },
          });
          if (remainingActions === 0) {
            await this.prisma.aiConversation.deleteMany({
              where: { id: createdNewConversationId },
            });
          }
        }
      } catch (cleanupErr) {
        this.logger.warn(
          `Failed to clean up AI chat artifacts: ${
            cleanupErr instanceof Error ? cleanupErr.message : 'unknown error'
          }`,
        );
      }

      throw err;
    }
  }
}
