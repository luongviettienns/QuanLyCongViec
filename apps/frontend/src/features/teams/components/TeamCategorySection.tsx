import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Space,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  ColorPicker,
  Typography,
  Empty,
  Spin,
  message,
  Popconfirm,
} from 'antd';
import { PlusOutlined, TagsOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Category, CreateCategoryPayload } from '../../categories/types/category.types';
import { CATEGORY_PRESET_COLORS } from '../../categories/types/category.types';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../../categories/api/categories.api';
import { useAuth } from '../../auth/hooks/useAuth';
import { useRealtimeEvent, useRealtimeReconnect } from '../../realtime';
import type { RealtimeEventData } from '../../realtime/types/realtime.types';
import {
  shouldRefreshTeamCategoriesOnEvent,
  createDebouncedCallback,
} from '../utils/team-realtime.utils';

const { Text } = Typography;

interface TeamCategorySectionProps {
  teamId: number;
  canManage: boolean;
}

export function TeamCategorySection({ teamId, canManage }: TeamCategorySectionProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm<{ name: string }>();
  const [color, setColor] = useState('#1677ff');
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCategories({ teamId });
      setCategories(data);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'UnauthorizedError') return;
      message.error('Không thể tải danh mục nhóm');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    let active = true;
    async function init() {
      await Promise.resolve();
      if (!active) return;
      await loadCategories();
    }
    void init();
    return () => {
      active = false;
    };
  }, [loadCategories]);

  const debouncedReloadRef = useRef<ReturnType<typeof createDebouncedCallback> | null>(null);

  useEffect(() => {
    const debounced = createDebouncedCallback(() => {
      void loadCategories();
    }, 300);
    debouncedReloadRef.current = debounced;
    return () => {
      debounced.cancel();
      debouncedReloadRef.current = null;
    };
  }, [loadCategories]);

  const handleRealtimeCategoryChanged = useCallback(
    (event: RealtimeEventData) => {
      if (
        shouldRefreshTeamCategoriesOnEvent({
          eventType: event.type,
          activeTeamId: teamId,
          currentUserId: user?.id,
          event,
        })
      ) {
        debouncedReloadRef.current?.trigger();
      }
    },
    [teamId, user?.id],
  );

  useRealtimeEvent('TEAM_CATEGORY_CHANGED', handleRealtimeCategoryChanged);
  useRealtimeReconnect(() => {
    debouncedReloadRef.current?.trigger();
  });

  function handleOpenCreate() {
    setEditingCategory(null);
    setColor('#1677ff');
    form.resetFields();
    setModalOpen(true);
  }

  function handleOpenEdit(cat: Category) {
    setEditingCategory(cat);
    setColor(cat.color || '#1677ff');
    form.setFieldsValue({ name: cat.name });
    setModalOpen(true);
  }

  async function handleSubmit(values: { name: string }) {
    try {
      setSubmitting(true);
      const normalizedColor = color ? (color.startsWith('#') ? color : `#${color}`) : '#1890ff';
      if (editingCategory) {
        const updated = await updateCategory(editingCategory.id, {
          name: values.name.trim(),
          color: normalizedColor,
        });
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        message.success(`Đã cập nhật danh mục "${updated.name}"`);
      } else {
        const payload: CreateCategoryPayload = {
          name: values.name.trim(),
          color: normalizedColor,
          teamId,
        };
        const created = await createCategory(payload);
        setCategories((prev) => [...prev, created]);
        message.success(`Đã thêm danh mục "${created.name}" vào nhóm`);
      }
      setModalOpen(false);
      form.resetFields();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'UnauthorizedError') return;
      message.error(err instanceof Error ? err.message : 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      message.success(res.message);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'UnauthorizedError') return;
      message.error(err instanceof Error ? err.message : 'Không thể xoá danh mục');
    }
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <Space size={8} align="center">
          <TagsOutlined style={{ color: '#1677ff', fontSize: 16 }} />
          <Text strong style={{ fontSize: 15 }}>
            Danh mục nhóm ({categories.length})
          </Text>
        </Space>
        {canManage && (
          <Button
            size="small"
            type="dashed"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
          >
            Thêm danh mục
          </Button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '16px 0', textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : categories.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Nhóm chưa có nhãn danh mục nào"
          style={{ margin: '8px 0' }}
        />
      ) : (
        <Space size={[8, 8]} wrap align="center">
          {categories.map((cat) => (
            <Tag
              key={cat.id}
              color={cat.color}
              style={{
                fontSize: 13,
                padding: '4px 10px',
                borderRadius: 4,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                margin: 0,
              }}
            >
              <span>{cat.name}</span>
              {canManage && (
                <Space size={2}>
                  <EditOutlined
                    style={{ cursor: 'pointer', fontSize: 11 }}
                    onClick={() => handleOpenEdit(cat)}
                  />
                  <Popconfirm
                    title="Xoá danh mục nhóm?"
                    description={`Xoá "${cat.name}" khỏi nhóm này?`}
                    onConfirm={() => void handleDelete(cat.id)}
                    okText="Xoá"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true }}
                  >
                    <DeleteOutlined style={{ cursor: 'pointer', fontSize: 11 }} />
                  </Popconfirm>
                </Space>
              )}
            </Tag>
          ))}
        </Space>
      )}

      <Modal
        title={editingCategory ? 'Chỉnh sửa danh mục nhóm' : 'Thêm danh mục mới cho nhóm'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={submitting}
        okText={editingCategory ? 'Lưu thay đổi' : 'Thêm mới'}
        cancelText="Huỷ"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSubmit(values)}
        >
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[
              { required: true, message: 'Vui lòng nhập tên danh mục' },
              { min: 2, message: 'Tên danh mục phải có ít nhất 2 ký tự' },
              { max: 50, message: 'Tên danh mục không được vượt quá 50 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Bug, Feature, Urgent, Frontend..." maxLength={50} showCount />
          </Form.Item>

          <Form.Item label="Màu đại diện">
            <Space align="center" size={10}>
              <ColorPicker
                value={color}
                onChange={(c) => setColor(c.toHexString())}
                presets={[{ label: 'Màu gợi ý', colors: CATEGORY_PRESET_COLORS }]}
                showText
              />
              <Tag color={color} style={{ margin: 0, fontSize: 13 }}>
                Xem trước
              </Tag>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
