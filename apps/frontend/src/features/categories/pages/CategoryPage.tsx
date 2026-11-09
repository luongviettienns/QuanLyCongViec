import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Form,
  Input,
  Button,
  ColorPicker,
  Space,
  Tag,
  Popconfirm,
  Typography,
  Modal,
  List,
  Select,
  Alert,
  type TableColumnsType,
} from 'antd';
import { useResponsive } from '../../../shared/hooks';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TagsOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useCategories } from '../hooks/useCategories';
import { trimmedLengthRule } from '../../../shared/utils/validation.utils';
import {
  CATEGORY_PRESET_COLORS,
  type Category,
  type CreateCategoryPayload,
} from '../types/category.types';
import { useAuth } from '../../auth/hooks/useAuth';
import { getTeams } from '../../teams/api/teams.api';
import type { Team } from '../../teams/types/team.types';

const { Title, Text, Paragraph } = Typography;

interface CategoryPageProps {
  onChanged?: () => void;
}

export default function CategoryPage({ onChanged }: CategoryPageProps) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedContext, setSelectedContext] = useState<'personal' | number>('personal');

  const {
    categories,
    loading,
    setTeamId,
    handleCreate,
    handleUpdate,
    handleDelete,
  } = useCategories({ teamId: null });

  const screens = useResponsive();
  const [createForm] = Form.useForm<{ name: string }>();
  const [editForm] = Form.useForm<{ name: string }>();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [createColor, setCreateColor] = useState<string>('#1677ff');
  const [editColor, setEditColor] = useState<string>('#1677ff');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const teamList = await getTeams();
        if (active) setTeams(teamList);
      } catch {
        // ignore
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const currentTeam =
    typeof selectedContext === 'number'
      ? teams.find((t) => t.id === selectedContext)
      : null;

  const isOwnerOrAdmin =
    selectedContext === 'personal' ||
    Boolean(
      currentTeam &&
        (currentTeam.ownerId === user?.id ||
          currentTeam.members?.some(
            (m) => m.userId === user?.id && m.role === 'ADMIN',
          )),
    );

  function handleContextChange(value: 'personal' | number) {
    setSelectedContext(value);
    setTeamId(value === 'personal' ? null : value);
  }

  async function onFinishCreate(values: { name: string }) {
    const payload: CreateCategoryPayload = {
      name: values.name.trim(),
      color: createColor,
      teamId: typeof selectedContext === 'number' ? selectedContext : undefined,
    };
    const success = await handleCreate(payload);
    if (success) {
      createForm.resetFields();
      setCreateColor('#1677ff');
      onChanged?.();
    }
  }

  function startEdit(record: Category) {
    setEditingCategory(record);
    setEditColor(record.color || '#1677ff');
    editForm.setFieldsValue({
      name: record.name,
    });
  }

  async function onFinishEdit(values: { name: string }) {
    if (!editingCategory) return;
    const success = await handleUpdate(editingCategory.id, {
      name: values.name.trim(),
      color: editColor,
    });
    if (success) {
      setEditingCategory(null);
      editForm.resetFields();
      onChanged?.();
    }
  }

  async function confirmDelete(id: number) {
    const success = await handleDelete(id);
    if (success) {
      onChanged?.();
    }
  }

  const columns: TableColumnsType<Category> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'Màu đại diện',
      dataIndex: 'color',
      key: 'color',
      width: 130,
      render: (color: string) => (
        <Space size={8} align="center">
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              backgroundColor: color,
              border: '1px solid rgba(0,0,0,0.12)',
            }}
          />
          <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{color}</Text>
        </Space>
      ),
    },
    {
      title: 'Tên danh mục',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Category) => (
        <Tag color={record.color} style={{ fontSize: 13, padding: '3px 10px', borderRadius: 4 }}>
          {name}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 140,
      align: 'right',
      render: (_, record: Category) => {
        if (!isOwnerOrAdmin) {
          return <Tag style={{ margin: 0 }}>Chỉ xem</Tag>;
        }
        return (
          <Space size="small">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => startEdit(record)}
              style={{ color: '#1677ff' }}
            >
              Sửa
            </Button>
            <Popconfirm
              title="Xoá danh mục"
              description={`Bạn có chắc muốn xoá danh mục "${record.name}"?`}
              onConfirm={() => void confirmDelete(record.id)}
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" danger icon={<DeleteOutlined />}>
                Xoá
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Space align="center" size={10} style={{ marginBottom: 4 }}>
          <TagsOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0, fontWeight: 700 }}>
            Quản lý danh mục
          </Title>
        </Space>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          Tổ chức, phân loại và gắn nhãn màu sắc cho các công việc trong hệ thống
        </Paragraph>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Space orientation={screens.sm ? 'horizontal' : 'vertical'} size={12} style={{ width: '100%' }}>
          <Text strong>Phạm vi danh mục:</Text>
          <Select<'personal' | number>
            value={selectedContext}
            onChange={handleContextChange}
            style={{ width: screens.sm ? 280 : '100%' }}
            options={[
              { value: 'personal', label: '👤 Danh mục cá nhân' },
              ...teams.map((t) => ({
                value: t.id,
                label: `👥 Nhóm: ${t.name}`,
              })),
            ]}
          />
        </Space>
      </div>

      {!isOwnerOrAdmin && (
        <Alert
          message="Bạn đang xem danh mục của nhóm với quyền Thành viên (chỉ đọc). Chỉ Trưởng nhóm và Quản trị viên mới có thể tạo, chỉnh sửa hoặc xoá danh mục nhóm."
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />
      )}

      {isOwnerOrAdmin && (
        <Card
          title={
            <Space size={8}>
              <PlusOutlined style={{ color: '#1677ff' }} />
              <span>
                {currentTeam
                  ? `Thêm danh mục cho nhóm "${currentTeam.name}"`
                  : 'Thêm danh mục cá nhân mới'}
              </span>
            </Space>
          }
          style={{ marginBottom: 24, borderRadius: 8 }}
        >
          <Form
            form={createForm}
            layout="vertical"
            onFinish={(values) => void onFinishCreate(values)}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: screens.sm ? 'row' : 'column',
                gap: 12,
                alignItems: screens.sm ? 'flex-end' : 'stretch',
              }}
            >
              <Form.Item
                name="name"
                label="Tên danh mục"
                rules={[
                  { required: true, message: 'Vui lòng nhập tên danh mục' },
                  trimmedLengthRule({ label: 'Tên danh mục', min: 2, max: 50 }),
                ]}
                style={{ flex: 1, margin: 0 }}
              >
                <Input
                  placeholder={
                    currentTeam
                      ? 'Ví dụ: Bug, Feature, Urgent, Frontend...'
                      : 'Nhập tên danh mục cá nhân (ví dụ: Học tập, Cá nhân...)'
                  }
                  size="large"
                />
              </Form.Item>

              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: 14, marginBottom: 8, color: '#595959' }}>Màu sắc</div>
                  <ColorPicker
                    value={createColor}
                    onChange={(c) => setCreateColor(c.toHexString())}
                    presets={[{ label: 'Màu gợi ý', colors: CATEGORY_PRESET_COLORS }]}
                    size="large"
                  />
                </div>

                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<PlusOutlined />}
                  loading={loading}
                  size="large"
                  style={{ minWidth: 120 }}
                >
                  Tạo mới
                </Button>
              </div>
            </div>
          </Form>
        </Card>
      )}

      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={8}>
              <AppstoreOutlined style={{ color: '#1677ff' }} />
              <span>
                {currentTeam
                  ? `Danh sách danh mục nhóm "${currentTeam.name}"`
                  : 'Danh sách danh mục cá nhân'}
              </span>
            </Space>
            <Tag color="blue" style={{ margin: 0 }}>
              {categories.length} danh mục
            </Tag>
          </div>
        }
        style={{ borderRadius: 8 }}
      >
        {screens.xs ? (
          <List
            loading={loading}
            dataSource={categories}
            locale={{ emptyText: 'Chưa có danh mục nào' }}
            renderItem={(item) => (
              <Card
                size="small"
                style={{
                  marginBottom: 10,
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space align="center" size={8}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        backgroundColor: item.color,
                        border: '1px solid rgba(0,0,0,0.1)',
                      }}
                    />
                    <Tag color={item.color} style={{ fontSize: 13, margin: 0 }}>
                      {item.name}
                    </Tag>
                  </Space>

                  {isOwnerOrAdmin ? (
                    <Space size="small">
                      <Button
                        size="small"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => startEdit(item)}
                        style={{ color: '#1677ff' }}
                      >
                        Sửa
                      </Button>
                      <Popconfirm
                        title="Xoá danh mục"
                        description={`Bạn có chắc muốn xoá "${item.name}"?`}
                        onConfirm={() => void confirmDelete(item.id)}
                        okText="Xoá"
                        cancelText="Huỷ"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                        >
                          Xoá
                        </Button>
                      </Popconfirm>
                    </Space>
                  ) : (
                    <Tag style={{ margin: 0 }}>Chỉ xem</Tag>
                  )}
                </div>
              </Card>
            )}
          />
        ) : (
          <Table
            columns={columns}
            dataSource={categories}
            rowKey="id"
            loading={loading}
            pagination={false}
            locale={{ emptyText: 'Chưa có danh mục nào' }}
          />
        )}
      </Card>

      <Modal
        title={
          currentTeam
            ? `Chỉnh sửa danh mục nhóm "${currentTeam.name}"`
            : 'Chỉnh sửa danh mục cá nhân'
        }
        open={Boolean(editingCategory)}
        onCancel={() => {
          setEditingCategory(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        confirmLoading={loading}
        okText="Lưu thay đổi"
        cancelText="Huỷ"
        destroyOnHidden
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => void onFinishEdit(values)}
        >
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[
              { required: true, message: 'Vui lòng nhập tên danh mục' },
              trimmedLengthRule({ label: 'Tên danh mục', min: 2, max: 50 }),
            ]}
          >
            <Input placeholder="Nhập tên danh mục..." />
          </Form.Item>

          <Form.Item label="Màu đại diện">
            <Space align="center" size={10}>
              <ColorPicker
                value={editColor}
                onChange={(c) => setEditColor(c.toHexString())}
                presets={[{ label: 'Màu gợi ý', colors: CATEGORY_PRESET_COLORS }]}
              />
              <Tag color={editColor} style={{ margin: 0 }}>
                Xem trước
              </Tag>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
