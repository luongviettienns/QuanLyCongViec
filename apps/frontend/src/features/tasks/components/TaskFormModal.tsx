import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import {
  Modal,
  Form,
  Alert,
  Button,
  Popconfirm,
  message,
  Tabs,
} from 'antd';
import {
  InfoCircleOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useResponsive } from '../../../shared/hooks';
import type { Task, TaskFormValues } from '../types/task.types';
import { TASK_STATUS_CONFIG } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';
import {
  createTask,
  updateTask,
  updateTaskStatus,
} from '../api/tasks.api';
import { getFriendlyErrorMessage } from '../../../shared/api';
import { shouldIgnoreTaskApiError } from '../utils/task-error.utils';
import { useAuth } from '../../auth/hooks/useAuth';
import { getTaskPermissions } from '../utils/task-permission.utils';
import { TaskCollaboratorsSection } from './TaskCollaboratorsSection';
import { TaskSubtasksSection } from './TaskSubtasksSection';
import { TaskInfoForm } from './TaskInfoForm';
import { TaskReturnAction } from './TaskReturnAction';

export interface TaskFormModalProps {
  open: boolean;
  task: Task | null;
  defaultTeamId?: number | null;
  defaultDate?: string | null;
  initialTab?: 'info' | 'collaborators' | 'subtasks';
  highlightSubtaskId?: number | null;
  categories: Category[];
  teams?: Team[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onDelete?: (id: number) => Promise<boolean | void> | void;
}

function getTaskVersion(task: Task | null): string {
  if (!task) return '';
  return [
    task.id,
    task.updatedAt ?? '',
    task.title,
    task.description ?? '',
    task.status,
    task.priority ?? 'MEDIUM',
    task.categoryId ?? '',
    task.teamId ?? '',
    task.assigneeId ?? '',
    task.startDate ?? '',
    task.dueDate ?? '',
  ].join('|');
}

export default function TaskFormModal({
  open,
  task,
  defaultTeamId,
  defaultDate,
  initialTab = 'info',
  highlightSubtaskId = null,
  categories,
  teams = [],
  onClose,
  onSuccess,
  onDelete,
}: TaskFormModalProps) {
  const { user } = useAuth();
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'collaborators' | 'subtasks'>(
    () => initialTab,
  );
  const [baseVersion, setBaseVersion] = useState<string>(() => getTaskVersion(task));
  const [isFormDirty, setIsFormDirty] = useState(false);
  const syncedVersionRef = useRef<string>('');

  const screens = useResponsive();
  const watchedStatus = Form.useWatch('status', form);
  const defaultDayjs = useMemo(
    () => (defaultDate && dayjs(defaultDate).isValid() ? dayjs(defaultDate) : null),
    [defaultDate],
  );

  const applyTaskValues = useCallback(
    (target: Task) => {
      form.setFieldsValue({
        title: target.title,
        description: target.description,
        status: target.status,
        priority: target.priority || 'MEDIUM',
        categoryId: target.categoryId ?? null,
        teamId: target.teamId ?? null,
        assigneeId: target.assigneeId ?? null,
        startDate: target.startDate ? dayjs(target.startDate) : null,
        dueDate: target.dueDate ? dayjs(target.dueDate) : null,
      });
    },
    [form],
  );

  const currentVersion = getTaskVersion(task);
  const hasRemoteConflict = Boolean(
    open && task && isFormDirty && currentVersion !== baseVersion,
  );

  useEffect(() => {
    if (!open || !task) {
      return;
    }
    if (currentVersion === syncedVersionRef.current) {
      return;
    }
    if (!isFormDirty) {
      applyTaskValues(task);
      syncedVersionRef.current = currentVersion;
      let cancelled = false;
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setBaseVersion(currentVersion);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, task, currentVersion, isFormDirty, applyTaskValues]);

  useEffect(() => {
    if (open && !task && !isFormDirty) {
      form.setFieldsValue({
        teamId: defaultTeamId ?? null,
        startDate: defaultDayjs,
        dueDate: defaultDayjs,
      });
    }
  }, [open, task, defaultTeamId, defaultDayjs, isFormDirty, form]);

  const taskTeam = task?.teamId ? teams.find((t) => t.id === task.teamId) : null;
  const permissions = task ? getTaskPermissions(user, task, taskTeam) : null;

  const canEditContent = !task ? true : (permissions?.canEditContent ?? true);
  const canChangeStatus = !task ? true : (permissions?.canChangeStatus ?? true);
  const isReadOnly = Boolean(task && !canEditContent && !canChangeStatus);
  const canManage = Boolean(
    permissions?.roles.some((r) =>
      ['OWNER', 'ADMIN', 'CREATOR', 'ASSIGNEE'].includes(r),
    ),
  );

  const isSaveDisabled = Boolean(
    task && !canEditContent && canChangeStatus && watchedStatus === task.status,
  );

  const isParentDone = task?.status === 'DONE';
  const canReopenTask = Boolean(
    isParentDone &&
      permissions?.allowedNextStatuses.some(
        (status) => status === 'TODO' || status === 'IN_PROGRESS',
      ),
  );

  const statusOptions = useMemo(
    () =>
      (['TODO', 'IN_PROGRESS', 'DONE'] as const).map((status) => ({
        value: status,
        label: TASK_STATUS_CONFIG[status].label,
        disabled: Boolean(
          task &&
            task.status !== status &&
            !permissions?.allowedNextStatuses.includes(status),
        ),
      })),
    [task, permissions],
  );

  const handleTeamChange = useCallback(
    (teamId: number | null) => {
      form.setFieldValue('teamId', teamId);
      form.setFieldValue('assigneeId', null);
      form.setFieldValue('categoryId', null);
    },
    [form],
  );

  const handleReturned = useCallback(async () => {
    setIsFormDirty(false);
    onClose();
    await onSuccess();
  }, [onClose, onSuccess]);

  const handleDeleteFromModal = useCallback(async () => {
    if (!task || !onDelete) {
      return;
    }
    try {
      setDeleting(true);
      const deleted = await onDelete(task.id);
      if (deleted !== false) {
        setIsFormDirty(false);
        onClose();
      }
    } finally {
      setDeleting(false);
    }
  }, [task, onDelete, onClose]);

  const canDeleteTask = Boolean(task && permissions?.canDelete && onDelete);
  const showSaveButton = !isReadOnly && (!task || activeTab === 'info');

  // Consolidated single alert for task info form according to role and status
  let alertConfig: { type: 'warning' | 'info'; message: string; description?: string } | null = null;
  if (task) {
    if (isParentDone) {
      if (canReopenTask) {
        alertConfig = {
          type: 'warning',
          message: 'Công việc đã hoàn thành',
          description:
            'Bạn có thể chuyển về Cần làm hoặc Đang làm để tiếp tục thực hiện các thao tác được phép.',
        };
      } else {
        alertConfig = {
          type: 'info',
          message: 'Công việc này đã hoàn thành. Bạn không có quyền mở lại công việc.',
        };
      }
    } else if (!canEditContent) {
      if (!canChangeStatus) {
        alertConfig = {
          type: 'info',
          message:
            'Bạn đang xem thông tin công việc chính ở chế độ chỉ đọc. Bạn không có quyền chỉnh sửa nội dung hoặc thay đổi trạng thái công việc này.',
        };
      }
    }
  }

  async function handleSubmit(values: TaskFormValues) {
    try {
      setSaving(true);

      if (task) {
        if (!canEditContent) {
          if (values.status && values.status !== task.status) {
            await updateTaskStatus(task.id, values.status);
            message.success('Cập nhật trạng thái công việc thành công');
          }
        } else {
          const nextTeamId = values.teamId ?? null;
          const nextAssigneeId = nextTeamId ? (values.assigneeId ?? null) : null;

          await updateTask(task.id, {
            title: values.title,
            description: values.description ?? null,
            priority: values.priority || 'MEDIUM',
            categoryId: values.categoryId ?? null,
            teamId: nextTeamId,
            assigneeId: nextAssigneeId,
            status: values.status,
            startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
            dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null,
          });

          message.success('Cập nhật công việc thành công');
        }
      } else {
        const payload = {
          title: values.title,
          description: values.description,
          status: values.status,
          priority: values.priority || 'MEDIUM',
          categoryId: values.categoryId ?? null,
          teamId: values.teamId ?? null,
          assigneeId: values.teamId ? (values.assigneeId ?? null) : null,
          startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : null,
          dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null,
        };
        await createTask(payload);
        message.success('Thêm công việc thành công');
      }

      form.resetFields();
      setIsFormDirty(false);
      onClose();
      await onSuccess();
    } catch (error) {
      if (shouldIgnoreTaskApiError(error)) {
        return;
      }
      message.error(getFriendlyErrorMessage(error, 'Thao tác thất bại'));
    } finally {
      setSaving(false);
    }
  }

  const formContent = (
    <>
      {hasRemoteConflict && task && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="Công việc vừa được cập nhật từ người khác"
          description="Bạn đang có thay đổi chưa lưu. Hãy tải lại dữ liệu mới nhất để tránh ghi đè nhầm."
          action={
            <Button
              size="small"
              type="primary"
              onClick={() => {
                applyTaskValues(task);
                setIsFormDirty(false);
                setBaseVersion(currentVersion);
                syncedVersionRef.current = currentVersion;
              }}
            >
              Tải dữ liệu mới nhất
            </Button>
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        onValuesChange={() => {
          if (!isFormDirty) {
            setIsFormDirty(true);
          }
        }}
        initialValues={{
          status: 'TODO',
          priority: 'MEDIUM',
          teamId: defaultTeamId ?? null,
          startDate: defaultDayjs,
          dueDate: defaultDayjs,
        }}
      >
        {alertConfig && (
          <Alert
            message={alertConfig.message}
            description={alertConfig.description}
            type={alertConfig.type}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <TaskInfoForm
          form={form}
          task={task}
          teams={teams}
          categories={categories}
          isFormDisabled={!canEditContent}
          canEditStatus={canChangeStatus}
          statusOptions={statusOptions}
          onTeamChange={handleTeamChange}
        />
      </Form>
      {task && permissions?.canReturnTask ? (
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <TaskReturnAction
            taskId={task.id}
            taskTitle={task.title}
            onReturned={handleReturned}
          />
        </div>
      ) : null}
    </>
  );

  return (
    <Modal
      title={
        isReadOnly
          ? 'Chi tiết công việc'
          : task
            ? 'Cập nhật công việc'
            : 'Thêm công việc mới'
      }
      open={open}
      onCancel={onClose}
      closable={!deleting}
      maskClosable={!deleting}
      afterOpenChange={(visible) => {
        if (visible) {
          setActiveTab(initialTab ?? 'info');
          if (!isFormDirty) {
            if (task) {
              const version = getTaskVersion(task);
              syncedVersionRef.current = version;
              setBaseVersion(version);
              applyTaskValues(task);
            } else {
              syncedVersionRef.current = '';
              setBaseVersion('');
              form.resetFields();
              form.setFieldsValue({
                status: 'TODO',
                priority: 'MEDIUM',
                categoryId: null,
                teamId: defaultTeamId ?? null,
                assigneeId: null,
                startDate: defaultDayjs,
                dueDate: defaultDayjs,
              });
            }
          }
        }
      }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: canDeleteTask ? 'space-between' : 'flex-end',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {canDeleteTask && task ? (
            <Popconfirm
              title="Xác nhận xoá"
              description={`Bạn có chắc chắn muốn xoá công việc "${task.title}"?`}
              onConfirm={() => void handleDeleteFromModal()}
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true, loading: deleting }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={deleting}
                disabled={saving}
              >
                Xoá
              </Button>
            </Popconfirm>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={onClose} disabled={saving || deleting}>
              {showSaveButton ? 'Huỷ' : 'Đóng'}
            </Button>
            {showSaveButton && (
              <Button
                type="primary"
                loading={saving}
                disabled={isSaveDisabled || deleting}
                onClick={() => form.submit()}
              >
                {task ? 'Lưu thay đổi' : 'Tạo mới'}
              </Button>
            )}
          </div>
        </div>
      }
      destroyOnHidden
      width={screens.sm ? 640 : '95%'}
      style={{ maxWidth: 640 }}
    >
      {task ? (
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            if (key === 'info' || key === 'collaborators' || key === 'subtasks') {
              setActiveTab(key);
            }
          }}
          items={[
            {
              key: 'info',
              label: (
                <span>
                  <InfoCircleOutlined /> Thông tin chung
                </span>
              ),
              children: formContent,
            },
            ...(task.teamId
              ? [
                  {
                    key: 'collaborators',
                    label: (
                      <span>
                        <TeamOutlined /> Người phối hợp{' '}
                        {task.collaborators && task.collaborators.length > 0
                          ? `(${task.collaborators.length})`
                          : ''}
                      </span>
                    ),
                    children: (
                      <TaskCollaboratorsSection
                        task={task}
                        team={taskTeam}
                        currentUser={user}
                        canManage={canManage}
                        onChanged={onSuccess}
                      />
                    ),
                  },
                ]
              : []),
            {
              key: 'subtasks',
              label: (
                <span>
                  <UnorderedListOutlined /> Công việc con{' '}
                  {task.subtasks && task.subtasks.length > 0
                    ? `(${task.subtasks.length})`
                    : ''}
                </span>
              ),
              children: (
                <TaskSubtasksSection
                  task={task}
                  currentUser={user}
                  canManage={canManage}
                  highlightSubtaskId={highlightSubtaskId}
                  onChanged={onSuccess}
                />
              ),
            },
          ]}
        />
      ) : (
        formContent
      )}
    </Modal>
  );
}
