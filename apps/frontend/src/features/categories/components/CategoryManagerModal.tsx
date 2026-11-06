import { useState } from 'react';
import {
  Modal,
  Table,
  Form,
  Input,
  Button,
  ColorPicker,
  Space,
  Tag,
  Popconfirm,
  Typography,
  Card,
  Grid,
  type TableColumnsType,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useCategories } from '../hooks/useCategories';
import {
  CATEGORY_PRESET_COLORS,
  type Category,
  type CreateCategoryPayload,
} from '../types/category.types';

const { Text } = Typography;

interface CategoryManagerModalProps {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export default function CategoryManagerModal({
  open,
  onClose,
  onChanged,
}: CategoryManagerModalProps) {
  const {
    categories,
    loading,
    handleCreate,
    handleUpdate,
    handleDelete,
  } = useCategories();

  const screens = Grid.useBreakpoint();
  const [createForm] = Form.useForm<{ name: string; color: string }>();
  const [editForm] = Form.useForm<{ name: string; color: string }>();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [createColor, setCreateColor] = useState<string>('#1677ff');
  const [editColor, setEditColor] = useState<string>('#1677ff');

  async function onFinishCreate(values: { name: string }) {
    const payload: CreateCategoryPayload = {
      name: values.name.trim(),
      color: createColor,
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
      color: record.color || '#1677ff',
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
      title: 'Màu',
      dataIndex: 'color',
      key: 'color',
      width: 70,
      render: (color: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              backgroundColor: color,
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
        </div>
      ),
    },
    {
      title: 'Tên danh mục',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Category) => (
        <Tag color={record.color} style={{ fontSize: 13, padding: '2px 8px' }}>
          {name}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 100,
      align: 'right',
      render: (_, record: Category) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => startEdit(record)}
          />
          <Popconfirm
            title="Xoá danh mục"
            description={`Bạn có chắc muốn xoá "${record.name}"?`}
            onConfirm={() => void confirmDelete(record.id)}
            okText="Xoá"
            cancelText="Huỷ"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        title={
          <Space align="center">
            <TagsOutlined style={{ color: '#1677ff' }} />
            <span>Quản lý danh mục công việc</span>
          </Space>
        }
        footer={null}
        width={screens.sm ? 600 : '95%'}
        destroyOnHidden
      >
        <Card
          size="small"
          style={{ marginBottom: 16, backgroundColor: '#fafafa' }}
          bordered={false}
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
                gap: 8,
                alignItems: screens.sm ? 'center' : 'stretch',
              }}
            >
              <Form.Item
                name="name"
                rules={[
                  { required: true, message: 'Nhập tên danh mục' },
                  { min: 2, message: 'Tối thiểu 2 ký tự' },
                  { max: 50, message: 'Tối đa 50 ký tự' },
                ]}
                style={{ flex: 1, margin: 0 }}
              >
                <Input placeholder="Tên danh mục mới (vd: Họp dự án, Cá nhân...)" />
              </Form.Item>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Form.Item style={{ margin: 0 }}>
                  <ColorPicker
                    value={createColor}
                    onChange={(c) => setCreateColor(c.toHexString())}
                    presets={[{ label: 'Màu gợi ý', colors: CATEGORY_PRESET_COLORS }]}
                  />
                </Form.Item>

                <Form.Item style={{ margin: 0, flex: screens.sm ? undefined : 1 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<PlusOutlined />}
                    loading={loading}
                    style={{ width: screens.sm ? undefined : '100%' }}
                  >
                    Thêm
                  </Button>
                </Form.Item>
              </div>
            </div>
          </Form>
        </Card>

        <Table
          columns={columns}
          dataSource={categories}
          rowKey="id"
          size="small"
          pagination={false}
          loading={loading}
          locale={{ emptyText: 'Chưa có danh mục nào' }}
          scroll={{ y: 320 }}
        />
      </Modal>

      <Modal
        open={editingCategory !== null}
        onCancel={() => {
          setEditingCategory(null);
          editForm.resetFields();
        }}
        title="Chỉnh sửa danh mục"
        okText="Lưu thay đổi"
        cancelText="Huỷ"
        onOk={() => editForm.submit()}
        confirmLoading={loading}
        destroyOnHidden
        width={screens.sm ? 420 : '90%'}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) => void onFinishEdit(values)}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Tên danh mục"
            rules={[
              { required: true, message: 'Vui lòng nhập tên danh mục' },
              { min: 2, message: 'Tối thiểu 2 ký tự' },
              { max: 50, message: 'Tối đa 50 ký tự' },
            ]}
          >
            <Input placeholder="Nhập tên danh mục" />
          </Form.Item>

          <Form.Item label="Mã màu">
            <Space align="center">
              <ColorPicker
                value={editColor}
                onChange={(c) => setEditColor(c.toHexString())}
                presets={[{ label: 'Màu gợi ý', colors: CATEGORY_PRESET_COLORS }]}
              />
              <Text type="secondary">{editColor}</Text>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
