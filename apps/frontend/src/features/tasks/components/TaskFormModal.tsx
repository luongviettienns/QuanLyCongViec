import { useState } from 'react';
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
} from 'antd';
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
  const screens = useResponsive();

  const selectedTeamId = Form.useWatch('teamId', form);
  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const assigneeOptions = currentTeam?.members?.map((m) => ({
    value: m.userId,
    label: `${m.user?.name} (${m.user?.email})`,
  })) ?? [];

  const taskTeam = task?.teamId ? teams.find((t) => t.id === task.teamId) : null;
  const permissions = task ? getTaskPermissions(user, task, taskTeam) : null;

  const canEditContent = !task ? true : (permissions?.canEditContent ?? true);
  const canChangeAssignee = !task ? true : (permissions?.canChangeAssignee ?? true);
  const canChangeStatus = !task ? true : (permissions?.canChangeStatus ?? true);
  const isAssigneeOnly = Boolean(
    task &&
      task.teamId &&
      permissions?.roles.includes('ASSIGNEE') &&
      !permissions?.roles.includes('CREATOR') &&
      !permissions?.roles.includes('ADMIN') &&
      !permissions?.roles.includes('OWNER'),
  );
  const isReopenBlocked = isAssigneeOnly && task?.status === 'DONE';
  const isReadOnly = Boolean(task && !canEditContent && !canChangeStatus);

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
      okButtonProps={isReadOnly ? { style: { display: 'none' } } : undefined}
      okText={task ? 'Lưu thay đổi' : 'Tạo mới'}
      cancelText={isReadOnly ? 'Đóng' : 'Huỷ'}
      destroyOnHidden
      width={screens.sm ? 560 : '95%'}
      style={{ maxWidth: 560 }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        initialValues={{ status: 'TODO', priority: 'MEDIUM' }}
      >
        {isReadOnly && (
          <Alert
            message="Bạn đang xem công việc này ở chế độ chỉ đọc. Chỉ người tạo, người được giao hoặc quản trị viên mới có thể chỉnh sửa."
            type="info"
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
            maxLength={100}
            showCount
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
              onChange={() => form.setFieldValue('assigneeId', null)}
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
              disabled={!canChangeStatus || isReopenBlocked}
              options={[
                {
                  value: 'TODO',
                  label: 'TODO',
                  disabled: isAssigneeOnly && task?.status !== 'TODO',
                },
                {
                  value: 'IN_PROGRESS',
                  label: 'IN_PROGRESS',
                  disabled: isAssigneeOnly && task?.status === 'DONE',
                },
                {
                  value: 'DONE',
                  label: 'DONE',
                  disabled: isAssigneeOnly && task?.status === 'TODO',
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
            placeholder="Chọn danh mục (tuỳ chọn)"
            options={categories.map((c) => ({
              value: c.id,
              label: (
                <Tag color={c.color} style={{ margin: 0 }}>
                  {c.name}
                </Tag>
              ),
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
