import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Empty,
  Mentions,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  MessageOutlined,
  RollbackOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { Task, TaskComment, TaskCommentMention } from '../types/task.types';
import type { Team } from '../../teams/types/team.types';
import type { User } from '../../auth/types/auth.types';
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment,
} from '../api/tasks.api';
import {
  buildMentionableUsers,
  canDeleteTaskComment,
  canEditTaskComment,
  countTotalComments,
  extractMentionedUserIds,
  formatCommentTimestamp,
  splitCommentContentSegments,
  type CommentMentionCandidate,
} from '../utils/comment.utils';
import { ApiErrorFallback } from '../../../app/pages/errors';
import { getFriendlyErrorMessage, isAbortError } from '../../../shared/api';
import {
  useRealtimeEvent,
  useRealtimeReconnect,
  type RealtimeEventData,
} from '../../realtime';

const { Text } = Typography;

export interface TaskCommentsSectionProps {
  task: Task;
  team?: Team | null;
  currentUser: User | null;
  highlightCommentId?: number | null;
  onCommentsCountChange?: (taskId: number, count: number) => void;
  onChanged?: () => void;
}

interface ReplyContext {
  targetCommentId: number;
  authorId: number;
  authorName: string;
  excerpt: string;
}

function getInitials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : 'U';
}

function renderMentionText(content: string, mentions: readonly TaskCommentMention[]) {
  const segments = splitCommentContentSegments(content, mentions);
  return (
    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.55 }}>
      {segments.map((seg, idx) =>
        seg.isMention ? (
          <Tag
            key={`${seg.userId ?? 'm'}-${idx}`}
            color="blue"
            variant="filled"
            style={{
              marginInline: 2,
              paddingInline: 6,
              fontSize: 12,
              lineHeight: '20px',
              fontWeight: 500,
              borderRadius: 4,
            }}
          >
            {seg.text}
          </Tag>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        ),
      )}
    </span>
  );
}

