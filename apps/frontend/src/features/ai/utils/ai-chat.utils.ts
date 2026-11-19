import {
  DEFAULT_NETWORK_ERROR_MESSAGE,
  DEFAULT_SERVER_ERROR_MESSAGE,
  getApiErrorStatus,
  getFriendlyErrorMessage,
  isForbiddenError,
  isNetworkError,
  isNotFoundError,
  isServerError,
} from '../../../shared/api/api-error.ts';
import type {
  AiMessageItem,
  AiPendingActionItem,
  AiProposalPreview,
  AiTaskPriority,
  AiTaskStatus,
} from '../types/ai.types.ts';

export interface AiPreviewField {
  label: string;
  value?: string;
  before?: string | null;
  after?: string | null;
}

const STATUS_LABELS: Record<AiTaskStatus, string> = {
  TODO: 'Cần làm',
  IN_PROGRESS: 'Đang làm',
  DONE: 'Hoàn thành',
};

const PRIORITY_LABELS: Record<AiTaskPriority, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
};

export function formatAiActionTitle(
  action: Pick<AiPendingActionItem, 'actionType' | 'preview'>,
): string {
  if (action.preview.kind === 'UPDATE_TASK') {
    return `Cập nhật công việc #${action.preview.taskId}`;
  }
  if (action.actionType === 'UPDATE_TASK') {
    return 'Cập nhật công việc';
  }
  return 'Tạo công việc mới';
}

export function buildAiPreviewFields(preview: AiProposalPreview): AiPreviewField[] {
  if (preview.kind === 'UPDATE_TASK') {
    return preview.changes.map((change) => ({
      label: change.label,
      before: change.before,
      after: change.after,
    }));
  }

  const fields: AiPreviewField[] = [
    { label: 'Tiêu đề', value: preview.title },
  ];

  if (preview.description && preview.description.trim().length > 0) {
    fields.push({ label: 'Mô tả', value: preview.description });
  }

  fields.push(
    { label: 'Trạng thái', value: STATUS_LABELS[preview.status] ?? preview.status },
    { label: 'Độ ưu tiên', value: PRIORITY_LABELS[preview.priority] ?? preview.priority },
    {
      label: 'Phạm vi',
      value: preview.team ? `Nhóm: ${preview.team.name}` : 'Cá nhân',
    },
  );

  if (preview.startDate) {
    fields.push({ label: 'Ngày bắt đầu', value: preview.startDate });
  }
  if (preview.dueDate) {
    fields.push({ label: 'Hạn chót', value: preview.dueDate });
  }
  if (preview.assignee) {
    fields.push({ label: 'Người phụ trách', value: preview.assignee.name });
  }
  if (preview.category) {
    fields.push({ label: 'Danh mục', value: preview.category.name });
  }
  if (preview.collaborators.length > 0) {
    fields.push({
      label: 'Người phối hợp',
      value: preview.collaborators.map((c) => c.name).join(', '),
    });
  }

  return fields;
}

export function isAiActionPending(
  action: Pick<AiPendingActionItem, 'status' | 'expiresAt'>,
  now: Date = new Date(),
): boolean {
  if (action.status !== 'PENDING') {
    return false;
  }
  const expiresAtMs = new Date(action.expiresAt).getTime();
  if (Number.isNaN(expiresAtMs)) {
    return false;
  }
  return expiresAtMs > now.getTime();
}

export function applyResolvedActionToList(
  messages: AiMessageItem[],
  resolvedAction: AiPendingActionItem,
): AiMessageItem[] {
  let anyChanged = false;
  const nextMessages = messages.map((msg) => {
    const hasMatch = msg.pendingActions.some((action) => action.id === resolvedAction.id);
    if (!hasMatch) {
      return msg;
    }
    anyChanged = true;
    return {
      ...msg,
      pendingActions: msg.pendingActions.map((action) =>
        action.id === resolvedAction.id ? resolvedAction : action,
      ),
    };
  });
  return anyChanged ? nextMessages : [...messages];
}

function extractRawErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message.trim();
  }
  return '';
}

export function formatAiRelativeError(
  error: unknown,
  fallback = 'Không thể xử lý yêu cầu trợ lý AI, vui lòng thử lại.',
): string {
  if (isNetworkError(error)) {
    const friendly = getFriendlyErrorMessage(error, DEFAULT_NETWORK_ERROR_MESSAGE);
    return friendly || DEFAULT_NETWORK_ERROR_MESSAGE;
  }

  const status = getApiErrorStatus(error);
  const rawMessage = extractRawErrorMessage(error);

  if (status === 503) {
    const lower = rawMessage.toLowerCase();
    if (!rawMessage || lower === 'service unavailable' || lower.startsWith('503')) {
      return 'Dịch vụ trợ lý AI tạm thời không khả dụng hoặc chưa được cấu hình.';
    }
    return rawMessage;
  }

  if (status === 409) {
    const lower = rawMessage.toLowerCase();
    if (!rawMessage || lower === 'conflict') {
      return 'Đề xuất hành động đã được xử lý hoặc hết hiệu lực.';
    }
    return rawMessage;
  }

  if (isForbiddenError(error) || isNotFoundError(error)) {
    return getFriendlyErrorMessage(error, fallback);
  }

  if (isServerError(error)) {
    return getFriendlyErrorMessage(error, DEFAULT_SERVER_ERROR_MESSAGE);
  }

  return getFriendlyErrorMessage(error, fallback);
}
