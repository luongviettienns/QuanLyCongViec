import type {
  AiActionType,
  AiMessage,
  AiMessageRole,
  AiPendingAction,
  AiPendingActionStatus,
  Prisma,
} from '@prisma/client';

export interface AiPendingActionDto {
  id: number;
  userId: number;
  conversationId: number;
  messageId: number | null;
  actionType: AiActionType;
  status: AiPendingActionStatus;
  preview: Prisma.JsonValue;
  executedTaskId: number | null;
  errorMessage: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AiMessageDto {
  id: number;
  conversationId: number;
  role: AiMessageRole;
  content: string;
  toolCallsSummary: Prisma.JsonValue | null;
  pendingActions: AiPendingActionDto[];
  createdAt: string;
}

export interface AiConversationSummaryDto {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export function serializeAiPendingAction(
  action: AiPendingAction,
  messageIdOverride?: number | null,
): AiPendingActionDto {
  return {
    id: action.id,
    userId: action.userId,
    conversationId: action.conversationId,
    messageId: messageIdOverride !== undefined ? messageIdOverride : action.messageId,
    actionType: action.actionType,
    status: action.status,
    preview: action.preview,
    executedTaskId: action.executedTaskId ?? null,
    errorMessage: action.errorMessage ?? null,
    expiresAt: action.expiresAt.toISOString(),
    confirmedAt: action.confirmedAt ? action.confirmedAt.toISOString() : null,
    createdAt: action.createdAt.toISOString(),
  };
}

export function serializeAiMessage(
  message: AiMessage & { pendingActions?: AiPendingAction[] },
  pendingActionsOverride?: AiPendingActionDto[],
): AiMessageDto {
  const serializedActions =
    pendingActionsOverride ??
    (message.pendingActions ?? []).map((action) => serializeAiPendingAction(action));

  return {
    id: message.id,
    conversationId: message.conversationId,
    role: message.role,
    content: message.content,
    toolCallsSummary: message.toolCallsSummary ?? null,
    pendingActions: serializedActions,
    createdAt: message.createdAt.toISOString(),
  };
}
