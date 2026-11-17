import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Segmented,
  Collapse,
  Button,
  Space,
  Avatar,
  Tag,
  Typography,
  Modal,
  message,
} from 'antd';
import type { InputRef } from 'antd';
import {
  TeamOutlined,
  LockOutlined,
  SendOutlined,
  TagsOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { useResponsive } from '../../../../shared/hooks';
import { getFriendlyErrorMessage } from '../../../../shared/api';
import type { Category } from '../../../categories/types/category.types.ts';
import type { TaskPriority } from '../../../tasks/types/task.types.ts';
import { createTask, inviteCollaborator } from '../../../tasks/api/tasks.api.ts';
import { shouldIgnoreTaskApiError } from '../../../tasks/utils/task-error.utils.ts';
import type { Team } from '../../types/team.types.ts';
import {
  buildTeamMemberOptions,
  filterQuickAssignCollaboratorOptions,
  stripConflictingCollaborators,
  buildQuickAssignCreatePayload,
  isQuickAssignFormDirty,
} from '../../utils/team-quick-assign.utils.ts';

const { Text } = Typography;

interface QuickAssignFormValues {
  title: string;
  assigneeId?: number;
  dueDate?: Dayjs | null;
  priority: TaskPriority;
  description?: string;
  collaboratorIds?: number[];
  categoryId?: number | null;
}

export interface TeamQuickAssignDrawerProps {
  open: boolean;
  team: Team | null;
  categories: Category[];
  currentUserId?: number;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function TeamQuickAssignDrawer({
  open,
  team,
  categories,
  currentUserId,
  onClose,
  onSuccess,
}: TeamQuickAssignDrawerProps) {
  const [form] = Form.useForm<QuickAssignFormValues>();
  const [saving, setSaving] = useState(false);
  const [extraOpenKeys, setExtraOpenKeys] = useState<string[]>([]);
  const submittingRef = useRef(false);
  const titleInputRef = useRef<InputRef>(null);

  const screens = useResponsive();
  const isMobile = !screens.md;

  const watchedAssigneeId = Form.useWatch('assigneeId', form);

  const memberOptions = useMemo(() => buildTeamMemberOptions(team), [team]);

  const collaboratorOptions = useMemo(
    () =>
      filterQuickAssignCollaboratorOptions(
        memberOptions,
        watchedAssigneeId,
        currentUserId,
      ),
    [memberOptions, watchedAssigneeId, currentUserId],
  );

  const scopedCategories = useMemo(
    () => (team ? categories.filter((c) => c.teamId === team.id) : []),
    [categories, team],
  );

  const resetAndClose = () => {
    form.resetFields();
    setExtraOpenKeys([]);
    onClose();
  };

  const handleRequestClose = () => {
    if (submittingRef.current || saving) {
      return;
    }
    const currentValues = form.getFieldsValue(true) as QuickAssignFormValues;
    if (isQuickAssignFormDirty(currentValues)) {
      Modal.confirm({
        title: 'Hủy giao việc?',
        content: 'Dữ liệu bạn đã nhập chưa được lưu. Bạn có chắc muốn đóng khung giao việc này?',
        okText: 'Đóng và hủy nhập',
        okButtonProps: { danger: true },
        cancelText: 'Tiếp tục nhập',
        onOk: resetAndClose,
      });
      return;
    }
    resetAndClose();
  };

  const handleAssigneeChange = (nextAssigneeId: number) => {
    const currentCollabs = form.getFieldValue('collaboratorIds') as number[] | undefined;
    if (Array.isArray(currentCollabs) && currentCollabs.length > 0) {
      form.setFieldValue(
        'collaboratorIds',
        stripConflictingCollaborators(currentCollabs, nextAssigneeId, currentUserId),
      );
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!submittingRef.current && !saving) {
        form.submit();
      }
    }
  };

  async function handleFinish(values: QuickAssignFormValues) {
    if (!team || !values.assigneeId || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setSaving(true);

    try {
      const dueDateStr = values.dueDate ? values.dueDate.format('YYYY-MM-DD') : null;
      const payload = buildQuickAssignCreatePayload(team.id, {
        title: values.title,
        assigneeId: values.assigneeId,
        dueDateStr,
        priority: values.priority || 'MEDIUM',
        description: values.description,
        categoryId: values.categoryId ?? null,
      });

      const createdTask = await createTask(payload);

      const collaboratorIds = stripConflictingCollaborators(
        values.collaboratorIds ?? [],
        values.assigneeId,
        currentUserId,
      );

      let failedInviteNames: string[] = [];
      if (collaboratorIds.length > 0) {
        const inviteResults = await Promise.allSettled(
          collaboratorIds.map((uid) => inviteCollaborator(createdTask.id, uid)),
        );
        failedInviteNames = inviteResults.reduce<string[]>((acc, res, idx) => {
          if (res.status === 'rejected') {
            const uid = collaboratorIds[idx];
            const member = memberOptions.find((m) => m.userId === uid);
            acc.push(member?.name || `#${uid}`);
          }
          return acc;
        }, []);
      }

      form.resetFields();
      setExtraOpenKeys([]);
      await onSuccess();
      onClose();

      if (failedInviteNames.length > 0) {
        message.warning(
          `Đã tạo công việc "${createdTask.title}", nhưng chưa gửi được lời mời phối hợp cho: ${failedInviteNames.join(', ')}`,
          6,
        );
      } else {
        message.success(`Đã giao công việc "${createdTask.title}" thành công`);
      }
    } catch (err: unknown) {
      if (!shouldIgnoreTaskApiError(err)) {
        message.error(getFriendlyErrorMessage(err, 'Không thể tạo công việc'));
      }
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Drawer
      title={
        <Space size={8}>
          <SendOutlined style={{ color: '#1677ff' }} />
          <span>Giao việc nhanh</span>
        </Space>
      }
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? '100%' : 480}
      height={isMobile ? '90vh' : undefined}
      open={open}
      onClose={handleRequestClose}
      maskClosable={!saving}
      keyboard={!saving}
      afterOpenChange={(visible) => {
        if (visible) {
          titleInputRef.current?.focus();
        }
      }}
      styles={{
        body: { padding: isMobile ? 16 : 20 },
        footer: { padding: '12px 20px' },
      }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {!isMobile ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Nhấn Ctrl + Enter để giao nhanh
            </Text>
          ) : (
            <span />
          )}
          <Space>
            <Button onClick={handleRequestClose} disabled={saving}>
              Hủy
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={saving}
              disabled={saving || !team}
              onClick={() => form.submit()}
            >
              Giao việc
            </Button>
          </Space>
        </div>
      }
    >
      <div onKeyDown={handleKeyDown}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleFinish(values)}
          initialValues={{
            priority: 'MEDIUM' as TaskPriority,
          }}
          requiredMark="optional"
        >
          {/* Team locked context */}
          <Form.Item label="Team thực hiện" style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: '#f5f7fa',
                border: '1px solid #e6ebf1',
                borderRadius: 6,
              }}
            >
              <Space size={8}>
                <TeamOutlined style={{ color: '#1677ff' }} />
                <Text strong>{team?.name || 'Chưa chọn nhóm'}</Text>
                <Tag color="blue" style={{ margin: 0, borderRadius: 10 }}>
                  {memberOptions.length} thành viên
                </Tag>
              </Space>
              <LockOutlined style={{ color: '#8c8c8c', fontSize: 13 }} title="Cố định theo Team hiện tại" />
            </div>
          </Form.Item>

          {/* Task Title (Required) */}
          <Form.Item
            name="title"
            label={
              <span>
                Tên công việc <Text type="danger">*</Text>
              </span>
            }
            rules={[
              { required: true, message: 'Vui lòng nhập tên công việc' },
              {
                validator: (_, value: string) => {
                  const trimmed = (value || '').trim();
                  if (!trimmed) {
                    return Promise.reject(new Error('Vui lòng nhập tên công việc'));
                  }
                  if (trimmed.length < 3) {
                    return Promise.reject(new Error('Tên công việc phải có ít nhất 3 ký tự'));
                  }
                  if (trimmed.length > 100) {
                    return Promise.reject(new Error('Tên công việc không được vượt quá 100 ký tự'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input
              ref={titleInputRef}
              disabled={saving}
              placeholder="Ví dụ: Hoàn thiện báo cáo tuần..."
              maxLength={100}
            />
          </Form.Item>

          {/* Primary Assignee (Required) */}
          <Form.Item
            name="assigneeId"
            label={
              <span>
                Người phụ trách chính <Text type="danger">*</Text>
              </span>
            }
            rules={[
              { required: true, message: 'Vui lòng chọn người phụ trách chính' },
            ]}
          >
            <Select
              showSearch
              disabled={saving || memberOptions.length === 0}
              placeholder="Chọn thành viên phụ trách"
              optionFilterProp="searchLabel"
              onChange={handleAssigneeChange}
              options={memberOptions.map((member) => ({
                value: member.userId,
                searchLabel: `${member.name} ${member.email}`,
                label: (
                  <Space size={8}>
                    <Avatar
                      size={20}
                      style={{
                        backgroundColor: member.isOwner ? '#faad14' : '#1677ff',
                        fontSize: 11,
                      }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <span>{member.name}</span>
                    {member.isOwner && (
                      <Tag color="gold" style={{ margin: 0, fontSize: 11 }}>
                        Chủ nhóm
                      </Tag>
                    )}
                    {!member.isOwner && member.role === 'ADMIN' && (
                      <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                        Admin
                      </Tag>
                    )}
                  </Space>
                ),
              }))}
            />
          </Form.Item>

          {/* Due Date & Priority */}
          <Form.Item name="dueDate" label="Thời hạn (tuỳ chọn)">
            <DatePicker
              disabled={saving}
              format="DD/MM/YYYY"
              placeholder="Chọn ngày hết hạn"
              style={{ width: '100%' }}
              allowClear
            />
          </Form.Item>

          <Form.Item name="priority" label="Mức ưu tiên">
            <Segmented
              block
              disabled={saving}
              options={[
                { label: 'Thấp', value: 'LOW' },
                { label: 'Bình thường', value: 'MEDIUM' },
                { label: 'Cao', value: 'HIGH' },
              ]}
            />
          </Form.Item>

          {/* Collapsible Optional Fields */}
          <Collapse
            ghost
            size="small"
            activeKey={extraOpenKeys}
            onChange={(keys) => setExtraOpenKeys(Array.isArray(keys) ? keys : [keys])}
            style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}
            items={[
              {
                key: 'extra',
                label: (
                  <Text strong style={{ fontSize: 13 }}>
                    Thông tin bổ sung (Mô tả, Người phối hợp, Danh mục)
                  </Text>
                ),
                children: (
                  <div style={{ paddingTop: 4 }}>
                    <Form.Item
                      name="description"
                      label="Mô tả"
                      rules={[
                        { max: 1000, message: 'Mô tả không được vượt quá 1000 ký tự' },
                      ]}
                    >
                      <Input.TextArea
                        disabled={saving}
                        rows={3}
                        placeholder="Nhập mô tả chi tiết công việc (tuỳ chọn)..."
                        maxLength={1000}
                        showCount
                      />
                    </Form.Item>

                    <Form.Item
                      name="collaboratorIds"
                      label={
                        <Space size={4}>
                          <UserAddOutlined />
                          <span>Người phối hợp</span>
                        </Space>
                      }
                    >
                      <Select
                        mode="multiple"
                        allowClear
                        showSearch
                        disabled={saving || collaboratorOptions.length === 0}
                        optionFilterProp="searchLabel"
                        placeholder={
                          collaboratorOptions.length > 0
                            ? 'Mời thành viên cùng phối hợp (tuỳ chọn)'
                            : 'Không còn thành viên khác để mời phối hợp'
                        }
                        options={collaboratorOptions.map((member) => ({
                          value: member.userId,
                          searchLabel: `${member.name} ${member.email}`,
                          label: (
                            <Space size={6}>
                              <Avatar
                                size={18}
                                style={{
                                  backgroundColor: member.isOwner ? '#faad14' : '#52c41a',
                                  fontSize: 10,
                                }}
                              >
                                {member.name.charAt(0).toUpperCase()}
                              </Avatar>
                              <span>{member.name}</span>
                            </Space>
                          ),
                        }))}
                      />
                    </Form.Item>

                    <Form.Item
                      name="categoryId"
                      label={
                        <Space size={4}>
                          <TagsOutlined />
                          <span>Danh mục nhóm</span>
                        </Space>
                      }
                      style={{ marginBottom: 4 }}
                    >
                      <Select
                        allowClear
                        disabled={saving || scopedCategories.length === 0}
                        placeholder={
                          scopedCategories.length > 0
                            ? 'Chọn danh mục của nhóm (tuỳ chọn)'
                            : 'Nhóm chưa có danh mục nào'
                        }
                        options={scopedCategories.map((c) => ({
                          value: c.id,
                          label: (
                            <Tag color={c.color} style={{ margin: 0 }}>
                              {c.name}
                            </Tag>
                          ),
                        }))}
                      />
                    </Form.Item>
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </div>
    </Drawer>
  );
}
