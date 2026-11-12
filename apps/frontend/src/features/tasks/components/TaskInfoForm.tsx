import { useMemo } from 'react';
import { Form, Input, Select, DatePicker, Tag } from 'antd';
import type { FormInstance } from 'antd';
import { useResponsive } from '../../../shared/hooks';
import type { Task, TaskStatus } from '../types/task.types';
import type { Category } from '../../categories/types/category.types';
import type { Team } from '../../teams/types/team.types';

export interface TaskStatusOption {
  value: TaskStatus;
  label: string;
  disabled?: boolean;
}

export interface TaskInfoFormProps {
  form: FormInstance;
  task: Task | null;
  teams: Team[];
  categories: Category[];
  isFormDisabled: boolean;
  canEditStatus: boolean;
  statusOptions: TaskStatusOption[];
  onTeamChange: (teamId: number | null) => void;
}

export function TaskInfoForm({
  form,
  task,
  teams,
  categories,
  isFormDisabled,
  canEditStatus,
  statusOptions,
  onTeamChange,
}: TaskInfoFormProps) {
  const screens = useResponsive();

  const selectedTeamId = Form.useWatch('teamId', form);
  const currentTeam = teams.find((t) => t.id === selectedTeamId);
  const assigneeOptions =
    currentTeam?.members?.map((m) => ({
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

  return (
    <>
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
                return Promise.reject(
                  new Error('Tiêu đề không được chỉ chứa khoảng trắng'),
                );
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        <Input
          disabled={isFormDisabled}
          placeholder="Nhập tiêu đề công việc (từ 3 đến 100 ký tự)..."
        />
      </Form.Item>

      <Form.Item
        name="description"
        label="Mô tả"
        rules={[{ max: 1000, message: 'Mô tả không được vượt quá 1000 ký tự' }]}
      >
        <Input.TextArea
          disabled={isFormDisabled}
          rows={3}
          placeholder="Nhập mô tả chi tiết (tuỳ chọn, tối đa 1000 ký tự)..."
          maxLength={1000}
          showCount
        />
      </Form.Item>

      <div
        style={{
          display: 'flex',
          flexDirection: screens.xs ? 'column' : 'row',
          gap: screens.xs ? 0 : 16,
        }}
      >
        <Form.Item name="teamId" label="Nhóm làm việc" style={{ flex: 1 }}>
          <Select
            allowClear
            disabled={isFormDisabled}
            placeholder="Chọn nhóm (hoặc để trống nếu cá nhân)"
            onChange={(value) => {
              onTeamChange(value ?? null);
            }}
            options={teams.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
          />
        </Form.Item>

        <Form.Item
          name="assigneeId"
          label="Người thực hiện (Assignee)"
          style={{ flex: 1 }}
        >
          <Select
            allowClear
            disabled={isFormDisabled || !selectedTeamId}
            placeholder={
              selectedTeamId
                ? 'Chọn thành viên thực hiện'
                : 'Chọn nhóm trước để giao việc'
            }
            options={assigneeOptions}
          />
        </Form.Item>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: screens.xs ? 'column' : 'row',
          gap: screens.xs ? 0 : 16,
        }}
      >
        <Form.Item name="startDate" label="Ngày bắt đầu" style={{ flex: 1 }}>
          <DatePicker
            disabled={isFormDisabled}
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
                  return Promise.reject(
                    new Error('Hạn chót phải sau hoặc cùng ngày bắt đầu'),
                  );
                }
                return Promise.resolve();
              },
            }),
          ]}
        >
          <DatePicker
            disabled={isFormDisabled}
            format="DD/MM/YYYY"
            placeholder="Chọn hạn chót"
            style={{ width: '100%' }}
          />
        </Form.Item>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: screens.xs ? 'column' : 'row',
          gap: screens.xs ? 0 : 16,
        }}
      >
        <Form.Item name="status" label="Trạng thái" style={{ flex: 1 }}>
          <Select disabled={!canEditStatus} options={statusOptions} />
        </Form.Item>

        <Form.Item name="priority" label="Độ ưu tiên" style={{ flex: 1 }}>
          <Select
            disabled={isFormDisabled}
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
          disabled={isFormDisabled}
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
                {c.id === task?.category?.id &&
                !categories.some((x) => x.id === c.id)
                  ? ' (Từ người tạo)'
                  : ''}
              </Tag>
            ),
          }))}
        />
      </Form.Item>
    </>
  );
}

export default TaskInfoForm;
