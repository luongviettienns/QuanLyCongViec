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
  AiActionType,
  AiMessageItem,
  AiPendingActionItem,
  AiProposalPreview,
  AiTaskPriority,
  AiTaskStatus,
  AiTeamRole,
  SendAiChatResponse,
} from '../types/ai.types.ts';

export interface AiPreviewField {
  label: string;
  value?: string;
  before?: string | null;
  after?: string | null;
}

export interface ParsedSseEvent {
  event: string;
  data: unknown;
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

const TEAM_ROLE_LABELS: Record<AiTeamRole, string> = {
  ADMIN: 'Quản trị viên',
  MEMBER: 'Thành viên',
};

const DANGER_ACTION_TYPES = new Set<AiActionType>([
  'DELETE_TASK',
  'DELETE_SUBTASK',
  'REMOVE_TEAM_MEMBER',
]);

const TEAM_MUTATING_ACTION_TYPES = new Set<AiActionType>([
  'ADD_TEAM_MEMBER',
  'UPDATE_TEAM_MEMBER_ROLE',
  'REMOVE_TEAM_MEMBER',
]);

export function isDangerAiAction(actionType: AiActionType): boolean {
  return DANGER_ACTION_TYPES.has(actionType);
}

export function isTeamMutatingAiAction(actionType: AiActionType): boolean {
  return TEAM_MUTATING_ACTION_TYPES.has(actionType);
}

export function isTaskLinkedAiAction(actionType: AiActionType): boolean {
  return !TEAM_MUTATING_ACTION_TYPES.has(actionType);
}

export function formatAiActionTitle(
  action: Pick<AiPendingActionItem, 'actionType' | 'preview'>,
): string {
  switch (action.preview.kind) {
    case 'CREATE_TASK':
      return 'Tạo công việc mới';
    case 'UPDATE_TASK':
      return `Cập nhật công việc #${action.preview.taskId}`;
    case 'DELETE_TASK':
      return `Xóa công việc #${action.preview.taskId}`;
    case 'RESTORE_TASK':
      return `Khôi phục công việc #${action.preview.taskId}`;
    case 'RETURN_TASK':
      return `Trả lại công việc #${action.preview.taskId}`;
    case 'CREATE_SUBTASK':
      return `Thêm công việc con (#${action.preview.taskId})`;
    case 'UPDATE_SUBTASK':
      return `Cập nhật công việc con #${action.preview.subtaskId}`;
    case 'DELETE_SUBTASK':
      return `Xóa công việc con #${action.preview.subtaskId}`;
    case 'ADD_TEAM_MEMBER':
      return 'Thêm thành viên vào nhóm';
    case 'UPDATE_TEAM_MEMBER_ROLE':
      return 'Đổi vai trò thành viên';
    case 'REMOVE_TEAM_MEMBER':
      return action.preview.isSelfLeaving ? 'Rời khỏi nhóm' : 'Xóa thành viên khỏi nhóm';
    default: {
      switch (action.actionType) {
        case 'UPDATE_TASK':
          return 'Cập nhật công việc';
        case 'DELETE_TASK':
          return 'Xóa công việc';
        case 'RESTORE_TASK':
          return 'Khôi phục công việc';
        case 'RETURN_TASK':
          return 'Trả lại công việc';
        case 'CREATE_SUBTASK':
          return 'Thêm công việc con';
        case 'UPDATE_SUBTASK':
          return 'Cập nhật công việc con';
        case 'DELETE_SUBTASK':
          return 'Xóa công việc con';
        case 'ADD_TEAM_MEMBER':
          return 'Thêm thành viên vào nhóm';
        case 'UPDATE_TEAM_MEMBER_ROLE':
          return 'Đổi vai trò thành viên';
        case 'REMOVE_TEAM_MEMBER':
          return 'Xóa thành viên khỏi nhóm';
        default:
          return 'Tạo công việc mới';
      }
    }
  }
}

export function buildAiPreviewFields(preview: AiProposalPreview): AiPreviewField[] {
  switch (preview.kind) {
    case 'UPDATE_TASK':
      return preview.changes.map((change) => ({
        label: change.label,
        before: change.before,
        after: change.after,
      }));

    case 'CREATE_TASK': {
      const fields: AiPreviewField[] = [{ label: 'Tiêu đề', value: preview.title }];

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

    case 'DELETE_TASK': {
      const fields: AiPreviewField[] = [
        { label: 'Công việc', value: preview.taskTitle },
        {
          label: 'Phạm vi',
          value: preview.teamName ? `Nhóm: ${preview.teamName}` : 'Cá nhân',
        },
      ];
      if (preview.subtaskCount > 0) {
        fields.push({
          label: 'Công việc con',
          value: `${preview.subtaskCount} công việc con`,
        });
      }
      return fields;
    }

    case 'RESTORE_TASK':
      return [
        { label: 'Công việc', value: preview.taskTitle },
        {
          label: 'Phạm vi',
          value: preview.teamName ? `Nhóm: ${preview.teamName}` : 'Cá nhân',
        },
      ];

    case 'RETURN_TASK':
      return [
        { label: 'Công việc', value: preview.taskTitle },
        { label: 'Nhóm', value: preview.teamName || 'Nhóm làm việc' },
        { label: 'Lý do trả lại', value: preview.reason },
      ];

    case 'CREATE_SUBTASK': {
      const fields: AiPreviewField[] = [
        { label: 'Công việc chính', value: preview.taskTitle },
        { label: 'Công việc con', value: preview.title },
      ];
      if (preview.description && preview.description.trim().length > 0) {
        fields.push({ label: 'Mô tả', value: preview.description });
      }
      if (preview.assignee) {
        fields.push({ label: 'Người thực hiện', value: preview.assignee.name });
      }
      return fields;
    }

    case 'UPDATE_SUBTASK':
      return [
        { label: 'Công việc chính', value: preview.taskTitle },
        { label: 'Công việc con', value: preview.subtaskTitle },
        ...preview.changes.map((change) => ({
          label: change.label,
          before: change.before,
          after: change.after,
        })),
      ];

    case 'DELETE_SUBTASK':
      return [
        { label: 'Công việc chính', value: preview.taskTitle },
        { label: 'Công việc con', value: preview.subtaskTitle },
      ];

    case 'ADD_TEAM_MEMBER':
      return [
        { label: 'Nhóm', value: preview.teamName },
        {
          label: 'Thành viên',
          value: `${preview.targetUser.name} (${preview.targetUser.email})`,
        },
        { label: 'Vai trò', value: TEAM_ROLE_LABELS[preview.role] ?? preview.role },
      ];

    case 'UPDATE_TEAM_MEMBER_ROLE':
      return [
        { label: 'Nhóm', value: preview.teamName },
        { label: 'Thành viên', value: preview.memberUser.name },
        {
          label: 'Vai trò',
          before: TEAM_ROLE_LABELS[preview.oldRole] ?? preview.oldRole,
          after: TEAM_ROLE_LABELS[preview.newRole] ?? preview.newRole,
        },
      ];

    case 'REMOVE_TEAM_MEMBER':
      return [
        { label: 'Nhóm', value: preview.teamName },
        { label: 'Thành viên', value: preview.memberUser.name },
        {
          label: 'Vai trò hiện tại',
          value: TEAM_ROLE_LABELS[preview.memberRole] ?? preview.memberRole,
        },
        {
          label: 'Hình thức',
          value: preview.isSelfLeaving ? 'Tự rời nhóm' : 'Xóa khỏi nhóm',
        },
      ];
  }
}

export function parseSseChunk(
  buffer: string,
  chunk: string,
): { events: ParsedSseEvent[]; rest: string } {
  const normalized = (buffer + chunk).replace(/\r\n/g, '\n');
  const blocks = normalized.split('\n\n');
  const rest = blocks.pop() ?? '';
  const events: ParsedSseEvent[] = [];

  for (const block of blocks) {
    if (block.trim().length === 0) {
      continue;
    }

    let eventName = 'message';
    const dataLines: string[] = [];

    for (const rawLine of block.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(':')) {
        continue;
      }
      if (line.startsWith('event:')) {
        const parsedName = line.slice('event:'.length).trim();
        if (parsedName.length > 0) {
          eventName = parsedName;
        }
      } else if (line.startsWith('data:')) {
        const value = line.slice('data:'.length);
        dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
      }
    }

    if (dataLines.length === 0) {
      continue;
    }

    const rawData = dataLines.join('\n').trim();
    if (rawData.length === 0) {
      continue;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(rawData);
    } catch {
      parsedData = rawData;
    }

    events.push({ event: eventName, data: parsedData });
  }

  return { events, rest };
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

export function mergeResolvedActionsIntoChatResponse(
  response: SendAiChatResponse,
  resolvedActions: ReadonlyMap<number, AiPendingActionItem>,
): SendAiChatResponse {
  if (resolvedActions.size === 0) {
    return response;
  }

  const mergeActionList = (actions: AiPendingActionItem[]): AiPendingActionItem[] =>
    actions.map((action) => {
      const resolved = resolvedActions.get(action.id);
      if (!resolved) {
        return action;
      }
      return {
        ...resolved,
        messageId: resolved.messageId ?? action.messageId,
      };
    });

  return {
    ...response,
    pendingActions: mergeActionList(response.pendingActions),
    assistantMessage: {
      ...response.assistantMessage,
      pendingActions: mergeActionList(response.assistantMessage.pendingActions),
    },
  };
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
