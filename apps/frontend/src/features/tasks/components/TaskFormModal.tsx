import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Tag,
  Alert,
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

interface TaskFormModalProps {
  open: boolean;
  task: Task | null;
  categories: Category[];
  teams?: Team[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export default function TaskFormModal({
  open,
  task,
  categories,
  teams = [],
  onClose,
  onSuccess,
}: TaskFormModalProps) {
  const { user } = useAuth();
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const screens = useResponsive();

  const selectedTeamId = Form.useWatch('teamId', form);
  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const assigneeOptions = currentTeam?.members?.map((m) => ({
    value: m.userId,
    label: `${m.user?.name} (${m.user?.email})`,
  })) ?? [];

  const scopedCategories = useMemo(() => {
    let filtered = categories.filter((c) => {
      if (selectedTeamId) {
        return c.teamId === selectedTeamId;
      }
      return !c.teamId;
    });

    if (task?.category && !filtered.some((c) => c.id === task.category!.id)) {
      const sameScope = (task.teamId ?? null) === (selectedTeamId ?? null);
      if (sameScope) {
        filtered = [task.category, ...filtered];
      }
    }

    return filtered;
  }, [categories, selectedTeamId, task]);

  const taskTeam = task?.teamId ? teams.find((t) => t.id === task.teamId) : null;
  const permissions = task ? getTaskPermissions(user, task, taskTeam) : null;

  const canEditContent = !task ? true : (permissions?.canEditContent ?? true);
  const canChangeAssignee = !task ? true : (permissions?.canChangeAssignee ?? true);
  const canChangeStatus = !task ? true : (permissions?.canChangeStatus ?? true);
  const isReadOnly = Boolean(task && !canEditContent && !canChangeStatus);
  const canManage = Boolean(
    permissions?.roles.some((r) =>
      ['OWNER', 'ADMIN', 'CREATOR', 'ASSIGNEE'].includes(r),
    ),
  );

  const isParentDone = task?.status === 'DONE';
  const canReopenTask = Boolean(
    isParentDone &&
      permissions?.allowedNextStatuses.some(
        (status) => status === 'TODO' || status === 'IN_PROGRESS',
      ),
  );

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
      onClose();
      await onSuccess();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Thao tác thất bại');
    } finally {
      setSaving(false);
    }
  }

