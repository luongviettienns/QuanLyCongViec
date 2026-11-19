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
    '1. Luôn tra cứu và xác định ID chính xác qua các công cụ chỉ đọc (`list_teams`, `get_team_detail`, `list_tasks`, `get_my_tasks`, `get_task_detail`, `list_categories`) trước khi gọi `create_task` hoặc `update_task`. Tuyệt đối không tự bịa hoặc đoán ID.',
    '2. Các công cụ `create_task` và `update_task` CHỈ tạo thẻ đề xuất chờ người dùng bấm "Xác nhận", KHÔNG tự lưu thay đổi vào hệ thống. Không bao giờ khẳng định công việc đã được tạo hoặc đã được cập nhật trước khi người dùng bấm "Xác nhận". Hãy thông báo rõ để người dùng kiểm tra thẻ xem trước và bấm "Xác nhận".',
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

  async chat(userId: number, dto: SendAiChatDto): Promise<AiChatResponseDto> {
    const provider = this.providerRegistry.getProvider();
    const trimmedPrompt = dto.message.trim();

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
        const completion = await provider.chatCompletion({
          messages: loopMessages,
          tools:
            round < MAX_AGENT_ROUNDS - 1 && toolExecutions < MAX_TOOL_EXECUTIONS
              ? tools
              : undefined,
        });

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

          const execResult = await this.aiToolsService.executeTool(
            { userId, conversationId: conversation.id },
            tc.name,
            tc.arguments,
          );

          toolSummaries.push({
            name: tc.name,
            ok: execResult.ok,
            summary: execResult.summary,
          });

          if (execResult.pendingAction) {
            createdPendingActions.push(execResult.pendingAction);
            createdPendingActionIds.push(execResult.pendingAction.id);
          }

          loopMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            name: tc.name,
            content: JSON.stringify(execResult.data),
          });
        }
      }

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

      return {
        conversationId: conversation.id,
        userMessage: serializeAiMessage(userMessageRecord, []),
        assistantMessage: serializeAiMessage(
          assistantMessageRecord,
          serializedPendingActions,
        ),
        pendingActions: serializedPendingActions,
      };
    } catch (err) {
      try {
        if (createdPendingActionIds.length > 0) {
          await this.prisma.aiPendingAction.deleteMany({
            where: { id: { in: createdPendingActionIds } },
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
          await this.prisma.aiConversation.deleteMany({
            where: { id: createdNewConversationId },
          });
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
