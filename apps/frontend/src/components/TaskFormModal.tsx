import { useState } from 'react';
import dayjs from 'dayjs';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Tag,
  message,
} from 'antd';
import type { Task, Category, TaskFormValues } from '../types/task.types';
import { createTask, updateTask } from '../api/tasks.api';

interface TaskFormModalProps {
  open: boolean;
  task: Task | null;
  categories: Category[];
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export default function TaskFormModal({
  open,
  task,
  categories,
  onClose,
  onSuccess,
}: TaskFormModalProps) {
  const [form] = Form.useForm<TaskFormValues>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(values: TaskFormValues) {
    try {
      setSaving(true);

      const payload = {
        title: values.title,
        description: values.description,
        status: values.status,
        priority: values.priority || 'MEDIUM',
        categoryId: values.categoryId ?? null,
        startDate: values.startDate ? values.startDate.toISOString() : null,
        dueDate: values.dueDate ? values.dueDate.toISOString() : null,
      };

      if (task) {
        await updateTask(task.id, payload);
        message.success('Cập nhật công việc thành công');
      } else {
        await createTask(payload);
        message.success('Thêm công việc thành công');
      }

      form.resetFields();
      onClose();
      await onSuccess();
    } catch (error) {
      console.error(error);
      message.error(error instanceof Error ? error.message : 'Thao tác thất bại');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={task ? 'Cập nhật công việc' : 'Thêm công việc mới'}
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
              startDate: task.startDate ? dayjs(task.startDate) : null,
              dueDate: task.dueDate ? dayjs(task.dueDate) : null,
            });
          } else {
            form.resetFields();
            form.setFieldsValue({
              status: 'TODO',
              priority: 'MEDIUM',
              categoryId: null,
              startDate: null,
              dueDate: null,
            });
          }
        }
      }}
      confirmLoading={saving}
      okText={task ? 'Lưu thay đổi' : 'Tạo mới'}
      cancelText="Huỷ"
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
        initialValues={{ status: 'TODO', priority: 'MEDIUM' }}
      >
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
          <Input placeholder="Nhập tiêu đề công việc (từ 3 đến 100 ký tự)..." maxLength={100} showCount />
        </Form.Item>

        <Form.Item
          name="description"
          label="Mô tả"
          rules={[{ max: 500, message: 'Mô tả không được vượt quá 500 ký tự' }]}
        >
          <Input.TextArea
            rows={3}
            placeholder="Nhập mô tả chi tiết (tuỳ chọn, tối đa 500 ký tự)..."
            maxLength={500}
            showCount
          />
        </Form.Item>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="startDate" label="Ngày bắt đầu" style={{ flex: 1 }}>
            <DatePicker
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
              format="DD/MM/YYYY"
              placeholder="Chọn hạn chót"
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
            <Select
              options={[
                { value: 'TODO', label: 'TODO' },
                { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
                { value: 'DONE', label: 'DONE' },
              ]}
            />
          </Form.Item>

          <Form.Item name="priority" label="Độ ưu tiên" style={{ flex: 1 }}>
            <Select
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
