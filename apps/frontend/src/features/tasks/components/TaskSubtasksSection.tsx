import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Typography,
  message,
} from 'antd';
import { DragDropProvider } from '@dnd-kit/react';
import {
  PointerSensor,
  PointerActivationConstraints,
  KeyboardSensor,
} from '@dnd-kit/dom';
import type { Task, Subtask, TaskStatus } from '../types/task.types';
import type { User } from '../../auth/types/auth.types';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import { ApiErrorFallback } from '../../../app/pages/errors';
import { getFriendlyErrorMessage } from '../../../shared/api';
import {
  resolveSectionRenderPlan,
  shouldIgnoreTaskApiError,
} from '../utils/task-error.utils';
import {
  mergeServerSubtask,
  shouldAcceptRemoteSubtaskFetch,
  detectSubtaskEditConflict,
} from '../utils/subtask-sync.utils';
import {
  buildChecklistAssigneeOptions,
  getChecklistProgress,
  isUserAssignedCollaboratorOnSubtask,
  reorderChecklistArray,
  resolveDragReorderIndices,
  shouldApplyTaskScopedResult,
  validateChecklistTitle,
  type ChecklistSaveState,
} from '../utils/checklist.utils';
import {
  getSubtasks,
  createSubtask,
  updateSubtask,
  updateSubtaskStatus,
  deleteSubtask,
  reorderSubtasks,
} from '../api/tasks.api';
import {
  ChecklistAddInput,
  ChecklistHeader,
  ChecklistItemRow,
} from './checklist';
import './checklist/checklist.css';

const { Text } = Typography;

export interface TaskSubtasksSectionProps {
  task: Task;
  currentUser?: User | null;
  canManage: boolean;
  variant?: 'standard' | 'compact';
  initialSubtasks?: Subtask[];
  highlightSubtaskId?: number | null;
  onChanged?: () => void;
  onSubtasksChange?: (taskId: number, subtasks: Subtask[]) => void;
}