  const formContent = (
    <Form
      form={form}
      layout="vertical"
      onFinish={(values) => void handleSubmit(values)}
      initialValues={{ status: 'TODO', priority: 'MEDIUM' }}
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
      <Form.Item
        name="title"
        label="Tiêu đề"
        rules={[
          { required: true, message: 'Vui lòng nhập tiêu đề công việc' },
          { min: 3, message: 'Tiêu đề phải có ít nhất 3 ký tự' },
          { max: 100, message: 'Tiêu đề không được vượt quá 100 ký tự' },
          {
            validator: (_, value: string) => {
              if (value && value.trim().length < 3) {
                return Promise.reject(new Error('Tiêu đề không được chỉ chứa khoảng trắng'));
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        <Input
          disabled={!canEditContent}
          placeholder="Nhập tiêu đề công việc (từ 3 đến 100 ký tự)..."
        />
      </Form.Item>

      <Form.Item
        name="description"
        label="Mô tả"
        rules={[{ max: 1000, message: 'Mô tả không được vượt quá 1000 ký tự' }]}
      >
        <Input.TextArea
          disabled={!canEditContent}
          rows={3}
          placeholder="Nhập mô tả chi tiết (tuỳ chọn, tối đa 1000 ký tự)..."
          maxLength={1000}
          showCount
        />
      </Form.Item>

      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', gap: screens.xs ? 0 : 16 }}>
        <Form.Item name="teamId" label="Nhóm làm việc" style={{ flex: 1 }}>
          <Select
            allowClear
            disabled={!canEditContent}
            placeholder="Chọn nhóm (hoặc để trống nếu cá nhân)"
            onChange={() => {
              form.setFieldValue('assigneeId', null);
              form.setFieldValue('categoryId', null);
            }}
            options={teams.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
        </Form.Item>

        <Form.Item name="assigneeId" label="Người thực hiện (Assignee)" style={{ flex: 1 }}>
          <Select
            allowClear
            disabled={!canChangeAssignee || !selectedTeamId}
            placeholder={selectedTeamId ? 'Chọn thành viên thực hiện' : 'Chọn nhóm trước để giao việc'}
            options={assigneeOptions}
          />
        </Form.Item>
      </div>

      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', gap: screens.xs ? 0 : 16 }}>
        <Form.Item name="startDate" label="Ngày bắt đầu" style={{ flex: 1 }}>
          <DatePicker
            disabled={!canEditContent}
            format="DD/MM/YYYY"
            placeholder="Chọn ngày bắt đầu"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="dueDate"
          label="Hạn chót (Deadline)"
          style={{ flex: 1 }}
          dependencies={['startDate']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                const start = getFieldValue('startDate');
                if (start && value && value.isBefore(start, 'day')) {
                  return Promise.reject(new Error('Hạn chót phải sau hoặc cùng ngày bắt đầu'));
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <DatePicker
            disabled={!canEditContent}
            format="DD/MM/YYYY"
            placeholder="Chọn hạn chót"
            style={{ width: '100%' }}
          />
        </Form.Item>
      </div>

      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', gap: screens.xs ? 0 : 16 }}>
        <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
          <Select
            disabled={Boolean(task && !canChangeStatus)}
            options={[
              {
                value: 'TODO',
                label: 'TODO',
                disabled: Boolean(
                  task &&
                    task.status !== 'TODO' &&
                    !permissions?.allowedNextStatuses.includes('TODO'),
                ),
              },
              {
                value: 'IN_PROGRESS',
                label: 'IN_PROGRESS',
                disabled: Boolean(
                  task &&
                    task.status !== 'IN_PROGRESS' &&
                    !permissions?.allowedNextStatuses.includes('IN_PROGRESS'),
                ),
              },
              {
                value: 'DONE',
                label: 'DONE',
                disabled: Boolean(
                  task &&
                    task.status !== 'DONE' &&
                    !permissions?.allowedNextStatuses.includes('DONE'),
                ),
              },
            ]}
          />
        </Form.Item>

        <Form.Item name="priority" label="Độ ưu tiên" style={{ flex: 1 }}>
          <Select
            disabled={!canEditContent}
            options={[
              { value: 'LOW', label: 'Thấp (LOW)' },
              { value: 'MEDIUM', label: 'Trung bình (MEDIUM)' },
              { value: 'HIGH', label: 'Cao (HIGH)' },
            ]}
          />
        </Form.Item>
      </div>

      <Form.Item name="categoryId" label="Danh mục">
        <Select
          allowClear
          disabled={!canEditContent}
          placeholder={
            selectedTeamId
              ? 'Chọn danh mục của nhóm (tuỳ chọn)'
              : 'Chọn danh mục cá nhân (tuỳ chọn)'
          }
          options={scopedCategories.map((c) => ({
            value: c.id,
            label: (
              <Tag color={c.color} style={{ margin: 0 }}>
                {c.name}
                {c.id === task?.category?.id && !categories.some((x) => x.id === c.id)
                  ? ' (Từ người tạo)'
                  : ''}
              </Tag>
            ),
          }))}
        />
      </Form.Item>
    </Form>
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
          setActiveTab('info');
          if (task) {
            form.setFieldsValue({
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority || 'MEDIUM',
              categoryId: task.categoryId ?? null,
              teamId: task.teamId ?? null,
              assigneeId: task.assigneeId ?? null,
              startDate: task.startDate ? dayjs(task.startDate) : null,
              dueDate: task.dueDate ? dayjs(task.dueDate) : null,
            });
          } else {
            form.resetFields();
            form.setFieldsValue({
              status: 'TODO',
              priority: 'MEDIUM',
              categoryId: null,
              teamId: null,
              assigneeId: null,
              startDate: null,
              dueDate: null,
            });
          }
        }
      }}
      confirmLoading={saving}
      okButtonProps={
        isReadOnly || (task && activeTab !== 'info')
          ? { style: { display: 'none' } }
          : undefined
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
          onChange={setActiveTab}
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
