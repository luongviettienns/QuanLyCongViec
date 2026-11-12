import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  List,
  Button,
  Tag,
  Select,
  Input,
  Progress,
  Alert,
  Popconfirm,
  Typography,
  message,
  Spin,
  Empty,
  Card,
  Modal,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
  EditOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { Task, Subtask, TaskStatus } from '../types/task.types';
import type { User } from '../../auth/types/auth.types';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  mergeServerSubtask,
  shouldAcceptRemoteSubtaskFetch,
  detectSubtaskEditConflict,
} from '../utils/subtask-sync.utils';
import {
  getSubtasks,
  createSubtask,
  updateSubtask,
  updateSubtaskStatus,
  deleteSubtask,
  reorderSubtasks,
} from '../api/tasks.api';

const { Text } = Typography;

interface TaskSubtasksSectionProps {
  task: Task;
  currentUser?: User | null;
  canManage: boolean;
  highlightSubtaskId?: number | null;
  onChanged?: () => void;
}

export function TaskSubtasksSection({
  task,
  currentUser,
  canManage,
  highlightSubtaskId,
  onChanged,
}: TaskSubtasksSectionProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<number | undefined>(undefined);
  const [showAddForm, setShowAddForm] = useState(false);

  const [editingSubtask, setEditingSubtask] = useState<Subtask | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState<number | undefined>(undefined);
  const [updating, setUpdating] = useState(false);
  const [editConflictWarning, setEditConflictWarning] = useState(false);
  const [remoteLatestSubtask, setRemoteLatestSubtask] = useState<Subtask | null>(null);
  const mutationSeqRef = useRef(0);
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
    editDraftRef.current = {
      editingSubtask,
      title: editTitle,
      description: editDescription,
      assigneeId: editAssigneeId,
    };
  }, [editingSubtask, editTitle, editDescription, editAssigneeId]);

  useEffect(() => {
    if (!highlightSubtaskId || loading) {
      return;
    }
    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [highlightSubtaskId, loading, subtasks.length]);

  const fetchSubtasks = useCallback(async () => {
    const fetchStartedSeq = mutationSeqRef.current;
    try {
      setLoading(true);
      const data = await getSubtasks(task.id);
      if (!shouldAcceptRemoteSubtaskFetch(fetchStartedSeq, mutationSeqRef.current)) {
        return;
      }
      setSubtasks(data);

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
          message.warning('Việc con đang chỉnh sửa đã bị xóa.');
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
      message.error(err instanceof Error ? err.message : 'Không thể tải danh sách công việc con');
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    let cancelled = false;
    getSubtasks(task.id)
      .then((data) => {
        if (!cancelled) {
          setSubtasks(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          message.error(err instanceof Error ? err.message : 'Không thể tải danh sách công việc con');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const handleRealtimeSubtask = useCallback(
    (event: RealtimeEventData) => {
      const payload = event.payload as { taskId?: number } | undefined;
      if (payload?.taskId === task.id) {
        void fetchSubtasks();
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
    void fetchSubtasks();
  });

  const isParentDone = task.status === 'DONE';

  const subtaskStats = useMemo(() => {
    const total = subtasks.length;
    const done = subtasks.filter((s) => s.status === 'DONE').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  }, [subtasks]);

  // Candidates for subtask assignment: Main Assignee + Accepted Collaborators
  const eligibleAssignees = useMemo(() => {
    const list: Array<{ value: number; label: string }> = [];
    if (task.assignee) {
      list.push({
        value: task.assignee.id,
        label: `${task.assignee.name} (Phụ trách chính)`,
      });
    }

    if (task.collaborators) {
      task.collaborators
        .filter((c) => c.status === 'ACCEPTED' && c.userId !== task.assigneeId)
        .forEach((c) => {
          list.push({
            value: c.userId,
            label: `${c.user?.name || `User #${c.userId}`} (Phối hợp)`,
          });
        });
    }

    return list;
  }, [task.assignee, task.assigneeId, task.collaborators]);

  const handleAddSubtask = async () => {
    if (!newTitle.trim()) {
      message.warning('Vui lòng nhập tiêu đề việc con');
      return;
    }
    mutationSeqRef.current += 1;
    try {
      setAdding(true);
      await createSubtask(task.id, {
        title: newTitle.trim(),
        assigneeId: newAssigneeId || null,
      });
      message.success('Đã thêm công việc con');
      setNewTitle('');
      setNewAssigneeId(undefined);
      setShowAddForm(false);
      await fetchSubtasks();
      onChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể thêm công việc con');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (subtaskId: number, newStatus: TaskStatus) => {
    if (isParentDone && newStatus !== 'DONE') {
      message.warning('Không thể đổi trạng thái việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.');
      return;
    }

    const current = subtasks.find((s) => s.id === subtaskId);
    if (current && current.status === 'TODO' && newStatus === 'DONE') {
      message.warning(
        'Không thể chuyển công việc con trực tiếp từ Cần làm sang Hoàn thành (TODO -> DONE). Phải chuyển sang Đang làm (IN_PROGRESS) trước.',
      );
      return;
    }

    // Optimistic update
    const previous = [...subtasks];
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, status: newStatus } : s)),
    );

    mutationSeqRef.current += 1;
    try {
      const updated = await updateSubtaskStatus(task.id, subtaskId, newStatus);
      setSubtasks((prev) => mergeServerSubtask(prev, updated));
      message.success('Đã cập nhật trạng thái việc con');
      onChanged?.();
    } catch (err: unknown) {
      // Rollback on failure
      setSubtasks(previous);
      message.error(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái việc con');
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    mutationSeqRef.current += 1;
    try {
      await deleteSubtask(task.id, subtaskId);
      message.success('Đã xoá công việc con');
      await fetchSubtasks();
      onChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể xoá việc con');
    }
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
    if (!editTitle.trim()) {
      message.warning('Vui lòng nhập tiêu đề việc con');
      return;
    }
    mutationSeqRef.current += 1;
    try {
      setUpdating(true);
      await updateSubtask(task.id, editingSubtask.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        assigneeId: editAssigneeId || null,
      });
      message.success('Đã cập nhật công việc con');
      setEditingSubtask(null);
      setEditConflictWarning(false);
      setRemoteLatestSubtask(null);
      await fetchSubtasks();
      onChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể cập nhật công việc con');
    } finally {
      setUpdating(false);
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === subtasks.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const next = [...subtasks];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);

    const prev = [...subtasks];
    setSubtasks(next);

    try {
      await reorderSubtasks(
        task.id,
        next.map((s) => s.id),
      );
      onChanged?.();
    } catch (err: unknown) {
      setSubtasks(prev);
      message.error(err instanceof Error ? err.message : 'Không thể sắp xếp công việc con');
    }
  };

  const canUserChangeStatus = (subtask: Subtask) => {
    if (canManage) return true;
    if (!currentUser) return false;
    // Collaborator assigned to this subtask
    const isAssigned = subtask.assigneeId === currentUser.id;
    const isAcceptedCollab = task.collaborators?.some(
      (c) => c.userId === currentUser.id && c.status === 'ACCEPTED',
    );
    return isAssigned && Boolean(isAcceptedCollab);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isParentDone && (
        <Alert
          type="warning"
          showIcon
          message="Công việc chính đã hoàn thành (DONE)"
          description="Để đảm bảo tính nhất quán dữ liệu, không thể tạo thêm việc con hoặc chuyển việc con sang chưa hoàn thành khi công việc chính đang ở trạng thái hoàn thành. Hãy chuyển trạng thái công việc chính về IN_PROGRESS nếu muốn tiếp tục thực hiện."
        />
      )}

      {subtasks.length > 0 && (
        <Card size="small" style={{ background: '#fafbfc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text strong>
              Tiến độ việc con ({subtaskStats.done}/{subtaskStats.total})
            </Text>
            <Text strong style={{ color: subtaskStats.percent === 100 ? '#52c41a' : '#1890ff' }}>
              {subtaskStats.percent}%
            </Text>
          </div>
          <Progress
            percent={subtaskStats.percent}
            strokeColor={subtaskStats.percent === 100 ? '#52c41a' : '#1890ff'}
          />
        </Card>
      )}

      {canManage && !isParentDone && (
        <div>
          {!showAddForm ? (
            <Button
              type="dashed"
              block
              icon={<PlusOutlined />}
              onClick={() => setShowAddForm(true)}
            >
              Thêm công việc con (Subtask)
            </Button>
          ) : (
            <Card size="small" title="Tạo công việc con mới" extra={<Button type="text" size="small" onClick={() => setShowAddForm(false)}>Đóng</Button>}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Input
                  placeholder="Tiêu đề việc con (VD: Thiết kế giao diện...)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onPressEnter={handleAddSubtask}
                  maxLength={255}
                />
                <Select
                  allowClear
                  placeholder="Chọn người thực hiện (Phụ trách chính hoặc Người phối hợp)"
                  options={eligibleAssignees}
                  value={newAssigneeId}
                  onChange={setNewAssigneeId}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button size="small" onClick={() => setShowAddForm(false)}>
                    Hủy
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    loading={adding}
                    onClick={handleAddSubtask}
                  >
                    Thêm
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : subtasks.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Chưa có công việc con nào"
        />
      ) : (
        <List
          size="small"
          bordered
          dataSource={subtasks}
          renderItem={(item, index) => {
            const isManager = canManage;
            const isAssignedCollab = !isManager && canUserChangeStatus(item);
            const isStatusDisabled =
              isParentDone ||
              (!isManager && !isAssignedCollab) ||
              (isAssignedCollab && item.status === 'DONE');

            const statusOptions = isManager
              ? [
                  { value: 'TODO', label: 'TODO' },
                  { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                  { value: 'DONE', label: 'DONE', disabled: item.status === 'TODO' },
                ]
              : item.status === 'TODO'
                ? [
                    { value: 'TODO', label: 'TODO', disabled: true },
                    { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                  ]
                : item.status === 'IN_PROGRESS'
                  ? [
                      { value: 'IN_PROGRESS', label: 'IN_PROGRESS', disabled: true },
                      { value: 'DONE', label: 'DONE' },
                    ]
                  : [{ value: 'DONE', label: 'DONE' }];
            const isHighlighted = item.id === highlightSubtaskId;
            return (
              <List.Item
                style={
                  isHighlighted
                    ? {
                        backgroundColor: '#e6f4ff',
                        boxShadow: 'inset 3px 0 0 #1677ff',
                      }
                    : undefined
                }
                actions={[
                  canManage && !isParentDone && subtasks.length > 1 && (
                    <Tooltip key="up" title="Di chuyển lên">
                      <Button
                        size="small"
                        type="text"
                        disabled={index === 0}
                        icon={<ArrowUpOutlined />}
                        onClick={() => handleMove(index, 'up')}
                      />
                    </Tooltip>
                  ),
                  canManage && !isParentDone && subtasks.length > 1 && (
                    <Tooltip key="down" title="Di chuyển xuống">
                      <Button
                        size="small"
                        type="text"
                        disabled={index === subtasks.length - 1}
                        icon={<ArrowDownOutlined />}
                        onClick={() => handleMove(index, 'down')}
                      />
                    </Tooltip>
                  ),
                  canManage && !isParentDone && (
                    <Tooltip key="edit" title="Chỉnh sửa việc con">
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEdit(item)}
                      />
                    </Tooltip>
                  ),
                  canManage && !isParentDone && (
                    <Popconfirm
                      key="delete"
                      title="Xóa công việc con này?"
                      onConfirm={() => handleDeleteSubtask(item.id)}
                      okText="Xóa"
                      cancelText="Hủy"
                    >
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <div
                  ref={isHighlighted ? highlightedRowRef : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}
                >
                  <Select
                    size="small"
                    value={item.status}
                    disabled={isStatusDisabled}
                    style={{ width: 130 }}
                    onChange={(val) => handleStatusChange(item.id, val)}
                    options={statusOptions}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text
                        delete={item.status === 'DONE'}
                        style={{
                          fontWeight: 500,
                          color: item.status === 'DONE' ? '#8c8c8c' : '#262626',
                        }}
                      >
                        {item.title}
                      </Text>
                      {item.assignee && (
                        <Tag icon={<UserOutlined />} color="purple" style={{ fontSize: 11, margin: 0 }}>
                          {item.assignee.name}
                        </Tag>
                      )}
                      {item.status === 'DONE' && item.completedBy && (
                        <Tooltip
                          title={`Hoàn thành bởi: ${item.completedBy.name}${
                            item.completedAt
                              ? ` lúc ${new Date(item.completedAt).toLocaleString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })}`
                              : ''
                          }`}
                        >
                          <Tag
                            icon={<CheckCircleOutlined />}
                            color="green"
                            style={{ fontSize: 11, margin: 0, cursor: 'help' }}
                          >
                            Hoàn thành bởi {item.completedBy.name}
                          </Tag>
                        </Tooltip>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
              </List.Item>
            );
          }}
        />
      )}

      <Modal
        title="Chỉnh sửa công việc con"
        open={Boolean(editingSubtask)}
        onOk={handleSaveEdit}
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
              message="Việc con vừa được cập nhật từ người khác"
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
              placeholder="Nhập tiêu đề việc con..."
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
              options={eligibleAssignees}
              value={editAssigneeId}
              onChange={setEditAssigneeId}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
