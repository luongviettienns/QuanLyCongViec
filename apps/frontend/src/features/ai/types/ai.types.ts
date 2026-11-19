export type AiTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type AiTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type AiActionType = 'CREATE_TASK' | 'UPDATE_TASK';

export type AiPendingActionStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export type AiMessageRole = 'USER' | 'ASSISTANT';

export interface AiStatusResponse {
  configured: boolean;
  provider: string;
  model: string | null;
}

export interface AiConversationSummary {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationListItem extends AiConversationSummary {
  lastMessagePreview: string | null;
  pendingCount: number;
}

export interface AiCreateTaskPreview {
  kind: 'CREATE_TASK';
  title: string;
  description: string | null;
  status: AiTaskStatus;
  priority: AiTaskPriority;
  startDate: string | null;
  dueDate: string | null;
  team: { id: number; name: string } | null;
  assignee: { id: number; name: string } | null;
  category: { id: number; name: string } | null;
  collaborators: Array<{ id: number; name: string }>;
}

export interface AiUpdateTaskChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface AiUpdateTaskPreview {
  kind: 'UPDATE_TASK';
  taskId: number;
  taskTitle: string;
  changes: AiUpdateTaskChange[];
}

export type AiProposalPreview = AiCreateTaskPreview | AiUpdateTaskPreview;

export interface AiPendingActionItem {
  id: number;
  userId: number;
  conversationId: number;
  messageId: number | null;
  actionType: AiActionType;
  status: AiPendingActionStatus;
  preview: AiProposalPreview;
  executedTaskId: number | null;
  errorMessage: string | null;
  expiresAt: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AiToolCallSummaryItem {
  name?: string;
  toolName?: string;
  ok: boolean;
  summary: string;
}

export interface AiMessageItem {
  id: number;
  conversationId: number;
  role: AiMessageRole;
  content: string;
  toolCallsSummary: AiToolCallSummaryItem[] | null;
  pendingActions: AiPendingActionItem[];
  createdAt: string;
}

export interface AiConversationDetailResponse {
  conversation: AiConversationSummary;
  messages: AiMessageItem[];
  pendingActions: AiPendingActionItem[];
}

export interface DeleteAiConversationResponse {
  deleted: true;
  id: number;
}

export interface SendAiChatPayload {
  conversationId?: number;
  message: string;
}

export interface SendAiChatResponse {
  conversationId: number;
  userMessage: AiMessageItem;
  assistantMessage: AiMessageItem;
  pendingActions: AiPendingActionItem[];
}

export interface ConfirmAiActionResponse {
  action: AiPendingActionItem;
  task: Record<string, unknown>;
}

export interface CancelAiActionResponse {
  action: AiPendingActionItem;
}
