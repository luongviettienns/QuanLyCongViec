import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  UserOutlined,
  TeamOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
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
import { isAbortError, isUnauthorizedError } from '../../../shared/api';
import { ApiErrorFallback } from '../../../app/pages/errors';

const { Title, Text, Paragraph } = Typography;

interface CategoryPageProps {
  onChanged?: () => void;
}

export default function CategoryPage({ onChanged }: CategoryPageProps) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsError, setTeamsError] = useState<unknown>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const teamsAbortRef = useRef<AbortController | null>(null);
  const [selectedContext, setSelectedContext] = useState<'personal' | number>('personal');

  const {
    categories,
    loading,
    error,
    setTeamId,
    fetchCategories,
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

  const loadTeams = useCallback(async () => {
    teamsAbortRef.current?.abort();
    const controller = new AbortController();
    teamsAbortRef.current = controller;
    setTeamsLoading(true);
    try {
      const teamList = await getTeams(controller.signal);
      if (!controller.signal.aborted && teamsAbortRef.current === controller) {
        setTeams(teamList);
        setTeamsError(null);
      }
    } catch (err: unknown) {
      if (controller.signal.aborted || isAbortError(err) || isUnauthorizedError(err)) {
        return;
      }
      if (teamsAbortRef.current === controller) {
        setTeamsError(err);
      }
    } finally {
      if (!controller.signal.aborted && teamsAbortRef.current === controller) {
        setTeamsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      await Promise.resolve();
      if (!active) return;
      void loadTeams();
    }
    void init();
    return () => {
      active = false;
      teamsAbortRef.current?.abort();
    };
  }, [loadTeams]);

  const currentTeam =
    typeof selectedContext === 'number'
      ? teams.find((t) => t.id === selectedContext)
      : null;

  const isOwner = Boolean(currentTeam && currentTeam.ownerId === user?.id);
  const isOwnerOrAdmin =
    selectedContext === 'personal' ||
    Boolean(
      currentTeam &&
        (isOwner ||
          currentTeam.members?.some(
            (m) => m.userId === user?.id && m.role === 'ADMIN',
          )),
    );

  const contextOptions = useMemo(() => {
    return [
      {
        label: (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#8c8c8c',
              letterSpacing: '0.5px',
            }}
          >
            Không gian cá nhân
          </span>
        ),
        options: [
          {
            value: 'personal' as const,
            title: 'Danh mục cá nhân',
            label: (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '3px 0',
                }}
              >
                <Space size={10}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: '#e6f4ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1677ff',
                      fontSize: 14,
                    }}
                  >
                    <UserOutlined />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1f1f1f', lineHeight: 1.3 }}>
                      Danh mục cá nhân
                    </div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: 1.2 }}>
                      Riêng tư · Dành riêng cho bạn
                    </div>
                  </div>
                </Space>
                <Tag bordered={false} color="blue" style={{ margin: 0, fontSize: 11 }}>
                  Cá nhân
                </Tag>
              </div>
            ),
          },
        ],
      },
      ...(teams.length > 0
        ? [
            {
              label: (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: '#8c8c8c',
                    letterSpacing: '0.5px',
                  }}
                >
                  Nhóm làm việc ({teams.length})
                </span>
              ),
              options: teams.map((t) => {
                const isTeamOwner = t.ownerId === user?.id;
                const isTeamAdmin = t.members?.some((m) => m.userId === user?.id && m.role === 'ADMIN');
                return {
                  value: t.id,
                  title: t.name,
                  label: (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 0',
                      }}
                    >
                      <Space size={10}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: isTeamOwner ? '#fffbe6' : isTeamAdmin ? '#f0f5ff' : '#f5f5f5',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isTeamOwner ? '#d48806' : isTeamAdmin ? '#1d39c4' : '#595959',
                            fontSize: 14,
                          }}
                        >
                          <TeamOutlined />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1f1f1f', lineHeight: 1.3 }}>
                            {t.name}
                          </div>
                          <div style={{ fontSize: 11, color: '#8c8c8c', lineHeight: 1.2 }}>
                            {t.members?.length || 1} thành viên
                          </div>
                        </div>
                      </Space>
                      <Tag
                        bordered={false}
                        color={isTeamOwner ? 'gold' : isTeamAdmin ? 'geekblue' : 'default'}
                        style={{ margin: 0, fontSize: 11 }}
                      >
                        {isTeamOwner ? 'Chủ sở hữu' : isTeamAdmin ? 'Quản trị viên' : 'Thành viên'}
                      </Tag>
                    </div>
                  ),
                };
              }),
            },
          ]
        : []),
    ];
  }, [teams, user?.id]);

  function renderSelectedLabel(props: { label?: React.ReactNode; value: string | number }) {
    if (props.value === 'personal') {
      return (
        <Space size={8} style={{ fontWeight: 600, fontSize: 13 }}>
          <UserOutlined style={{ color: '#1677ff' }} />
          <span>Danh mục cá nhân</span>
          <Tag bordered={false} color="blue" style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '18px' }}>
            Cá nhân
          </Tag>
        </Space>
      );
    }
    const teamId = typeof props.value === 'number' ? props.value : Number(props.value);
    const team = teams.find((t) => t.id === teamId);
    if (!team) return props.label;
    const isTeamOwner = team.ownerId === user?.id;
    const isTeamAdmin = team.members?.some((m) => m.userId === user?.id && m.role === 'ADMIN');
    return (
      <Space size={8} style={{ fontWeight: 600, fontSize: 13 }}>
        <TeamOutlined style={{ color: isTeamOwner ? '#d48806' : '#1677ff' }} />
        <span>{team.name}</span>
        <Tag
          bordered={false}
          color={isTeamOwner ? 'gold' : isTeamAdmin ? 'geekblue' : 'default'}
          style={{ margin: 0, fontSize: 11, padding: '0 6px', lineHeight: '18px' }}
        >
          {isTeamOwner ? 'Chủ sở hữu' : isTeamAdmin ? 'Quản trị' : 'Thành viên'}
        </Tag>
      </Space>
    );
  }

  function handleContextChange(value: 'personal' | number) {
    setSelectedContext(value);
    setTeamId(value === 'personal' ? null : value);
  }

  async function onFinishCreate(values: { name: string }) {
    const normalizedColor = createColor ? (createColor.trim().startsWith('#') ? createColor.trim() : `#${createColor.trim()}`) : '#1677ff';
    const payload: CreateCategoryPayload = {
      name: values.name.trim(),
      color: normalizedColor,
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
    const normalizedColor = editColor ? (editColor.trim().startsWith('#') ? editColor.trim() : `#${editColor.trim()}`) : '#1677ff';
    const success = await handleUpdate(editingCategory.id, {
      name: values.name.trim(),
      color: normalizedColor,
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

      {/* Workspace Context Switcher Header */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e8e8e8',
          padding: '14px 18px',
          marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1 }}>
          <Space size={8} align="center">
            <AppstoreOutlined style={{ color: '#1677ff', fontSize: 16 }} />
            <Text strong style={{ fontSize: 14, color: '#262626' }}>
              Phạm vi quản lý:
            </Text>
          </Space>

          <Select<'personal' | number>
            value={selectedContext}
            onChange={handleContextChange}
            style={{ minWidth: 280, maxWidth: screens.sm ? 400 : '100%', flex: screens.sm ? undefined : 1 }}
            size="middle"
            popupMatchSelectWidth={screens.sm ? 380 : true}
            showSearch
            filterOption={(input, option) =>
              Boolean(option?.title?.toLowerCase().includes(input.toLowerCase()))
            }
            labelRender={renderSelectedLabel}
            options={contextOptions}
          />
        </div>

        {/* Status Pill on the Right */}
        <Space size={8} wrap>
          {selectedContext === 'personal' ? (
            <Tag color="blue" bordered={false} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}>
              <UserOutlined style={{ marginRight: 6 }} />
              {categories.length} danh mục cá nhân
            </Tag>
          ) : (
            <>
              <Tag
                color={isOwner ? 'gold' : isOwnerOrAdmin ? 'geekblue' : 'default'}
                bordered={false}
                style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}
              >
                {isOwner ? (
                  <>
                    <CrownOutlined style={{ marginRight: 6 }} />
                    Chủ sở hữu nhóm
                  </>
                ) : isOwnerOrAdmin ? (
                  <>
                    <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                    Quản trị viên
                  </>
                ) : (
                  <>
                    <LockOutlined style={{ marginRight: 6 }} />
                    Thành viên (Chỉ đọc)
                  </>
                )}
              </Tag>
              <Tag color="cyan" bordered={false} style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}>
                <TeamOutlined style={{ marginRight: 6 }} />
                {categories.length} danh mục nhóm
              </Tag>
            </>
          )}
        </Space>
      </div>

      {Boolean(error) && categories.length === 0 ? (
        <ApiErrorFallback
          variant="page"
          error={error}
          onRetry={() => {
            void fetchCategories();
            if (teamsError) {
              void loadTeams();
            }
          }}
          retrying={loading}
          showNavigation
        />
      ) : (
        <>
          {Boolean(teamsError) && (
            <div style={{ marginBottom: 20 }}>
              <ApiErrorFallback
                variant="inline"
                title="Không thể tải danh sách nhóm"
                error={teamsError}
                onRetry={() => void loadTeams()}
                retrying={teamsLoading}
                showNavigation={false}
              />
            </div>
          )}

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
            {Boolean(error) && categories.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <ApiErrorFallback
                  variant="inline"
                  error={error}
                  onRetry={() => void fetchCategories()}
                  retrying={loading}
                  showNavigation={false}
                />
              </div>
            )}

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
        </>
      )}

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
