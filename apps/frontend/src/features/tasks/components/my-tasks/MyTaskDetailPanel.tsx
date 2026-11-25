import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Divider,
  Drawer,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CloseOutlined,
  FullscreenOutlined,
  MessageOutlined,
  RollbackOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  TASK_STATUS_CONFIG,
  type Subtask,
  type Task,
  type TaskModalTab,
  type TaskPriority,
  type TaskStatus,
} from '../../types/task.types';
import type { Team } from '../../../teams/types/team.types';
import type { User } from '../../../auth/types/auth.types';
import { getTaskPermissions } from '../../utils/task-permission.utils';
import { canUserManageChecklist } from '../../utils/checklist.utils';
import { classifyMyTaskRole, type MyTaskRoleKind } from '../../utils/my-tasks.utils';
import { toDateKey } from '../../utils/calendar-date.utils';
import { TaskSubtasksSection } from '../TaskSubtasksSection';
import { useResponsive } from '../../../../shared/hooks';
import type { MyTaskDetailFocus } from '../../hooks/useMyTasks';

const { Text, Title, Paragraph } = Typography;

const ROLE_LABELS: Record<MyTaskRoleKind, { label: string; color: string }> = {
  personal: { label: 'Cá nhân', color: 'default' },
  assignee: { label: 'Phụ trách', color: 'blue' },
  collaborator: { label: 'Phối hợp', color: 'purple' },
  subtask_only: { label: 'Việc con', color: 'cyan' },
};

const ALL_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export interface MyTaskDetailPanelProps {
  task: Task | null;
  teams: Team[];
  currentUser: User | null;
  focusSection: MyTaskDetailFocus;
  focusVersion: number;
  onClose: () => void;
  onOpenFullModal: (task: Task, tab?: TaskModalTab) => void;
  onUpdateStatus: (taskId: number, status: TaskStatus) => Promise<boolean>;
  onUpdateField: (
    taskId: number,
    patch: { priority?: TaskPriority; dueDate?: string | null },
  ) => Promise<boolean>;
  onReturnTask: (taskId: number, reason: string) => Promise<boolean>;
  onSubtasksChange: (taskId: number, subtasks: Subtask[]) => void;
}

