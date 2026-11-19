import {
  ApiError,
  getAuthHeaders,
  httpClient,
  notifyUnauthorized,
  parseApiError,
  safeFetch,
  UnauthorizedError,
} from '../../../shared/api/index.ts';
import type {
  AiConversationDetailResponse,
  AiConversationListItem,
  AiConversationSummary,
  AiPendingActionItem,
  AiStatusResponse,
  AiStreamHandlers,
  CancelAiActionResponse,
  ConfirmAiActionResponse,
  DeleteAiConversationResponse,
  SendAiChatPayload,
  SendAiChatResponse,
} from '../types/ai.types.ts';
import { parseSseChunk, type ParsedSseEvent } from '../utils/ai-chat.utils.ts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function sendAiChatStream(
  payload: SendAiChatPayload,
  handlers: AiStreamHandlers,
  signal?: AbortSignal,
): Promise<SendAiChatResponse | null> {
  const response = await safeFetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Không thể gửi tin nhắn tới trợ lý AI');
  }

  if (!response.body) {
    throw new ApiError('Máy chủ không trả về luồng dữ liệu phản hồi AI', response.status || 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let doneResponse: SendAiChatResponse | null = null;
  let streamError: ApiError | null = null;

  const dispatchEvents = (events: ParsedSseEvent[]) => {
    for (const evt of events) {
      if (signal?.aborted) {
        break;
      }
      if (!isRecord(evt.data)) {
        continue;
      }
      switch (evt.event) {
        case 'meta':
          if (typeof evt.data.conversationId === 'number') {
            handlers.onMeta?.({ conversationId: evt.data.conversationId });
          }
          break;
        case 'tool_start':
          if (typeof evt.data.name === 'string') {
            handlers.onToolStart?.({ name: evt.data.name });
          }
          break;
        case 'tool_result':
          if (typeof evt.data.name === 'string') {
            handlers.onToolResult?.({
              name: evt.data.name,
              ok: Boolean(evt.data.ok),
              summary: typeof evt.data.summary === 'string' ? evt.data.summary : '',
            });
          }
          break;
        case 'delta':
          if (typeof evt.data.text === 'string') {
            handlers.onDelta?.({ text: evt.data.text });
          }
          break;
        case 'pending_action':
          if (isRecord(evt.data.action)) {
            handlers.onPendingAction?.({
              action: evt.data.action as unknown as AiPendingActionItem,
            });
          }
          break;
        case 'done': {
          const parsedDone = evt.data as unknown as SendAiChatResponse;
          doneResponse = parsedDone;
          handlers.onDone?.(parsedDone);
          break;
        }
        case 'error': {
          const statusCode =
            typeof evt.data.statusCode === 'number' ? evt.data.statusCode : 500;
          const message =
            typeof evt.data.message === 'string' && evt.data.message.trim().length > 0
              ? evt.data.message.trim()
              : 'Đã xảy ra lỗi khi xử lý phản hồi AI';
          handlers.onError?.({ statusCode, message });
          if (statusCode === 401) {
            notifyUnauthorized();
            streamError = new UnauthorizedError(message);
          } else {
            streamError = new ApiError(message, statusCode);
          }
          break;
        }
      }
    }
  };

  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal && !signal.aborted) {
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        break;
      }

      const { value, done } = await reader.read();
      if (signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      if (done) {
        const trailing = decoder.decode();
        const { events, rest } = parseSseChunk(buffer, trailing);
        dispatchEvents(events);
        if (rest.trim().length > 0) {
          const flushed = parseSseChunk(rest, '\n\n');
          dispatchEvents(flushed.events);
        }
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const { events, rest } = parseSseChunk(buffer, chunk);
      buffer = rest;
      dispatchEvents(events);
    }
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
    try {
      reader.releaseLock();
    } catch {
      // Lock may already be released after cancellation
    }
  }

  if (streamError) {
    throw streamError;
  }

  return doneResponse;
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
