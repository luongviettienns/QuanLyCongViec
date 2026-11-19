export type AiTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export type AiTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type AiTeamRole = 'ADMIN' | 'MEMBER';

export type AiActionType =
  | 'CREATE_TASK'
  | 'UPDATE_TASK'
  | 'DELETE_TASK'
  | 'RESTORE_TASK'
  | 'CREATE_SUBTASK'
  | 'UPDATE_SUBTASK'
  | 'DELETE_SUBTASK'
  | 'RETURN_TASK'
  | 'ADD_TEAM_MEMBER'
  | 'UPDATE_TEAM_MEMBER_ROLE'
  | 'REMOVE_TEAM_MEMBER';

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

export interface AiDeleteTaskPreview {
  kind: 'DELETE_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string | null;
  subtaskCount: number;
}

export interface AiRestoreTaskPreview {
  kind: 'RESTORE_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string | null;
}

export interface AiReturnTaskPreview {
  kind: 'RETURN_TASK';
  taskId: number;
  taskTitle: string;
  teamName: string;
  reason: string;
}

export interface AiCreateSubtaskPreview {
  kind: 'CREATE_SUBTASK';
  taskId: number;
  taskTitle: string;
  title: string;
  description: string | null;
  assignee: { id: number; name: string } | null;
}

export interface AiUpdateSubtaskPreview {
  kind: 'UPDATE_SUBTASK';
  taskId: number;
  taskTitle: string;
  subtaskId: number;
  subtaskTitle: string;
  changes: AiUpdateTaskChange[];
}

export interface AiDeleteSubtaskPreview {
  kind: 'DELETE_SUBTASK';
  taskId: number;
  taskTitle: string;
  subtaskId: number;
  subtaskTitle: string;
}

export interface AiAddTeamMemberPreview {
  kind: 'ADD_TEAM_MEMBER';
  teamId: number;
  teamName: string;
  targetUser: { id: number; name: string; email: string };
  role: AiTeamRole;
}

export interface AiUpdateTeamMemberRolePreview {
  kind: 'UPDATE_TEAM_MEMBER_ROLE';
  teamId: number;
  teamName: string;
  memberUser: { id: number; name: string };
  oldRole: AiTeamRole;
  newRole: AiTeamRole;
}

export interface AiRemoveTeamMemberPreview {
  kind: 'REMOVE_TEAM_MEMBER';
  teamId: number;
  teamName: string;
  memberUser: { id: number; name: string };
  memberRole: AiTeamRole;
  isSelfLeaving: boolean;
}

export type AiProposalPreview =
  | AiCreateTaskPreview
  | AiUpdateTaskPreview
  | AiDeleteTaskPreview
  | AiRestoreTaskPreview
  | AiReturnTaskPreview
  | AiCreateSubtaskPreview
  | AiUpdateSubtaskPreview
  | AiDeleteSubtaskPreview
  | AiAddTeamMemberPreview
  | AiUpdateTeamMemberRolePreview
  | AiRemoveTeamMemberPreview;

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
  task: Record<string, unknown> | null;
}

export interface CancelAiActionResponse {
  action: AiPendingActionItem;
}

export interface AiStreamHandlers {
  onMeta?: (data: { conversationId: number }) => void;
  onToolStart?: (data: { name: string }) => void;
  onToolResult?: (data: { name: string; ok: boolean; summary: string }) => void;
  onDelta?: (data: { text: string }) => void;
  onPendingAction?: (data: { action: AiPendingActionItem }) => void;
  onDone?: (data: SendAiChatResponse) => void;
  onError?: (data: { statusCode: number; message: string }) => void;
}
