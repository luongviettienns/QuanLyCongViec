import { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { Task, Subtask, TaskStatus } from '../types/task.types';
import type { User } from '../../auth/types/auth.types';
import {
  getSubtasks,
  createSubtask,
  updateSubtaskStatus,
  deleteSubtask,
} from '../api/tasks.api';

const { Text } = Typography;

interface TaskSubtasksSectionProps {
  task: Task;
  currentUser?: User | null;
  canManage: boolean;
  onChanged?: () => void;
}

export function TaskSubtasksSection({
  task,
  currentUser,
  canManage,
  onChanged,
}: TaskSubtasksSectionProps) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<number | undefined>(undefined);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchSubtasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSubtasks(task.id);
      setSubtasks(data);
    } catch (err: any) {
      message.error(err.message || 'Không thể tải danh sách công việc con');
    } finally {
      setLoading(false);
    }
  }, [task.id]);

  useEffect(() => {
    fetchSubtasks();
  }, [fetchSubtasks]);

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
    } catch (err: any) {
      message.error(err.message || 'Không thể thêm công việc con');
    } finally {
      setAdding(false);
    }
  };

  const handleStatusChange = async (subtaskId: number, newStatus: TaskStatus) => {
    if (isParentDone && newStatus !== 'DONE') {
      message.warning('Không thể đổi trạng thái việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.');
      return;
    }

    // Optimistic update
    const previous = [...subtasks];
    setSubtasks((prev) =>
      prev.map((s) => (s.id === subtaskId ? { ...s, status: newStatus } : s)),
    );

    try {
      await updateSubtaskStatus(task.id, subtaskId, newStatus);
      message.success('Đã cập nhật trạng thái việc con');
      onChanged?.();
    } catch (err: any) {
      // Rollback on failure
      setSubtasks(previous);
      message.error(err.message || 'Không thể cập nhật trạng thái việc con');
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    try {
      await deleteSubtask(task.id, subtaskId);
      message.success('Đã xoá công việc con');
      await fetchSubtasks();
      onChanged?.();
    } catch (err: any) {
      message.error(err.message || 'Không thể xoá việc con');
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
          renderItem={(item) => {
            const canChange = canUserChangeStatus(item) && !isParentDone;
            return (
              <List.Item
                actions={[
                  canManage && !isParentDone && (
                    <Popconfirm
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                  <Select
                    size="small"
                    value={item.status}
                    disabled={!canChange}
                    style={{ width: 130 }}
                    onChange={(val) => handleStatusChange(item.id, val)}
                    options={[
                      { value: 'TODO', label: 'TODO' },
                      { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                      { value: 'DONE', label: 'DONE' },
                    ]}
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
    </div>
  );
}
