import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Input,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  PlusOutlined,
  RightOutlined,
  RobotOutlined,
  SendOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { isAbortError, isUnauthorizedError } from '../../../shared/api';
import { useResponsive } from '../../../shared/hooks';
import {
  cancelAiAction,
  confirmAiAction,
  createAiConversation,
  deleteAiConversation,
  getAiConversation,
  getAiStatus,
  listAiConversations,
  sendAiChat,
} from '../api/ai.api';
import type {
  AiConversationListItem,
  AiMessageItem,
  AiStatusResponse,
  AiToolCallSummaryItem,
} from '../types/ai.types';
import {
  applyResolvedActionToList,
  formatAiRelativeError,
} from '../utils/ai-chat.utils';
import { AiPendingActionCard } from './AiPendingActionCard';
import './ai-assistant.css';

const { Text } = Typography;

const STARTER_PROMPTS = [
  'Việc hôm nay của tôi gồm những gì?',
  'Thống kê tiến độ công việc',
  'Tạo công việc cá nhân: Tổng hợp báo cáo tuần vào ngày mai, ưu tiên cao',
];

export interface AiAssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  onTaskMutated?: () => void;
  onOpenTask?: (taskId: number) => void;
}

function ToolCallsSummaryBlock({
  tools,
}: {
  tools: AiToolCallSummaryItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (tools.length === 0) {
    return null;
  }

  return (
    <div className="ai-tool-summary-wrap">
      <button
        type="button"
        className="ai-tool-summary-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <ToolOutlined />
        <span>Đã dùng {tools.length} công cụ tra cứu</span>
        {expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      </button>

      {expanded && (
        <div className="ai-tool-summary-list">
          {tools.map((tool, index) => {
            const label = tool.name ?? tool.toolName ?? 'tool';
            return (
              <div className="ai-tool-summary-item" key={`${label}-${index}`}>
                <Tag
                  color={tool.ok ? 'green' : 'red'}
                  icon={tool.ok ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                  style={{ margin: 0, fontSize: 11, flexShrink: 0 }}
                >
                  {label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {tool.summary}
                </Text>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AiAssistantDrawer({
  open,
  onClose,
  onTaskMutated,
  onOpenTask,
}: AiAssistantDrawerProps) {
  const screens = useResponsive();
  const isMobile = !screens.md;

  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const [conversations, setConversations] = useState<AiConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AiMessageItem[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState(false);
  const [actionBusyMap, setActionBusyMap] = useState<Record<number, 'confirm' | 'cancel'>>({});

  const initAbortRef = useRef<AbortController | null>(null);
  const convAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const creatingRef = useRef(false);
  const deletingRef = useRef(false);
  const actionInFlightRef = useRef<Set<number>>(new Set());
  const activeConversationIdRef = useRef<number | null>(null);
  const optimisticSeqRef = useRef(-1);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const updateActiveConversationId = useCallback((nextId: number | null) => {
    activeConversationIdRef.current = nextId;
    setActiveConversationId(nextId);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    if (open && messages.length > 0) {
      scrollToBottom();
    }
  }, [open, messages.length, scrollToBottom]);

  const loadConversationDetail = useCallback(async (conversationId: number) => {
    convAbortRef.current?.abort();
    const controller = new AbortController();
    convAbortRef.current = controller;
    setLoadingConversation(true);
    setConversationError(null);

    try {
      const detail = await getAiConversation(conversationId, controller.signal);
      if (convAbortRef.current !== controller) {
        return;
      }
      setMessages(detail.messages);
      updateActiveConversationId(detail.conversation.id);
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      if (convAbortRef.current === controller) {
        setConversationError(
          formatAiRelativeError(error, 'Không thể tải nội dung cuộc trò chuyện'),
        );
      }
    } finally {
      if (convAbortRef.current === controller) {
        setLoadingConversation(false);
      }
    }
  }, [updateActiveConversationId]);

  const refreshConversationsList = useCallback(async () => {
    listAbortRef.current?.abort();
    const controller = new AbortController();
    listAbortRef.current = controller;

    try {
      const list = await listAiConversations(controller.signal);
      if (listAbortRef.current !== controller || controller.signal.aborted) {
        return undefined;
      }
      setConversations(list);
      return list;
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return undefined;
      }
      return undefined;
    } finally {
      if (listAbortRef.current === controller) {
        listAbortRef.current = null;
      }
    }
  }, []);

  const loadInitial = useCallback(async () => {
    initAbortRef.current?.abort();
    const controller = new AbortController();
    initAbortRef.current = controller;

    setInitializing(true);
    setStatusError(null);
    setConversationError(null);

    try {
      const [aiStatus, convList] = await Promise.all([
        getAiStatus(controller.signal),
        listAiConversations(controller.signal),
      ]);
      if (initAbortRef.current !== controller || controller.signal.aborted) {
        return;
      }
      setStatus(aiStatus);
      setConversations(convList);

      const prevId = activeConversationIdRef.current;
      const targetId =
        prevId && convList.some((c) => c.id === prevId)
          ? prevId
          : convList.length > 0
            ? convList[0].id
            : null;

      updateActiveConversationId(targetId);
      if (targetId !== null) {
        await loadConversationDetail(targetId);
      } else {
        setMessages([]);
      }
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        return;
      }
      if (initAbortRef.current === controller) {
        setStatusError(
          formatAiRelativeError(error, 'Không thể khởi tạo Trợ lý AI'),
        );
      }
    } finally {
      if (initAbortRef.current === controller) {
        initAbortRef.current = null;
        setInitializing(false);
      }
    }
  }, [loadConversationDetail, updateActiveConversationId]);

  useEffect(() => {
    if (!open) {
      initAbortRef.current?.abort();
      convAbortRef.current?.abort();
      chatAbortRef.current?.abort();
      listAbortRef.current?.abort();
      return;
    }

    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        void loadInitial();
      }
    });

    return () => {
      cancelled = true;
      initAbortRef.current?.abort();
      convAbortRef.current?.abort();
      chatAbortRef.current?.abort();
      listAbortRef.current?.abort();
    };
  }, [open, loadInitial]);

  const handleSelectConversation = async (conversationId: number) => {
    if (conversationId === activeConversationId) {
      return;
    }
    updateActiveConversationId(conversationId);
    setMessages([]);
    await loadConversationDetail(conversationId);
  };

  const handleCreateConversation = async () => {
    if (creatingRef.current || sendingRef.current) {
      return;
    }
    creatingRef.current = true;
    setCreatingConversation(true);
    convAbortRef.current?.abort();

    try {
      const created = await createAiConversation();
      const newListItem: AiConversationListItem = {
        ...created,
        lastMessagePreview: null,
        pendingCount: 0,
      };
      setConversations((prev) => [newListItem, ...prev]);
      updateActiveConversationId(created.id);
      setMessages([]);
      setConversationError(null);
    } catch (error) {
      if (!isAbortError(error) && !isUnauthorizedError(error)) {
        message.error(formatAiRelativeError(error, 'Không thể tạo cuộc trò chuyện mới'));
      }
    } finally {
      creatingRef.current = false;
      setCreatingConversation(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (activeConversationId === null || deletingRef.current || sendingRef.current) {
      return;
    }
    const targetId = activeConversationId;
    deletingRef.current = true;
    setDeletingConversation(true);
    convAbortRef.current?.abort();

    try {
      await deleteAiConversation(targetId);
      setConversations((prev) => prev.filter((item) => item.id !== targetId));
      updateActiveConversationId(null);
      setMessages([]);
      setConversationError(null);
      message.success('Đã xóa cuộc trò chuyện');
    } catch (error) {
      if (!isAbortError(error) && !isUnauthorizedError(error)) {
        message.error(formatAiRelativeError(error, 'Không thể xóa cuộc trò chuyện'));
      }
    } finally {
      deletingRef.current = false;
      setDeletingConversation(false);
    }
  };

  const handleSendMessage = async (textOverride?: string) => {
    const rawText = textOverride ?? draft;
    const trimmed = rawText.trim();
    if (!trimmed || sendingRef.current) {
      return;
    }
    if (status?.configured !== true) {
      if (status && !status.configured) {
        message.warning('Trợ lý AI chưa được cấu hình trên máy chủ.');
      }
      return;
    }

    convAbortRef.current?.abort();
    sendingRef.current = true;
    setSending(true);
    setConversationError(null);
    if (textOverride === undefined) {
      setDraft('');
    }

    const controller = new AbortController();
    chatAbortRef.current = controller;

    const optimisticId = optimisticSeqRef.current;
    optimisticSeqRef.current -= 1;
    const optimisticUserMsg: AiMessageItem = {
      id: optimisticId,
      conversationId: activeConversationId ?? 0,
      role: 'USER',
      content: trimmed,
      toolCallsSummary: null,
      pendingActions: [],
      createdAt: '',
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const response = await sendAiChat(
        {
          ...(activeConversationId ? { conversationId: activeConversationId } : {}),
          message: trimmed,
        },
        controller.signal,
      );

      updateActiveConversationId(response.conversationId);
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        return [...withoutOptimistic, response.userMessage, response.assistantMessage];
      });

      void refreshConversationsList().catch(() => {
        // Non-critical sidebar refresh
      });
    } catch (error) {
      if (isAbortError(error) || isUnauthorizedError(error)) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      if (textOverride === undefined) {
        setDraft(trimmed);
      }
      message.error(formatAiRelativeError(error, 'Không thể gửi tin nhắn tới Trợ lý AI'));
    } finally {
      if (chatAbortRef.current === controller) {
        chatAbortRef.current = null;
      }
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  const handleConfirmAction = async (actionId: number) => {
    if (actionInFlightRef.current.has(actionId)) {
      return;
    }
    actionInFlightRef.current.add(actionId);
    setActionBusyMap((prev) => ({ ...prev, [actionId]: 'confirm' }));

    try {
      const result = await confirmAiAction(actionId);
      setMessages((prev) => applyResolvedActionToList(prev, result.action));
      message.success('Đã thực thi đề xuất');
      onTaskMutated?.();
      void refreshConversationsList().catch(() => {});
    } catch (error) {
      if (!isAbortError(error) && !isUnauthorizedError(error)) {
        message.error(formatAiRelativeError(error, 'Không thể thực thi đề xuất'));
        if (activeConversationId) {
          void loadConversationDetail(activeConversationId);
        }
      }
    } finally {
      actionInFlightRef.current.delete(actionId);
      setActionBusyMap((prev) => {
        const next = { ...prev };
        delete next[actionId];
        return next;
      });
    }
  };

  const handleCancelAction = async (actionId: number) => {
    if (actionInFlightRef.current.has(actionId)) {
      return;
    }
    actionInFlightRef.current.add(actionId);
    setActionBusyMap((prev) => ({ ...prev, [actionId]: 'cancel' }));

    try {
      const result = await cancelAiAction(actionId);
      setMessages((prev) => applyResolvedActionToList(prev, result.action));
      message.info('Đã hủy đề xuất');
      void refreshConversationsList().catch(() => {});
    } catch (error) {
      if (!isAbortError(error) && !isUnauthorizedError(error)) {
        message.error(formatAiRelativeError(error, 'Không thể hủy đề xuất'));
        if (activeConversationId) {
          void loadConversationDetail(activeConversationId);
        }
      }
    } finally {
      actionInFlightRef.current.delete(actionId);
      setActionBusyMap((prev) => {
        const next = { ...prev };
        delete next[actionId];
        return next;
      });
    }
  };

  const isConfigured = status?.configured === true;
  const composerDisabled = sending || initializing || loadingConversation || !isConfigured;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="right"
      size={isMobile ? '100%' : 460}
      destroyOnHidden={false}
      title={
        <Space size={8} align="center" wrap>
          <RobotOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>Trợ lý AI TaskFlow</span>
          {status?.configured && status.model && (
            <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
              {status.model}
            </Tag>
          )}
        </Space>
      }
      styles={{
        body: {
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        },
      }}
    >
      <div className="ai-drawer-shell" data-testid="ai-assistant-drawer">
        <div className="ai-conversation-bar">
          <Select
            className="ai-conversation-select"
            size="small"
            placeholder="Cuộc trò chuyện mới"
            value={activeConversationId ?? undefined}
            onChange={(val) => void handleSelectConversation(val)}
            disabled={sending || initializing}
            notFoundContent="Chưa có cuộc trò chuyện"
            options={conversations.map((conv) => ({
              value: conv.id,
              label:
                conv.pendingCount > 0
                  ? `${conv.title} (${conv.pendingCount} chờ duyệt)`
                  : conv.title,
            }))}
            aria-label="Chọn cuộc trò chuyện AI"
          />

          <Button
            size="small"
            icon={<PlusOutlined />}
            loading={creatingConversation}
            disabled={sending || initializing || !isConfigured}
            onClick={() => void handleCreateConversation()}
            data-testid="ai-new-conversation-btn"
          >
            Mới
          </Button>

          {activeConversationId !== null && (
            <Popconfirm
              title="Xóa cuộc trò chuyện này?"
              description="Lịch sử tin nhắn và đề xuất chưa thực thi sẽ bị xóa."
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
              onConfirm={() => void handleDeleteConversation()}
              disabled={sending || deletingConversation}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={deletingConversation}
                disabled={sending}
                aria-label="Xóa cuộc trò chuyện"
                data-testid="ai-delete-conversation-btn"
              />
            </Popconfirm>
          )}
        </div>

        {statusError && (
          <div className="ai-drawer-alert-wrap">
            <Alert
              type="error"
              showIcon
              title={statusError}
              action={
                <Button
                  size="small"
                  type="link"
                  onClick={() => void loadInitial()}
                >
                  Thử lại
                </Button>
              }
            />
          </div>
        )}

        {status && !status.configured && (
          <div className="ai-drawer-alert-wrap">
            <Alert
              type="warning"
              showIcon
              title="Trợ lý AI chưa được cấu hình"
              description="Máy chủ chưa thiết lập AI provider hoặc API key. Vui lòng cấu hình biến môi trường AI để sử dụng tính năng này."
            />
          </div>
        )}

        {conversationError && (
          <div className="ai-drawer-alert-wrap">
            <Alert
              type="error"
              showIcon
              title={conversationError}
              action={
                activeConversationId !== null ? (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => void loadConversationDetail(activeConversationId)}
                  >
                    Thử lại
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}

        <div className="ai-messages-scroll">
          {initializing || loadingConversation ? (
            <div style={{ margin: 'auto', textAlign: 'center', padding: 24 }}>
              <Spin />
            </div>
          ) : messages.length === 0 ? (
            <div className="ai-empty-state">
              <RobotOutlined style={{ fontSize: 32, color: '#1677ff' }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>
                  Xin chào! Tôi có thể giúp gì cho công việc của bạn?
                </div>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  Bạn có thể hỏi thống kê, tìm kiếm công việc hoặc yêu cầu tạo/cập nhật công việc (luôn chờ bạn xác nhận trước khi lưu).
                </Text>
              </div>
              <div className="ai-empty-chips">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    className="ai-starter-chip"
                    disabled={composerDisabled}
                    onClick={() => void handleSendMessage(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isUser = msg.role === 'USER';
                const toolList = Array.isArray(msg.toolCallsSummary) ? msg.toolCallsSummary : [];
                return (
                  <div
                    key={msg.id}
                    className={`ai-message-row ${
                      isUser ? 'ai-message-row--user' : 'ai-message-row--assistant'
                    }`}
                  >
                    {!isUser && toolList.length > 0 && (
                      <ToolCallsSummaryBlock tools={toolList} />
                    )}

                    <div
                      className={`ai-message-bubble ${
                        isUser ? 'ai-message-bubble--user' : 'ai-message-bubble--assistant'
                      }`}
                    >
                      {msg.content}
                    </div>

                    {!isUser && msg.pendingActions.length > 0 && (
                      <div className="ai-action-list">
                        {msg.pendingActions.map((action) => (
                          <AiPendingActionCard
                            key={action.id}
                            action={action}
                            busyAction={actionBusyMap[action.id] ?? null}
                            onConfirm={handleConfirmAction}
                            onCancel={handleCancelAction}
                            onOpenTask={onOpenTask}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {sending && (
                <div className="ai-message-row ai-message-row--assistant">
                  <div className="ai-message-bubble ai-message-bubble--assistant">
                    <Space size={8}>
                      <Spin size="small" />
                      <Text type="secondary" style={{ fontSize: 12.5 }}>
                        Trợ lý AI đang xử lý...
                      </Text>
                    </Space>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <div className="ai-composer">
          <Input.TextArea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              isConfigured
                ? 'Nhập tin nhắn cho Trợ lý AI...'
                : 'Trợ lý AI chưa được cấu hình'
            }
            maxLength={2000}
            autoSize={{ minRows: 2, maxRows: 5 }}
            disabled={composerDisabled}
            data-testid="ai-composer-input"
          />
          <div className="ai-composer-actions">
            <span className="ai-composer-hint">
              Enter để gửi · Shift+Enter xuống dòng
            </span>
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={sending}
              disabled={composerDisabled || draft.trim().length === 0}
              onClick={() => void handleSendMessage()}
              data-testid="ai-composer-send-btn"
            >
              Gửi
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