export function TaskSubtasksSection({
  task,
  currentUser,
  canManage,
  variant = 'standard',
  initialSubtasks,
  highlightSubtaskId,
  onChanged,
  onSubtasksChange,
}: TaskSubtasksSectionProps) {
  const compact = variant === 'compact';
  const fallbackInitial = initialSubtasks ?? task.subtasks ?? [];

  const [prevTaskId, setPrevTaskId] = useState(task.id);
  const [subtasks, setSubtasks] = useState<Subtask[]>(fallbackInitial);
  const [loading, setLoading] = useState(fallbackInitial.length === 0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [adding, setAdding] = useState(false);
  const [saveState, setSaveState] = useState<ChecklistSaveState>('idle');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState<number | undefined>(undefined);
  const [updating, setUpdating] = useState(false);
  const [editConflictWarning, setEditConflictWarning] = useState(false);
  const [remoteLatestSubtask, setRemoteLatestSubtask] = useState<Subtask | null>(null);

  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id);
    setSubtasks(fallbackInitial);
    setLoading(fallbackInitial.length === 0);
    setLoadError(null);
    setSaveState('idle');
    setSaveErrorMessage(null);
    setEditingSubtask(null);
    setEditConflictWarning(false);
    setRemoteLatestSubtask(null);
  }

  const mutationSeqRef = useRef(0);
  const fetchSeqRef = useRef(0);
  const activeTaskIdRef = useRef(task.id);
  const isMountedRef = useRef(true);
  const subtasksRef = useRef<Subtask[]>(subtasks);
  const activeSavesRef = useRef(0);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightedRowRef = useRef<HTMLDivElement | null>(null);

  const editDraftRef = useRef<{
    editingSubtask: Subtask | null;
    title: string;
    description: string;
    assigneeId: number | undefined;
  }>({
    editingSubtask: null,
    title: '',
    description: '',
    assigneeId: undefined,
  });

  useEffect(() => {
    activeTaskIdRef.current = task.id;
  }, [task.id]);

  useEffect(() => {
    subtasksRef.current = subtasks;
  }, [subtasks]);

  useEffect(() => {
    editDraftRef.current = {
      editingSubtask,
      title: editTitle,
      description: editDescription,
      assigneeId: editAssigneeId,
    };
  }, [editingSubtask, editTitle, editDescription, editAssigneeId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!highlightSubtaskId || loading) {
      return;
    }
    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [highlightSubtaskId, loading, subtasks.length]);

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, []);

  const beginSave = useCallback(() => {
    activeSavesRef.current += 1;
    clearSavedTimer();
    setSaveState('saving');
    setSaveErrorMessage(null);
  }, [clearSavedTimer]);

  const endSaveSuccess = useCallback(
    (targetTaskId: number) => {
      activeSavesRef.current = Math.max(0, activeSavesRef.current - 1);
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      if (activeSavesRef.current === 0) {
        setSaveState('saved');
        clearSavedTimer();
        savedTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setSaveState((curr) => (curr === 'saved' ? 'idle' : curr));
          }
        }, 2500);
      }
    },
    [clearSavedTimer],
  );

  const endSaveError = useCallback(
    (targetTaskId: number, err: unknown, fallbackMessage: string) => {
      activeSavesRef.current = Math.max(0, activeSavesRef.current - 1);
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      if (shouldIgnoreTaskApiError(err)) {
        if (activeSavesRef.current === 0) {
          setSaveState('idle');
        }
        return;
      }
      const friendly = getFriendlyErrorMessage(err, fallbackMessage);
      setSaveState('error');
      setSaveErrorMessage('Lưu thất bại');
      message.error(friendly);
    },
    [],
  );

  const applyAndNotifySubtasks = useCallback(
    (targetTaskId: number, nextList: Subtask[], notifyChanged = true) => {
      subtasksRef.current = nextList;
      setSubtasks(nextList);
      onSubtasksChange?.(targetTaskId, nextList);
      if (notifyChanged) {
        onChanged?.();
      }
    },
    [onChanged, onSubtasksChange],
  );

  const fetchSubtasks = useCallback(
    async (options?: { syncParent?: boolean }) => {
      const targetTaskId = task.id;
      const requestSeq = ++fetchSeqRef.current;
      const fetchStartedSeq = mutationSeqRef.current;

      try {
        if (subtasksRef.current.length === 0) {
          setLoading(true);
        }
        const data = await getSubtasks(targetTaskId);
        if (
          !shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current) ||
          fetchSeqRef.current !== requestSeq ||
          !shouldAcceptRemoteSubtaskFetch(fetchStartedSeq, mutationSeqRef.current)
        ) {
          return;
        }

        subtasksRef.current = data;
        setSubtasks(data);
        setLoadError(null);
        if (options?.syncParent) {
          onSubtasksChange?.(targetTaskId, data);
        }

        const draft = editDraftRef.current;
        if (draft.editingSubtask) {
          const conflictState = detectSubtaskEditConflict({
            editingSubtask: draft.editingSubtask,
            latestSubtasks: data,
            draftTitle: draft.title,
            draftDescription: draft.description,
            draftAssigneeId: draft.assigneeId,
          });
          if (conflictState === 'deleted') {
            setEditingSubtask(null);
            setEditConflictWarning(false);
            setRemoteLatestSubtask(null);
            message.warning('Đầu việc đang chỉnh sửa đã bị xóa.');
          } else if (conflictState === 'conflict') {
            const remote = data.find((s) => s.id === draft.editingSubtask?.id) ?? null;
            setRemoteLatestSubtask(remote);
            setEditConflictWarning(true);
          } else if (conflictState === 'safe_sync') {
            const remote = data.find((s) => s.id === draft.editingSubtask?.id);
            if (remote) {
              setEditingSubtask(remote);
              setEditTitle(remote.title);
              setEditDescription(remote.description || '');
              setEditAssigneeId(remote.assigneeId ?? undefined);
              setEditConflictWarning(false);
              setRemoteLatestSubtask(null);
            }
          }
        }
      } catch (err: unknown) {
        if (
          !shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current) ||
          fetchSeqRef.current !== requestSeq ||
          shouldIgnoreTaskApiError(err)
        ) {
          return;
        }
        setLoadError(err);
      } finally {
        if (
          shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current) &&
          fetchSeqRef.current === requestSeq
        ) {
          setLoading(false);
        }
      }
    },
    [task.id, onSubtasksChange],
  );

  useEffect(() => {
    let active = true;
    async function init() {
      await Promise.resolve();
      if (active) {
        await fetchSubtasks();
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [fetchSubtasks]);

  const handleRealtimeSubtask = useCallback(
    (event: RealtimeEventData) => {
      const payload = event.payload as { taskId?: number } | undefined;
      if (payload?.taskId === task.id) {
        void fetchSubtasks({ syncParent: true });
        onChanged?.();
      }
    },
    [task.id, fetchSubtasks, onChanged],
  );

  useRealtimeEvent('SUBTASK_CREATED', handleRealtimeSubtask);
  useRealtimeEvent('SUBTASK_UPDATED', handleRealtimeSubtask);
  useRealtimeEvent('SUBTASK_DELETED', handleRealtimeSubtask);
  useRealtimeEvent('SUBTASK_REORDERED', handleRealtimeSubtask);
  useRealtimeEvent('TASK_COLLABORATORS_CHANGED', handleRealtimeSubtask);

  useRealtimeReconnect(() => {
    void fetchSubtasks({ syncParent: true });
  });

  const isParentDone = task.status === 'DONE';

  const progress = useMemo(() => getChecklistProgress(subtasks), [subtasks]);

  const eligibleAssignees = useMemo(() => buildChecklistAssigneeOptions(task), [task]);

  const handleAddChecklistItem = async (
    cleanTitle: string,
    assigneeId: number | null,
  ): Promise<boolean> => {
    const targetTaskId = task.id;
    mutationSeqRef.current += 1;
    beginSave();
    setAdding(true);

    try {
      const created = await createSubtask(targetTaskId, {
        title: cleanTitle,
        assigneeId,
      });
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return false;
      }
      const nextList = [...subtasksRef.current, created];
      applyAndNotifySubtasks(targetTaskId, nextList);
      endSaveSuccess(targetTaskId);
      void fetchSubtasks({ syncParent: true });
      return true;
    } catch (err: unknown) {
      endSaveError(targetTaskId, err, 'Không thể thêm đầu việc');
      return false;
    } finally {
      if (isMountedRef.current) {
        setAdding(false);
      }
    }
  };

  const handleStatusChange = async (subtaskId: number, newStatus: TaskStatus) => {
    const targetTaskId = task.id;
    if (isParentDone && newStatus !== 'DONE') {
      message.warning(
        'Không thể mở lại đầu việc khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      );
      return;
    }

    const previous = [...subtasksRef.current];
    const current = previous.find((s) => s.id === subtaskId);
    if (!current || current.status === newStatus) {
      return;
    }
    if (current.status === 'TODO' && newStatus === 'DONE') {
      message.warning(
        'Không thể chuyển trực tiếp từ Cần làm sang Hoàn thành. Hãy chuyển sang Đang làm trước.',
      );
      return;
    }

    const optimistic = previous.map((s) =>
      s.id === subtaskId ? { ...s, status: newStatus } : s,
    );
    applyAndNotifySubtasks(targetTaskId, optimistic, false);

    mutationSeqRef.current += 1;
    beginSave();
    try {
      const updated = await updateSubtaskStatus(targetTaskId, subtaskId, newStatus);
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      const merged = mergeServerSubtask(subtasksRef.current, updated);
      applyAndNotifySubtasks(targetTaskId, merged);
      endSaveSuccess(targetTaskId);
    } catch (err: unknown) {
      if (shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        applyAndNotifySubtasks(targetTaskId, previous, false);
      }
      endSaveError(targetTaskId, err, 'Không thể cập nhật trạng thái đầu việc');
    }
  };

  const handleInlineRename = async (subtaskId: number, nextTitle: string): Promise<boolean> => {
    const targetTaskId = task.id;
    const previous = [...subtasksRef.current];
    const current = previous.find((s) => s.id === subtaskId);
    if (!current || current.title === nextTitle) {
      return true;
    }

    const optimistic = previous.map((s) =>
      s.id === subtaskId ? { ...s, title: nextTitle } : s,
    );
    applyAndNotifySubtasks(targetTaskId, optimistic, false);

    mutationSeqRef.current += 1;
    beginSave();
    try {
      const updated = await updateSubtask(targetTaskId, subtaskId, { title: nextTitle });
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return false;
      }
      const merged = mergeServerSubtask(subtasksRef.current, updated);
      applyAndNotifySubtasks(targetTaskId, merged);
      endSaveSuccess(targetTaskId);
      return true;
    } catch (err: unknown) {
      if (shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        applyAndNotifySubtasks(targetTaskId, previous, false);
      }
      endSaveError(targetTaskId, err, 'Không thể đổi tên đầu việc');
      return false;
    }
  };

  const handleQuickAssign = async (subtaskId: number, nextAssigneeId: number | null) => {
    const targetTaskId = task.id;
    const previous = [...subtasksRef.current];
    const current = previous.find((s) => s.id === subtaskId);
    if (!current || (current.assigneeId ?? null) === nextAssigneeId) {
      return;
    }

    const matchedOpt = eligibleAssignees.find((a) => a.value === nextAssigneeId);
    const optimistic = previous.map((s) =>
      s.id === subtaskId
        ? {
            ...s,
            assigneeId: nextAssigneeId,
            assignee: matchedOpt ? { id: matchedOpt.value, name: matchedOpt.name, email: '' } : null,
          }
        : s,
    );
    applyAndNotifySubtasks(targetTaskId, optimistic, false);

    mutationSeqRef.current += 1;
    beginSave();
    try {
      const updated = await updateSubtask(targetTaskId, subtaskId, {
        assigneeId: nextAssigneeId,
      });
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      const merged = mergeServerSubtask(subtasksRef.current, updated);
      applyAndNotifySubtasks(targetTaskId, merged);
      endSaveSuccess(targetTaskId);
    } catch (err: unknown) {
      if (shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        applyAndNotifySubtasks(targetTaskId, previous, false);
      }
      endSaveError(targetTaskId, err, 'Không thể cập nhật người phụ trách');
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    const targetTaskId = task.id;
    const previous = [...subtasksRef.current];
    const optimistic = previous.filter((s) => s.id !== subtaskId);
    applyAndNotifySubtasks(targetTaskId, optimistic, false);

    mutationSeqRef.current += 1;
    beginSave();
    try {
      await deleteSubtask(targetTaskId, subtaskId);
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      endSaveSuccess(targetTaskId);
      void fetchSubtasks({ syncParent: true });
      onChanged?.();
    } catch (err: unknown) {
      if (shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        applyAndNotifySubtasks(targetTaskId, previous, false);
      }
      endSaveError(targetTaskId, err, 'Không thể xóa đầu việc');
    }
  };

  const handleReorderByIndices = async (fromIndex: number, toIndex: number) => {
    const targetTaskId = task.id;
    const previous = [...subtasksRef.current];
    const next = reorderChecklistArray(previous, fromIndex, toIndex);
    if (next.every((item, idx) => item.id === previous[idx]?.id)) {
      return;
    }

    applyAndNotifySubtasks(targetTaskId, next, false);
    mutationSeqRef.current += 1;
    beginSave();
    try {
      const canonical = await reorderSubtasks(
        targetTaskId,
        next.map((s) => s.id),
      );
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      applyAndNotifySubtasks(targetTaskId, canonical);
      endSaveSuccess(targetTaskId);
    } catch (err: unknown) {
      if (shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        applyAndNotifySubtasks(targetTaskId, previous, false);
      }
      endSaveError(targetTaskId, err, 'Không thể sắp xếp lại checklist');
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= subtasksRef.current.length) {
      return;
    }
    void handleReorderByIndices(index, targetIndex);
  };

  const handleOpenEdit = (subtask: Subtask) => {
    setEditConflictWarning(false);
    setRemoteLatestSubtask(null);
    setEditingSubtask(subtask);
    setEditTitle(subtask.title);
    setEditDescription(subtask.description || '');
    setEditAssigneeId(subtask.assigneeId || undefined);
  };

  const handleSaveEdit = async () => {
    if (!editingSubtask) return;
    const validation = validateChecklistTitle(editTitle);
    if (!validation.valid) {
      message.warning(validation.errorMessage || 'Tiêu đề đầu việc không hợp lệ');
      return;
    }

    const targetTaskId = task.id;
    mutationSeqRef.current += 1;
    beginSave();
    setUpdating(true);
    try {
      const updated = await updateSubtask(targetTaskId, editingSubtask.id, {
        title: validation.title,
        description: editDescription.trim() || null,
        assigneeId: editAssigneeId || null,
      });
      if (!shouldApplyTaskScopedResult(targetTaskId, activeTaskIdRef.current, isMountedRef.current)) {
        return;
      }
      const merged = mergeServerSubtask(subtasksRef.current, updated);
      applyAndNotifySubtasks(targetTaskId, merged);
      setEditingSubtask(null);
      setEditConflictWarning(false);
      setRemoteLatestSubtask(null);
      endSaveSuccess(targetTaskId);
    } catch (err: unknown) {
      endSaveError(targetTaskId, err, 'Không thể cập nhật đầu việc');
    } finally {
      if (isMountedRef.current) {
        setUpdating(false);
      }
    }
  };

  const renderPlan = resolveSectionRenderPlan(loading, loadError, subtasks.length);
  const canDragReorder = canManage && !isParentDone && subtasks.length > 1;
  const canShowAddInput = canManage && !isParentDone;

  const listContent = (
    <div className="checklist-list">
      {subtasks.map((item, index) => (
        <ChecklistItemRow
          key={item.id}
          item={item}
          index={index}
          totalCount={subtasks.length}
          compact={compact}
          canManage={canManage}
          isAssignedCollaborator={isUserAssignedCollaboratorOnSubtask(currentUser, task, item)}
          isParentDone={isParentDone}
          isHighlighted={item.id === highlightSubtaskId}
          eligibleAssignees={eligibleAssignees}
          enableDrag={canDragReorder}
          onChangeStatus={handleStatusChange}
          onRename={handleInlineRename}
          onAssign={handleQuickAssign}
          onMoveUp={(idx) => handleMove(idx, 'up')}
          onMoveDown={(idx) => handleMove(idx, 'down')}
          onOpenFullEdit={handleOpenEdit}
          onDelete={handleDeleteSubtask}
          onHighlightMount={(el) => {
            highlightedRowRef.current = el;
          }}
        />
      ))}
    </div>
  );

  return (
    <div className="checklist-container">
      {isParentDone && !compact && (
        <Alert
          type="warning"
          showIcon
          message="Công việc chính đã hoàn thành (DONE)"
          description="Không thể thêm, sửa hoặc mở lại đầu việc khi công việc chính đang hoàn thành. Hãy chuyển công việc chính sang Đang làm nếu cần chỉnh sửa."
        />
      )}

      <ChecklistHeader
        progress={progress}
        saveState={saveState}
        saveErrorMessage={saveErrorMessage}
        compact={compact}
      />

      {renderPlan.showInlineError && (
        <ApiErrorFallback
          variant="inline"
          error={loadError}
          onRetry={() => void fetchSubtasks()}
          retrying={loading}
          showNavigation={false}
        />
      )}

      {renderPlan.contentState === 'spinner' ? (
        <div style={{ textAlign: 'center', padding: compact ? 14 : 24 }}>
          <Spin size={compact ? 'small' : 'default'} />
        </div>
      ) : renderPlan.contentState === 'empty' ? (
        canShowAddInput ? (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Chưa có đầu việc nào. Nhập bên dưới để bắt đầu.
          </Text>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có đầu việc nào"
            style={{ margin: compact ? '8px 0' : undefined }}
          />
        )
      ) : renderPlan.contentState === 'list' ? (
        canDragReorder ? (
          <DragDropProvider
            sensors={[
              PointerSensor.configure({
                activationConstraints: () => [
                  new PointerActivationConstraints.Distance({ value: 5 }),
                ],
              }),
              KeyboardSensor,
            ]}
            onDragEnd={(event) => {
              if (event.canceled) return;
              const indices = resolveDragReorderIndices(
                subtasksRef.current,
                event.operation.source?.id,
                event.operation.target?.id,
              );
              if (indices) {
                setTimeout(() => {
                  void handleReorderByIndices(indices.fromIndex, indices.toIndex);
                }, 0);
              }
            }}
          >
            {listContent}
          </DragDropProvider>
        ) : (
          listContent
        )
      ) : null}

      {canShowAddInput && (
        <ChecklistAddInput
          key={task.id}
          compact={compact}
          adding={adding}
          eligibleAssignees={eligibleAssignees}
          onAdd={handleAddChecklistItem}
        />
      )}

      <Modal
        title="Chi tiết đầu việc"
        open={Boolean(editingSubtask)}
        onOk={() => void handleSaveEdit()}
        onCancel={() => {
          setEditingSubtask(null);
          setEditConflictWarning(false);
          setRemoteLatestSubtask(null);
        }}
        confirmLoading={updating}
        okText="Lưu"
        cancelText="Hủy"
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {editConflictWarning && remoteLatestSubtask && (
            <Alert
              type="warning"
              showIcon
              message="Đầu việc vừa được cập nhật từ người khác"
              description="Bạn đang có chỉnh sửa chưa lưu. Hãy tải lại dữ liệu mới nhất để tránh ghi đè."
              action={
                <Button
                  size="small"
                  type="primary"
                  onClick={() => {
                    setEditingSubtask(remoteLatestSubtask);
                    setEditTitle(remoteLatestSubtask.title);
                    setEditDescription(remoteLatestSubtask.description || '');
                    setEditAssigneeId(remoteLatestSubtask.assigneeId ?? undefined);
                    setEditConflictWarning(false);
                    setRemoteLatestSubtask(null);
                  }}
                >
                  Tải lại
                </Button>
              }
            />
          )}

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              Tiêu đề <span style={{ color: '#ff4d4f' }}>*</span>
            </label>
            <Input
              placeholder="Nhập tiêu đề đầu việc..."
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={255}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Mô tả</label>
            <Input.TextArea
              placeholder="Nhập mô tả chi tiết (tuỳ chọn)..."
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              showCount
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
              Người thực hiện
            </label>
            <Select
              allowClear
              placeholder="Chọn người thực hiện"
              style={{ width: '100%' }}
              options={eligibleAssignees.map((opt) => ({
                value: opt.value,
                label: opt.label,
              }))}
              value={editAssigneeId}
              onChange={setEditAssigneeId}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
