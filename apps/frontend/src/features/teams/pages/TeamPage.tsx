import { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Button,
  Form,
  message,
  Typography,
  Empty,
  Spin,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
import { ApiError } from '../../../shared/api';
import { useAuth } from '../../auth/hooks/useAuth';
import type {
  Team,
  TeamRole,
  CreateTeamPayload,
  UpdateTeamPayload,
  AddMemberPayload,
} from '../types/team.types';
import { TeamListCard } from '../components/TeamListCard';
import { TeamDetailCard } from '../components/TeamDetailCard';
import { TeamModals } from '../components/TeamModals';

const { Title, Paragraph } = Typography;

interface TeamPageProps {
  onTeamChanged?: () => void;
}

export default function TeamPage({ onTeamChanged }: TeamPageProps) {
  const { user } = useAuth();
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
      if (err instanceof Error && err.name === 'UnauthorizedError') return;
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
      if (err instanceof Error && err.name === 'UnauthorizedError') return;
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
      if (err instanceof ApiError && err.status === 409) {
        const errData = err.data as
          | { code?: string; taskCount?: number; categoryCount?: number }
          | undefined;
        if (
          errData?.code === 'TEAM_HAS_DEPENDENT_DATA' ||
          errData?.taskCount !== undefined ||
          errData?.categoryCount !== undefined
        ) {
          const taskCount = errData?.taskCount ?? 0;
          const categoryCount = errData?.categoryCount ?? 0;
          message.error(
            `Không thể giải tán nhóm vì nhóm đang có ${taskCount} công việc và ${categoryCount} danh mục. Dữ liệu công việc cần được bảo toàn. Vui lòng xử lý dữ liệu liên quan trước khi xóa nhóm.`,
            8,
          );
          return;
        }
      }
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

  const isOwner = selectedTeam?.ownerId === user?.id;
  const isAdmin = selectedTeam?.currentUserRole === 'ADMIN' && !isOwner;
  const canManageMembers = isOwner || isAdmin;

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
            <TeamListCard
              teams={teams}
              selectedTeamId={selectedTeamId}
              currentUserId={user?.id}
              onSelectTeam={setSelectedTeamId}
            />
          </Col>

          <Col xs={24} md={16}>
            <TeamDetailCard
              selectedTeam={selectedTeam}
              detailLoading={detailLoading}
              currentUserId={user?.id}
              isOwner={isOwner}
              isAdmin={isAdmin}
              canManageMembers={canManageMembers}
              onOpenEdit={() => {
                if (!selectedTeam) return;
                editForm.setFieldsValue({
                  name: selectedTeam.name,
                  description: selectedTeam.description || '',
                });
                setEditModalOpen(true);
              }}
              onDeleteTeam={handleDeleteTeam}
              onLeaveTeam={handleLeaveTeam}
              onOpenAddMember={() => {
                addMemberForm.resetFields();
                setAddMemberModalOpen(true);
              }}
              onUpdateMemberRole={handleUpdateMemberRole}
              onTransferOwnership={handleTransferOwnership}
              onRemoveMember={handleRemoveMember}
            />
          </Col>
        </Row>
      )}

      <TeamModals
        createModalOpen={createModalOpen}
        editModalOpen={editModalOpen}
        addMemberModalOpen={addMemberModalOpen}
        actionSubmitting={actionSubmitting}
        isOwner={isOwner}
        createForm={createForm}
        editForm={editForm}
        addMemberForm={addMemberForm}
        onCloseCreateModal={() => setCreateModalOpen(false)}
        onCloseEditModal={() => setEditModalOpen(false)}
        onCloseAddMemberModal={() => setAddMemberModalOpen(false)}
        onCreateTeam={handleCreateTeam}
        onEditTeam={handleEditTeam}
        onAddMember={handleAddMember}
      />
    </div>
  );
}
