import { httpClient } from '../../../shared/api/index.ts';
import type {
  AiConversationDetailResponse,
  AiConversationListItem,
  AiConversationSummary,
  AiStatusResponse,
  CancelAiActionResponse,
  ConfirmAiActionResponse,
  DeleteAiConversationResponse,
  SendAiChatPayload,
  SendAiChatResponse,
} from '../types/ai.types.ts';

export function getAiStatus(signal?: AbortSignal): Promise<AiStatusResponse> {
  return httpClient.get<AiStatusResponse>('/api/ai/status', {
    signal,
    defaultErrorMessage: 'Không thể kiểm tra trạng thái trợ lý AI',
  });
}

export function listAiConversations(signal?: AbortSignal): Promise<AiConversationListItem[]> {
  return httpClient.get<AiConversationListItem[]>('/api/ai/conversations', {
    signal,
    defaultErrorMessage: 'Không thể tải danh sách cuộc trò chuyện AI',
  });
}

export function createAiConversation(): Promise<AiConversationSummary> {
  return httpClient.post<AiConversationSummary>('/api/ai/conversations', undefined, {
    defaultErrorMessage: 'Không thể tạo cuộc trò chuyện AI mới',
  });
}

export function getAiConversation(
  conversationId: number,
  signal?: AbortSignal,
): Promise<AiConversationDetailResponse> {
  return httpClient.get<AiConversationDetailResponse>(
    `/api/ai/conversations/${conversationId}`,
    {
      signal,
      defaultErrorMessage: 'Không thể tải nội dung cuộc trò chuyện AI',
    },
  );
}

export function deleteAiConversation(
  conversationId: number,
): Promise<DeleteAiConversationResponse> {
  return httpClient.delete<DeleteAiConversationResponse>(
    `/api/ai/conversations/${conversationId}`,
    {
      defaultErrorMessage: 'Không thể xóa cuộc trò chuyện AI',
    },
  );
}

export function sendAiChat(
  payload: SendAiChatPayload,
  signal?: AbortSignal,
): Promise<SendAiChatResponse> {
  return httpClient.post<SendAiChatResponse>('/api/ai/chat', payload, {
    signal,
    defaultErrorMessage: 'Không thể gửi tin nhắn tới trợ lý AI',
  });
}

export function confirmAiAction(actionId: number): Promise<ConfirmAiActionResponse> {
  return httpClient.post<ConfirmAiActionResponse>(
    `/api/ai/actions/${actionId}/confirm`,
    undefined,
    {
      defaultErrorMessage: 'Không thể xác nhận thực thi đề xuất AI',
    },
  );
}

export function cancelAiAction(actionId: number): Promise<CancelAiActionResponse> {
  return httpClient.post<CancelAiActionResponse>(
    `/api/ai/actions/${actionId}/cancel`,
    undefined,
    {
      defaultErrorMessage: 'Không thể hủy đề xuất AI',
    },
  );
}