export const TaskCommentsSection: React.FC<TaskCommentsSectionProps> = ({
  task,
  team,
  currentUser,
  highlightCommentId = null,
  onCommentsCountChange,
  onChanged,
}) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyContext | null>(null);
  const trackedSelectionsRef = useRef<CommentMentionCandidate[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editSelectionsRef = useRef<CommentMentionCandidate[]>([]);

  const [deletingId, setDeletingId] = useState<number | null>(null);

  const submittingLockRef = useRef(false);
  const scrolledHighlightRef = useRef<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const activeTaskIdRef = useRef(task.id);

  useEffect(() => {
    activeTaskIdRef.current = task.id;
  }, [task.id]);

  const candidates = useMemo(
    () => buildMentionableUsers(task, team, currentUser?.id),
    [task, team, currentUser?.id],
  );

  const mentionOptions = useMemo(
    () =>
      candidates.map((c) => ({
        key: String(c.id),
        value: c.name,
        label: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Space size={6}>
              <Avatar size={20} style={{ backgroundColor: '#1677ff', fontSize: 11 }}>
                {getInitials(c.name)}
              </Avatar>
              <Text style={{ fontSize: 13 }}>{c.name}</Text>
            </Space>
            {c.roleLabel ? (
              <Text type="secondary" style={{ fontSize: 11 }}>
                {c.roleLabel}
              </Text>
            ) : null}
          </div>
        ),
      })),
    [candidates],
  );

  const syncComments = useCallback(
    (next: TaskComment[]) => {
      setComments(next);
      onCommentsCountChange?.(task.id, countTotalComments(next));
    },
    [onCommentsCountChange, task.id],
  );

  const fetchComments = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await getTaskComments(task.id, signal);
        if (signal?.aborted || activeTaskIdRef.current !== task.id) return;
        setLoadError(null);
        syncComments(data);
      } catch (err) {
        if (isAbortError(err) || signal?.aborted || activeTaskIdRef.current !== task.id) {
          return;
        }
        setLoadError(err);
      } finally {
        if (!signal?.aborted && activeTaskIdRef.current === task.id) {
          setLoading(false);
        }
      }
    },
    [task.id, syncComments],
  );

  useEffect(() => {
    const controller = new AbortController();
    scrolledHighlightRef.current = null;
    trackedSelectionsRef.current = [];
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) {
        return fetchComments(controller.signal);
      }
    });
    return () => controller.abort();
  }, [fetchComments]);

  useEffect(() => {
    if (!highlightCommentId || loading || scrolledHighlightRef.current === highlightCommentId) {
      return;
    }
    const targetEl = rowRefs.current.get(highlightCommentId);
    if (targetEl) {
      scrolledHighlightRef.current = highlightCommentId;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightCommentId, loading, comments]);

  const handleCommentRealtime = useCallback(
    (event: RealtimeEventData) => {
      if (event.actorId && event.actorId === currentUser?.id) {
        return;
      }
      const payload = event.payload as { taskId?: number } | undefined;
      if (payload?.taskId === task.id) {
        void fetchComments();
      }
    },
    [currentUser?.id, fetchComments, task.id],
  );

  useRealtimeEvent('TASK_COMMENT_CHANGED', handleCommentRealtime);
  useRealtimeReconnect(() => {
    void fetchComments();
  });

  const handleSelectMention = useCallback(
    (
      option: { key?: React.Key; value?: string },
      ref: React.MutableRefObject<CommentMentionCandidate[]>,
    ) => {
      const idNum = Number(option.key);
      const matched =
        candidates.find((c) => c.id === idNum) ??
        candidates.find((c) => c.name === option.value);
      if (matched && !ref.current.some((item) => item.id === matched.id)) {
        ref.current = [...ref.current, matched];
      }
    },
    [candidates],
  );

  const handleStartReply = (comment: TaskComment) => {
    const excerpt =
      comment.content.length > 60 ? `${comment.content.slice(0, 57)}...` : comment.content;
    setReplyingTo({
      targetCommentId: comment.id,
      authorId: comment.authorId,
      authorName: comment.author.name,
      excerpt,
    });

    if (comment.authorId !== currentUser?.id) {
      const candidate = candidates.find((c) => c.id === comment.authorId);
      if (candidate) {
        const prefix = `@${candidate.name} `;
        setDraft((prev) => (prev.trimStart().startsWith(`@${candidate.name}`) ? prev : `${prefix}${prev}`));
        if (!trackedSelectionsRef.current.some((s) => s.id === candidate.id)) {
          trackedSelectionsRef.current = [...trackedSelectionsRef.current, candidate];
        }
      }
    }
  };

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || submittingLockRef.current) {
      return;
    }

    submittingLockRef.current = true;
    setSubmitting(true);
    try {
      const mentionedUserIds = extractMentionedUserIds(
        trimmed,
        candidates,
        trackedSelectionsRef.current,
      );
      await createTaskComment(task.id, {
        content: trimmed,
        parentId: replyingTo?.targetCommentId,
        mentionedUserIds,
      });
      setDraft('');
      setReplyingTo(null);
      trackedSelectionsRef.current = [];
      await fetchComments();
      onChanged?.();
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, 'Không thể gửi bình luận'));
    } finally {
      submittingLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleStartEdit = (comment: TaskComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.content);
    editSelectionsRef.current = comment.mentions.map((m) => ({ id: m.id, name: m.name }));
  };

  const handleSaveEdit = async (commentId: number) => {
    const trimmed = editDraft.trim();
    if (!trimmed || savingEdit) return;

    setSavingEdit(true);
    try {
      const mentionedUserIds = extractMentionedUserIds(
        trimmed,
        candidates,
        editSelectionsRef.current,
      );
      await updateTaskComment(task.id, commentId, {
        content: trimmed,
        mentionedUserIds,
      });
      setEditingId(null);
      setEditDraft('');
      editSelectionsRef.current = [];
      await fetchComments();
      onChanged?.();
      message.success('Đã cập nhật bình luận');
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, 'Không thể cập nhật bình luận'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    if (deletingId !== null) return;
    setDeletingId(commentId);
    try {
      await deleteTaskComment(task.id, commentId);
      if (replyingTo?.targetCommentId === commentId) {
        setReplyingTo(null);
      }
      await fetchComments();
      onChanged?.();
      message.success('Đã xóa bình luận');
    } catch (err) {
      message.error(getFriendlyErrorMessage(err, 'Không thể xóa bình luận'));
    } finally {
      setDeletingId(null);
    }
  };

  const renderCommentNode = (item: TaskComment, isReply: boolean) => {
    const isHighlighted = highlightCommentId === item.id;
    const isEditing = editingId === item.id;
    const canEdit = canEditTaskComment(item, currentUser?.id);
    const canDelete = canDeleteTaskComment(item, currentUser?.id, task, team);
    const wasEdited =
      new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime() > 1500;
    const deletePrompt =
      !isReply && item.replies.length > 0
        ? `Xóa bình luận này sẽ xóa luôn ${item.replies.length} phản hồi bên dưới?`
        : 'Bạn chắc chắn muốn xóa bình luận này?';

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el) rowRefs.current.set(item.id, el);
          else rowRefs.current.delete(item.id);
        }}
        style={{
          padding: isReply ? '8px 10px' : '10px 12px',
          borderRadius: 8,
          backgroundColor: isHighlighted ? '#e6f4ff' : isReply ? '#fafafa' : '#ffffff',
          border: isHighlighted ? '1px solid #91caff' : '1px solid #f0f0f0',
          transition: 'background-color 0.25s ease, border-color 0.25s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Avatar
            size={isReply ? 26 : 30}
            style={{
              backgroundColor: item.authorId === currentUser?.id ? '#1677ff' : '#597ef7',
              flexShrink: 0,
              fontSize: isReply ? 11 : 12,
            }}
          >
            {getInitials(item.author.name)}
          </Avatar>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <Space size={6} wrap>
                <Text strong style={{ fontSize: 13 }}>
                  {item.author.name}
                </Text>
                {item.authorId === currentUser?.id ? (
                  <Tag color="default" variant="filled" style={{ margin: 0, fontSize: 11 }}>
                    Bạn
                  </Tag>
                ) : null}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatCommentTimestamp(item.createdAt)}
                  {wasEdited ? ' (đã sửa)' : ''}
                </Text>
              </Space>
            </div>

            {isEditing ? (
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Mentions
                  rows={2}
                  value={editDraft}
                  onChange={setEditDraft}
                  onSelect={(opt) => handleSelectMention(opt, editSelectionsRef)}
                  options={mentionOptions}
                  placeholder="Chỉnh sửa bình luận (gõ @ để nhắc thành viên)..."
                  maxLength={2000}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveEdit(item.id);
                    }
                  }}
                />
                <Space size={8}>
                  <Button
                    type="primary"
                    size="small"
                    loading={savingEdit}
                    disabled={!editDraft.trim()}
                    onClick={() => void handleSaveEdit(item.id)}
                  >
                    Lưu
                  </Button>
                  <Button
                    size="small"
                    disabled={savingEdit}
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft('');
                    }}
                  >
                    Huỷ
                  </Button>
                </Space>
              </div>
            ) : (
              <div style={{ marginTop: 4 }}>{renderMentionText(item.content, item.mentions)}</div>
            )}

            {!isEditing ? (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Button
                  type="text"
                  size="small"
                  icon={<RollbackOutlined />}
                  onClick={() => handleStartReply(item)}
                  style={{ paddingInline: 6, fontSize: 12, color: '#595959' }}
                >
                  Phản hồi
                </Button>
                {canEdit ? (
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleStartEdit(item)}
                    style={{ paddingInline: 6, fontSize: 12, color: '#595959' }}
                  >
                    Sửa
                  </Button>
                ) : null}
                {canDelete ? (
                  <Popconfirm
                    title={deletePrompt}
                    okText="Xóa"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true, loading: deletingId === item.id }}
                    onConfirm={() => void handleDelete(item.id)}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ paddingInline: 6, fontSize: 12 }}
                    >
                      Xóa
                    </Button>
                  </Popconfirm>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          maxHeight: 340,
          overflowY: 'auto',
          paddingRight: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {loading ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : loadError ? (
          <ApiErrorFallback
            variant="inline"
            error={loadError}
            onRetry={() => {
              setLoading(true);
              setLoadError(null);
              void fetchComments();
            }}
            showNavigation={false}
          />
        ) : comments.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có bình luận nào. Hãy gõ @ để nhắc đồng đội trao đổi về công việc này."
            style={{ margin: '18px 0' }}
          />
        ) : (
          comments.map((root) => (
            <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {renderCommentNode(root, false)}
              {root.replies.length > 0 ? (
                <div
                  style={{
                    marginLeft: 18,
                    paddingLeft: 10,
                    borderLeft: '2px solid #e6f4ff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  {root.replies.map((reply) => renderCommentNode(reply, true))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
        {replyingTo ? (
          <div
            style={{
              marginBottom: 8,
              padding: '6px 10px',
              borderRadius: 6,
              backgroundColor: '#f0f5ff',
              border: '1px solid #d6e4ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text style={{ fontSize: 12, color: '#1d39c4' }}>
                <MessageOutlined style={{ marginRight: 6 }} />
                Đang phản hồi <strong>{replyingTo.authorName}</strong>:{' '}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {replyingTo.excerpt}
                </Text>
              </Text>
            </div>
            <Button
              type="text"
              size="small"
              aria-label="Hủy phản hồi"
              icon={<CloseOutlined />}
              onClick={() => setReplyingTo(null)}
            />
          </div>
        ) : null}

        <Mentions
          rows={2}
          value={draft}
          onChange={setDraft}
          onSelect={(opt) => handleSelectMention(opt, trackedSelectionsRef)}
          options={mentionOptions}
          placeholder={
            candidates.length > 0
              ? 'Viết bình luận... Gõ @ để nhắc thành viên (Ctrl+Enter để gửi)'
              : 'Viết bình luận cho công việc này (Ctrl+Enter để gửi)'
          }
          maxLength={2000}
          disabled={submitting}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />

        <div
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            {candidates.length > 0
              ? `Gõ @ để gợi ý ${candidates.length} thành viên • Ctrl+Enter để gửi`
              : 'Ctrl+Enter để gửi nhanh'}
          </Text>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={submitting}
            disabled={!draft.trim()}
            onClick={() => void handleSubmit()}
          >
            {replyingTo ? 'Gửi phản hồi' : 'Gửi bình luận'}
          </Button>
        </div>
      </div>
    </div>
  );
};
