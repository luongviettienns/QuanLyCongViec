import { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Table,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  message,
  Avatar,
  Space,
  Typography,
  Empty,
  Spin,
} from 'antd';
import {
  TeamOutlined,
  PlusOutlined,
  UserAddOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  transferOwnership,
} from '../api/teams.api';
import type { Team, TeamMember, TeamRole, CreateTeamPayload, UpdateTeamPayload, AddMemberPayload } from '../types/task.types';

const { Title, Text, Paragraph } = Typography;

interface TeamPageProps {
  onTeamChanged?: () => void;
}

export default function TeamPage({ onTeamChanged }: TeamPageProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);

  const [createForm] = Form.useForm<CreateTeamPayload>();
  const [editForm] = Form.useForm<UpdateTeamPayload>();
  const [addMemberForm] = Form.useForm<AddMemberPayload>();

  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadTeams = useCallback(async (selectId?: number) => {
    try {
      const data = await getTeams();
      setTeams(data);
      if (data.length > 0) {
        const nextId = selectId && data.some((t) => t.id === selectId) ? selectId : data[0].id;
        setSelectedTeamId(nextId);
      } else {
        setSelectedTeamId(null);
        setSelectedTeam(null);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể tải danh sách nhóm');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTeamDetail = useCallback(async (id: number) => {
    try {
      const data = await getTeamById(id);
      setSelectedTeam(data);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể tải chi tiết nhóm');
    } finally {
      setDetailLoading(false);
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
    };
  }, [loadTeams]);

  useEffect(() => {
    let active = true;
    async function load() {
      await Promise.resolve();
      if (!active || !selectedTeamId) return;
      void loadTeamDetail(selectedTeamId);
    }
    void load();
    return () => {
      active = false;
    };
  }, [selectedTeamId, loadTeamDetail]);

  async function handleCreateTeam(values: CreateTeamPayload) {
    try {
      setActionSubmitting(true);
      const newTeam = await createTeam(values);
      message.success(`Đã tạo nhóm "${newTeam.name}" thành công`);
      createForm.resetFields();
      setCreateModalOpen(false);
      await loadTeams(newTeam.id);
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể tạo nhóm');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleEditTeam(values: UpdateTeamPayload) {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await updateTeam(selectedTeamId, values);
      message.success('Cập nhật thông tin nhóm thành công');
      setEditModalOpen(false);
      await loadTeams(selectedTeamId);
      await loadTeamDetail(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể cập nhật nhóm');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleDeleteTeam() {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await deleteTeam(selectedTeamId);
      message.success('Đã giải tán nhóm thành công');
      await loadTeams();
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể xóa nhóm');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleAddMember(values: AddMemberPayload) {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await addTeamMember(selectedTeamId, values);
      message.success('Thêm thành viên thành công');
      addMemberForm.resetFields();
      setAddMemberModalOpen(false);
      await loadTeamDetail(selectedTeamId);
      await loadTeams(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể thêm thành viên');
    } finally {
      setActionSubmitting(false);
    }
  }

  async function handleUpdateMemberRole(memberId: number, role: TeamRole) {
    if (!selectedTeamId) return;
    try {
      await updateTeamMemberRole(selectedTeamId, memberId, role);
      message.success('Đã thay đổi vai trò thành viên');
      await loadTeamDetail(selectedTeamId);
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể cập nhật vai trò');
    }
  }

  async function handleRemoveMember(memberId: number) {
    if (!selectedTeamId) return;
    try {
      await removeTeamMember(selectedTeamId, memberId);
      message.success('Đã xóa thành viên khỏi nhóm');
      await loadTeamDetail(selectedTeamId);
      await loadTeams(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể xóa thành viên');
    }
  }

  async function handleLeaveTeam(memberId: number) {
    if (!selectedTeamId) return;
    try {
      await removeTeamMember(selectedTeamId, memberId);
      message.success('Đã rời khỏi nhóm');
      await loadTeams();
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể rời nhóm');
    }
  }

  async function handleTransferOwnership(newOwnerId: number) {
    if (!selectedTeamId) return;
    try {
      setActionSubmitting(true);
      await transferOwnership(selectedTeamId, newOwnerId);
      message.success('Đã chuyển quyền sở hữu nhóm thành công');
      await loadTeamDetail(selectedTeamId);
      await loadTeams(selectedTeamId);
      onTeamChanged?.();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : 'Không thể chuyển quyền sở hữu');
    } finally {
      setActionSubmitting(false);
    }
  }

  const callerRole = selectedTeam?.currentUserRole;
  const isOwner = callerRole === 'OWNER';
  const isAdmin = callerRole === 'ADMIN';
  const canManageMembers = isOwner || isAdmin;

  const memberColumns = [
    {
      title: 'Thành viên',
      key: 'user',
      render: (_: unknown, record: TeamMember) => (
        <Space orientation="horizontal" size="middle">
          <Avatar style={{ backgroundColor: record.role === 'OWNER' ? '#f5222d' : record.role === 'ADMIN' ? '#1890ff' : '#52c41a' }}>
            {record.user?.name ? record.user.name.charAt(0).toUpperCase() : 'U'}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{record.user?.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.user?.email}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Vai trò',
      key: 'role',
      render: (_: unknown, record: TeamMember) => {
        if (record.role === 'OWNER') {
          return (
            <Tag icon={<CrownOutlined />} color="gold">
              Trưởng nhóm (OWNER)
            </Tag>
          );
        }
        if (record.role === 'ADMIN') {
          return (
            <Tag icon={<SafetyCertificateOutlined />} color="blue">
              Quản trị viên (ADMIN)
            </Tag>
          );
        }
        return (
          <Tag icon={<UserOutlined />} color="green">
            Thành viên (MEMBER)
          </Tag>
        );
      },
    },
    {
      title: 'Ngày tham gia',
      dataIndex: 'joinedAt',
      key: 'joinedAt',
      render: (val: string) => {
        if (!val) return '-';
        const d = new Date(val);
        return d.toLocaleDateString('vi-VN');
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: unknown, record: TeamMember) => {
        if (record.role === 'OWNER') {
          return <Text type="secondary">Chủ sở hữu</Text>;
        }

        return (
          <Space size="small">
            {isOwner && (
              <>
                <Select
                  size="small"
                  value={record.role}
                  style={{ width: 140 }}
                  onChange={(role) => void handleUpdateMemberRole(record.id, role)}
                  options={[
                    { label: 'Quản trị viên', value: 'ADMIN' },
                    { label: 'Thành viên', value: 'MEMBER' },
                  ]}
                />
                <Popconfirm
                  title="Chuyển quyền chủ nhóm?"
                  description={`Bạn có chắc muốn chuyển quyền sở hữu nhóm cho "${record.user?.name}"? Bạn sẽ trở thành Quản trị viên.`}
                  onConfirm={() => void handleTransferOwnership(record.userId)}
                  okText="Chuyển quyền"
                  cancelText="Hủy"
                >
                  <Button
                    size="small"
                    type="text"
                    icon={<CrownOutlined style={{ color: '#faad14' }} />}
                    title="Chuyển quyền sở hữu nhóm"
                  />
                </Popconfirm>
              </>
            )}

            {(isOwner || (isAdmin && record.role === 'MEMBER')) && (
              <Popconfirm
                title="Xóa thành viên khỏi nhóm?"
                description={`Bạn có chắc muốn xóa "${record.user?.name}" khỏi nhóm?`}
                onConfirm={() => void handleRemoveMember(record.id)}
                okText="Xóa"
                cancelText="Hủy"
                okButtonProps={{ danger: true }}
              >
                <Button size="small" danger type="text" icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Quản lý nhóm làm việc
          </Title>
          <Paragraph type="secondary" style={{ margin: '4px 0 0 0' }}>
            Tạo nhóm, mời thành viên, phân công công việc và quản lý tiến độ chung
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            createForm.resetFields();
            setCreateModalOpen(true);
          }}
        >
          Tạo nhóm mới
        </Button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spin size="large" />
        </div>
      ) : teams.length === 0 ? (
        <Card style={{ borderRadius: 8, textAlign: 'center', padding: '40px 0' }}>
          <Empty
            description="Bạn chưa tham gia nhóm làm việc nào"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                createForm.resetFields();
                setCreateModalOpen(true);
              }}
            >
              Tạo nhóm đầu tiên
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card title={<Space><TeamOutlined /><span>Danh sách nhóm ({teams.length})</span></Space>} style={{ borderRadius: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {teams.map((t) => {
                  const isSelected = t.id === selectedTeamId;
                  const myRole = t.members?.find((m) => m.userId === t.ownerId)?.role || 'MEMBER';
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTeamId(t.id)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #1677ff' : '1px solid #f0f0f0',
                        backgroundColor: isSelected ? '#e6f4ff' : '#ffffff',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 15, color: isSelected ? '#1677ff' : 'inherit' }}>
                          {t.name}
                        </Text>
                        <Tag color={myRole === 'OWNER' ? 'gold' : myRole === 'ADMIN' ? 'blue' : 'default'}>
                          {myRole}
                        </Tag>
                      </div>
                      {t.description && (
                        <Paragraph
                          type="secondary"
                          ellipsis={{ rows: 1 }}
                          style={{ margin: '4px 0 0 0', fontSize: 12 }}
                        >
                          {t.description}
                        </Paragraph>
                      )}
                      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#8c8c8c' }}>
                        <span>{t._count?.members ?? t.members?.length ?? 1} thành viên</span>
                        <span>{t._count?.tasks ?? 0} công việc</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Col>

          <Col xs={24} md={16}>
            {detailLoading ? (
              <Card style={{ borderRadius: 8, display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <Spin />
              </Card>
            ) : selectedTeam ? (
              <Card
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <Space>
                        <Title level={4} style={{ margin: 0 }}>
                          {selectedTeam.name}
                        </Title>
                        <Tag color={isOwner ? 'gold' : isAdmin ? 'blue' : 'green'}>
                          {isOwner ? 'Chủ nhóm' : isAdmin ? 'Quản trị viên' : 'Thành viên'}
                        </Tag>
                      </Space>
                      {selectedTeam.description && (
                        <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 4 }}>
                          {selectedTeam.description}
                        </div>
                      )}
                    </div>
                    <Space>
                      {isOwner && (
                        <>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => {
                              editForm.setFieldsValue({
                                name: selectedTeam.name,
                                description: selectedTeam.description || '',
                              });
                              setEditModalOpen(true);
                            }}
                          >
                            Chỉnh sửa
                          </Button>
                          <Popconfirm
                            title="Giải tán nhóm?"
                            description="Tất cả dữ liệu công việc của nhóm sẽ bị xóa vĩnh viễn!"
                            onConfirm={handleDeleteTeam}
                            okText="Giải tán"
                            cancelText="Hủy"
                            okButtonProps={{ danger: true }}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />}>
                              Giải tán nhóm
                            </Button>
                          </Popconfirm>
                        </>
                      )}
                      {!isOwner && (
                        <Popconfirm
                          title="Rời khỏi nhóm?"
                          description="Bạn sẽ không còn quyền truy cập các công việc của nhóm này!"
                          onConfirm={() => {
                            const selfMember = selectedTeam.members.find((m) => m.userId === selectedTeam.members[0]?.userId);
                            if (selfMember) {
                              void handleLeaveTeam(selfMember.id);
                            }
                          }}
                          okText="Rời nhóm"
                          cancelText="Hủy"
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger icon={<LogoutOutlined />}>
                            Rời nhóm
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                  </div>
                }
                style={{ borderRadius: 8 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 15 }}>
                    Thành viên nhóm ({selectedTeam.members.length})
                  </Text>
                  {canManageMembers && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<UserAddOutlined />}
                      onClick={() => {
                        addMemberForm.resetFields();
                        setAddMemberModalOpen(true);
                      }}
                    >
                      Thêm thành viên
                    </Button>
                  )}
                </div>

                <Table
                  dataSource={selectedTeam.members}
                  columns={memberColumns}
                  rowKey="id"
                  pagination={false}
                  size="small"
                />
              </Card>
            ) : null}
          </Col>
        </Row>
      )}

      <Modal
        title="Tạo nhóm làm việc mới"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => void createForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Tạo nhóm"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={(values) => void handleCreateTeam(values)}>
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nhóm' },
              { min: 2, message: 'Tên nhóm tối thiểu 2 ký tự' },
              { max: 50, message: 'Tên nhóm tối đa 50 ký tự' },
            ]}
          >
            <Input placeholder="Ví dụ: Đội ngũ Phát triển Web" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhóm" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
            <Input.TextArea placeholder="Mô tả mục tiêu hoặc phạm vi công việc của nhóm" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Chỉnh sửa thông tin nhóm"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={() => void editForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={(values) => void handleEditTeam(values)}>
          <Form.Item
            name="name"
            label="Tên nhóm"
            rules={[
              { required: true, message: 'Vui lòng nhập tên nhóm' },
              { min: 2, message: 'Tên nhóm tối thiểu 2 ký tự' },
              { max: 50, message: 'Tên nhóm tối đa 50 ký tự' },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhóm" rules={[{ max: 255, message: 'Tối đa 255 ký tự' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Thêm thành viên vào nhóm"
        open={addMemberModalOpen}
        onCancel={() => setAddMemberModalOpen(false)}
        onOk={() => void addMemberForm.submit()}
        confirmLoading={actionSubmitting}
        okText="Thêm thành viên"
        cancelText="Hủy"
        destroyOnClose
      >
        <Form
          form={addMemberForm}
          layout="vertical"
          initialValues={{ role: 'MEMBER' }}
          onFinish={(values) => void handleAddMember(values)}
        >
          <Form.Item
            name="email"
            label="Email tài khoản"
            rules={[
              { required: true, message: 'Vui lòng nhập email của thành viên' },
              { type: 'email', message: 'Định dạng email không hợp lệ' },
            ]}
          >
            <Input placeholder="Ví dụ: colleague@example.com" />
          </Form.Item>
          <Form.Item name="role" label="Vai trò" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Thành viên (MEMBER)', value: 'MEMBER' },
                { label: 'Quản trị viên (ADMIN)', value: 'ADMIN' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
