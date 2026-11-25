import { useState } from 'react';
import {
  Card,
  Space,
  Typography,
  Button,
  Select,
  DatePicker,
  Input,
  Tag,
  Divider,
  Modal,
  Avatar,
  message,
} from 'antd';
import {
  CloseOutlined,
  FullscreenOutlined,
  MessageOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Subtask, Task, TaskModalTab, TaskPriority, TaskStatus } from '../../../tasks/types/task.types.ts';
import type { Team, TeamMember } from '../../types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';
import { getTaskPermissions } from '../../../tasks/utils/task-permission.utils.ts';
import { canUserManageChecklist } from '../../../tasks/utils/checklist.utils.ts';
import { toDateKey } from '../../../tasks/utils/calendar-date.utils.ts';
import { TaskSubtasksSection } from '../../../tasks/components/TaskSubtasksSection.tsx';

const { Text, Title } = Typography;

export interface TeamTaskQuickDetailProps {
  task: Task;
  team: Team | null;
  currentUser: User | null;
  onClose: () => void;
  onOpenFullModal: (task: Task, tab?: TaskModalTab) => void;
  onUpdateStatus?: (taskId: number, status: TaskStatus) => Promise<boolean | void>;
  onUpdateAssignee?: (taskId: number, assigneeId: number | null) => Promise<boolean | void>;
  onUpdateDueDate?: (taskId: number, dueDate: string | null) => Promise<boolean | void>;
  onUpdatePriority?: (taskId: number, priority: TaskPriority) => Promise<boolean | void>;
  onReturnTask?: (taskId: number, reason: string) => Promise<boolean | void>;
  onSubtasksChange?: (taskId: number, subtasks: Subtask[]) => void;
}

export function TeamTaskQuickDetail({
  task,
  team,
  currentUser,
  onClose,
  onOpenFullModal,
  onUpdateStatus,
  onUpdateAssignee,
  onUpdateDueDate,
  onUpdatePriority,
  onReturnTask,
  onSubtasksChange,
}: TeamTaskQuickDetailProps) {
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const perms = getTaskPermissions(currentUser, task, team);
  const canManageChecklist = canUserManageChecklist(currentUser, task, team);
  const members: TeamMember[] = team?.members || [];
  const dueKey = toDateKey(task.dueDate);

  const handleReturnConfirm = async () => {
    if (!returnReason.trim()) {
      message.warning('Vui lòng nhập lý do trả lại công việc');
      return;
    }
    setSubmitting(true);
    try {
      await onReturnTask?.(task.id, returnReason.trim());
      setReturnModalOpen(false);
      setReturnReason('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      styles={{
        body: { padding: 16 },
      }}
      style={{
        borderRadius: 8,
        border: '1px solid #d9d9d9',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Space>
          <Tag color="blue">#{task.id}</Tag>
          <Text strong style={{ fontSize: 13, color: '#595959' }}>
            Chi tiết công việc
          </Text>
        </Space>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<MessageOutlined />}
            onClick={() => onOpenFullModal(task, 'comments')}
            title="Thảo luận & @mention"
          >
            {(task._count?.comments ?? 0) > 0 ? task._count?.comments : ''}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<FullscreenOutlined />}
            onClick={() => onOpenFullModal(task)}
            title="Mở toàn bộ chỉnh sửa"
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            title="Đóng chi tiết"
          />
        </Space>
      </div>

      {/* Title */}
      <Title
        level={5}
        style={{
          margin: '0 0 16px 0',
          textDecoration: task.status === 'DONE' ? 'line-through' : undefined,
          color: task.status === 'DONE' ? '#8c8c8c' : '#262626',
        }}
      >
        {task.title}
      </Title>

      {/* Field grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Trạng thái:
          </Text>
          <Select<TaskStatus>
            value={task.status}
            disabled={!perms.canChangeStatus}
            onChange={(status) => void onUpdateStatus?.(task.id, status)}
            style={{ width: 150 }}
            options={[
              { value: 'TODO', label: 'Cần làm' },
              { value: 'IN_PROGRESS', label: 'Đang làm' },
              { value: 'DONE', label: 'Hoàn thành' },
            ]}
          />
        </div>

        {/* Assignee */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Người làm:
          </Text>
          <Select
            value={task.assigneeId ?? undefined}
            disabled={!perms.canChangeAssignee}
            onChange={(val) => void onUpdateAssignee?.(task.id, val ?? null)}
            placeholder="Chưa phân công"
            allowClear
            style={{ width: 150 }}
            options={members.map((m) => ({
              value: m.userId,
              label: (
                <Space size={4}>
                  <Avatar size="small" style={{ backgroundColor: '#1677ff' }}>
                    {m.user?.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <span style={{ fontSize: 12 }}>{m.user?.name}</span>
                </Space>
              ),
            }))}
          />
        </div>

        {/* Due Date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Hạn chót:
          </Text>
          <DatePicker
            value={dueKey ? dayjs(dueKey) : null}
            disabled={!perms.canEditContent}
            onChange={(date) =>
              void onUpdateDueDate?.(task.id, date ? date.format('YYYY-MM-DD') : null)
            }
            placeholder="Chọn ngày"
            format="DD/MM/YYYY"
            style={{ width: 150 }}
          />
        </div>

        {/* Priority */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Độ ưu tiên:
          </Text>
          <Select<TaskPriority>
            value={task.priority}
            disabled={!perms.canEditContent}
            onChange={(p) => void onUpdatePriority?.(task.id, p)}
            style={{ width: 150 }}
            options={[
              { value: 'LOW', label: 'Thấp' },
              { value: 'MEDIUM', label: 'Trung bình' },
              { value: 'HIGH', label: 'Cao' },
            ]}
          />
        </div>
      </div>

      <Divider style={{ margin: '16px 0 12px 0' }} />

      {/* Checklist Section */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TaskSubtasksSection
          key={task.id}
          task={task}
          currentUser={currentUser}
          canManage={canManageChecklist}
          variant="compact"
          initialSubtasks={task.subtasks}
          onSubtasksChange={onSubtasksChange}
        />
      </div>

      {/* Bottom Action: Return Task */}
      {perms.canReturnTask && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Button
            danger
            block
            icon={<RollbackOutlined />}
            onClick={() => setReturnModalOpen(true)}
          >
            Trả lại công việc
          </Button>
        </div>
      )}

      {/* Return Task Modal */}
      <Modal
        title="Trả lại công việc cho người giao"
        open={returnModalOpen}
        onOk={handleReturnConfirm}
        onCancel={() => setReturnModalOpen(false)}
        confirmLoading={submitting}
        okText="Xác nhận trả việc"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
      >
        <p style={{ fontSize: 13, color: '#595959' }}>
          Bạn đang trả lại công việc này. Vui lòng nêu rõ lý do để người giao nắm được thông tin:
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do trả lại công việc..."
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
        />
      </Modal>
    </Card>
  );
}