export const MyTaskDetailPanel: React.FC<MyTaskDetailPanelProps> = ({
  task,
  teams,
  currentUser,
  focusSection,
  focusVersion,
  onClose,
  onOpenFullModal,
  onUpdateStatus,
  onUpdateField,
  onReturnTask,
  onSubtasksChange,
}) => {
  const screens = useResponsive();
  const isDesktopSplit = Boolean(screens.lg);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const checklistRef = useRef<HTMLDivElement | null>(null);

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!taskId || focusSection !== 'checklist') {
      return;
    }
    const timer = setTimeout(() => {
      const container = scrollContainerRef.current;
      const target = checklistRef.current;
      if (!target) return;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const nextTop = container.scrollTop + (targetRect.top - containerRect.top) - 12;
        container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [taskId, focusSection, focusVersion]);

  if (!task) {
    return null;
  }

  const team = task.teamId ? teams.find((t) => t.id === task.teamId) ?? null : null;
  const perms = getTaskPermissions(currentUser, task, team);
  const canManageChecklist = canUserManageChecklist(currentUser, task, team);
  const classification = classifyMyTaskRole(task, currentUser?.id);
  const roleBadge = ROLE_LABELS[classification.roleKind];
  const dueKey = toDateKey(task.dueDate);

  const handleReturnConfirm = async () => {
    const trimmed = returnReason.trim();
    if (!trimmed) {
      message.warning('Vui lòng nhập lý do trả lại công việc');
      return;
    }
    setSubmittingReturn(true);
    try {
      const ok = await onReturnTask(task.id, trimmed);
      if (ok) {
        setReturnModalOpen(false);
        setReturnReason('');
      }
    } finally {
      setSubmittingReturn(false);
    }
  };

  const panelBody = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Space size={6} wrap>
          <Tag color="blue" style={{ margin: 0 }}>
            #{task.id}
          </Tag>
          <Tag color={roleBadge.color} style={{ margin: 0 }}>
            {roleBadge.label}
          </Tag>
        </Space>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<MessageOutlined />}
            onClick={() => onOpenFullModal(task, 'comments')}
            aria-label="Thảo luận và @mention"
            title="Thảo luận & @mention"
          >
            {(task._count?.comments ?? 0) > 0 ? task._count?.comments : ''}
          </Button>
          <Button
            type="text"
            size="small"
            icon={<FullscreenOutlined />}
            onClick={() => onOpenFullModal(task)}
            aria-label="Mở toàn bộ chỉnh sửa"
            title="Mở toàn bộ chỉnh sửa"
          />
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={onClose}
            aria-label="Đóng chi tiết"
            title="Đóng chi tiết"
          />
        </Space>
      </div>

      {/* Title & Scope */}
      <div>
        <Title
          level={5}
          style={{
            margin: '0 0 6px 0',
            textDecoration: task.status === 'DONE' ? 'line-through' : undefined,
            color: task.status === 'DONE' ? '#8c8c8c' : '#1f1f1f',
          }}
        >
          {task.title}
        </Title>
        <Space size={6} wrap>
          {task.team?.name ? (
            <Tag icon={<TeamOutlined />} style={{ margin: 0 }}>
              {task.team.name}
            </Tag>
          ) : (
            <Tag icon={<UserOutlined />} style={{ margin: 0 }}>
              Không gian cá nhân
            </Tag>
          )}
          {task.category && (
            <Tag color={task.category.color} style={{ margin: 0 }}>
              {task.category.name}
            </Tag>
          )}
        </Space>
      </div>

      {task.description && (
        <Paragraph
          type="secondary"
          ellipsis={{ rows: 3, expandable: true, symbol: 'Xem thêm' }}
          style={{ margin: 0, fontSize: 13 }}
        >
          {task.description}
        </Paragraph>
      )}

      {/* Quick Properties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Trạng thái
          </Text>
          <Select<TaskStatus>
            size="small"
            value={task.status}
            disabled={!perms.canChangeStatus || perms.allowedNextStatuses.length === 0}
            onChange={(status) => void onUpdateStatus(task.id, status)}
            style={{ width: 160 }}
            options={ALL_STATUSES.map((status) => ({
              value: status,
              label: TASK_STATUS_CONFIG[status].label,
              disabled: status !== task.status && !perms.allowedNextStatuses.includes(status),
            }))}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Độ ưu tiên
          </Text>
          <Select<TaskPriority>
            size="small"
            value={task.priority ?? 'MEDIUM'}
            disabled={!perms.canEditContent}
            onChange={(priority) => void onUpdateField(task.id, { priority })}
            style={{ width: 160 }}
            options={[
              { value: 'HIGH', label: 'Cao' },
              { value: 'MEDIUM', label: 'Trung bình' },
              { value: 'LOW', label: 'Thấp' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Hạn chót
          </Text>
          <DatePicker
            size="small"
            value={dueKey ? dayjs(dueKey) : null}
            disabled={!perms.canEditContent}
            onChange={(date) =>
              void onUpdateField(task.id, { dueDate: date ? date.format('YYYY-MM-DD') : null })
            }
            placeholder="Chọn hạn chót"
            format="DD/MM/YYYY"
            style={{ width: 160 }}
          />
        </div>

        {task.assignee && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Phụ trách chính
            </Text>
            <Text style={{ fontSize: 13, fontWeight: 500 }}>{task.assignee.name}</Text>
          </div>
        )}
      </div>

      <Divider style={{ margin: '6px 0' }} />

      {/* Embedded T01 Checklist */}
      <div ref={checklistRef}>
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

      {perms.canReturnTask && (
        <div style={{ paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
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

      <Modal
        title="Trả lại công việc cho người giao"
        open={returnModalOpen}
        onOk={() => void handleReturnConfirm()}
        onCancel={() => setReturnModalOpen(false)}
        confirmLoading={submittingReturn}
        mask={{ closable: true }}
        okText="Xác nhận trả việc"
        cancelText="Hủy"
        okButtonProps={{ danger: true }}
      >
        <p style={{ fontSize: 13, color: '#595959' }}>
          Vui lòng nêu rõ lý do để người giao nắm được tình hình:
        </p>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do trả lại công việc..."
          value={returnReason}
          onChange={(e) => setReturnReason(e.target.value)}
        />
      </Modal>
    </div>
  );

  if (isDesktopSplit) {
    return (
      <aside
        ref={scrollContainerRef}
        className="my-tasks-detail-column"
        aria-label="Chi tiết công việc"
      >
        <Card
          styles={{ body: { padding: 16 } }}
          style={{
            borderRadius: 10,
            border: '1px solid #e6e8eb',
            boxShadow: '0 2px 10px rgba(15, 23, 42, 0.05)',
          }}
        >
          {panelBody}
        </Card>
      </aside>
    );
  }

  return (
    <Drawer
      open={Boolean(task)}
      onClose={onClose}
      placement="right"
      size={screens.isMobile ? '100%' : 420}
      closable={false}
      destroyOnHidden
      styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' } }}
    >
      <div
        ref={scrollContainerRef}
        style={{ padding: 16, flex: 1, overflowY: 'auto' }}
      >
        {panelBody}
      </div>
    </Drawer>
  );
};
