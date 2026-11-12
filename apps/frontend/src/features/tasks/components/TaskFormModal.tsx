import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import {
  Modal,
  Form,
  Alert,
  Button,
  message,
  Tabs,
} from 'antd';
import {
  InfoCircleOutlined,
  TeamOutlined,
  UnorderedListOutlined,
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
  initialTab?: 'info' | 'collaborators' | 'subtasks';
  highlightSubtaskId?: number | null;
  categories: Category[];
  teams?: Team[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
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
  initialTab = 'info',
  highlightSubtaskId = null,
  categories,
  teams = [],
  onClose,
  onSuccess,
}: TaskFormModalProps) {
  const { user } = useAuth();
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'collaborators' | 'subtasks'>(
    () => initialTab,
  );
  const [baseVersion, setBaseVersion] = useState<string>(() => getTaskVersion(task));
  const [isFormDirty, setIsFormDirty] = useState(false);
  const syncedVersionRef = useRef<string>('');

  const screens = useResponsive();
  const watchedStatus = Form.useWatch('status', form);

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
      });
    }
  }, [open, task, defaultTeamId, isFormDirty, form]);

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
      message.error(error instanceof Error ? error.message : 'Thao tác thất bại');
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
      onOk={() => form.submit()}
      onCancel={onClose}
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
                startDate: null,
                dueDate: null,
              });
            }
          }
        }
      }}
      confirmLoading={saving}
      okButtonProps={
        isReadOnly || (task && activeTab !== 'info')
          ? { style: { display: 'none' } }
          : { disabled: isSaveDisabled }
      }
      okText={task ? 'Lưu thay đổi' : 'Tạo mới'}
      cancelText={isReadOnly || (task && activeTab !== 'info') ? 'Đóng' : 'Huỷ'}
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
