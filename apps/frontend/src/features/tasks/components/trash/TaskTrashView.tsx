import { useMemo, useState } from 'react';
import {
  Table,
  List,
  Card,
  Tag,
  Button,
  Popconfirm,
  Modal,
  Space,
  Tooltip,
  Alert,
  Checkbox,
  type TableProps,
} from 'antd';
import {
  UndoOutlined,
  DeleteOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  CloseOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { BulkTaskResult, TrashTask } from '../../types/task.types.ts';
import { TASK_PRIORITY_CONFIG } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import { useAuth } from '../../../auth/hooks/useAuth.ts';
import { canManageTrashTask } from '../../utils/task-permission.utils.ts';
import { summarizeTrashSelection } from '../../utils/task-bulk.utils.ts';
import { formatDate } from '../../../../shared/utils/date.utils.ts';
import { useResponsive } from '../../../../shared/hooks';

export interface TaskTrashViewProps {
  tasks: TrashTask[];
  teams: Team[];
  loading: boolean;
  onRestore: (id: number) => Promise<void>;
  onPermanentDelete: (id: number) => Promise<void>;
  onBulkRestore?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onBulkPermanentDelete?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onEmptyTrash?: () => Promise<BulkTaskResult | null | void>;
}

type TrashDeleteModalState =
  | { kind: 'single'; task: TrashTask }
  | { kind: 'bulk'; ids: number[]; unmanageableCount: number }
  | { kind: 'empty'; count: number }
  | null;

export default function TaskTrashView({
  tasks,
  teams = [],
  loading,
  onRestore,
  onPermanentDelete,
  onBulkRestore,
  onBulkPermanentDelete,
  onEmptyTrash,
}: TaskTrashViewProps) {
  const { user } = useAuth();
  const screens = useResponsive();

  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deleteModal, setDeleteModal] = useState<TrashDeleteModalState>(null);
  const [confirmDeleteLoading, setConfirmDeleteLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const hasBulkActions = Boolean(onBulkRestore || onBulkPermanentDelete);

  const effectiveSelectedIds = useMemo(() => {
    const validIds = new Set(tasks.map((t) => t.id));
    return selectedIds.filter((id) => validIds.has(id));
  }, [selectedIds, tasks]);

  const selectedTasks = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedIds);
    return tasks.filter((t) => selectedSet.has(t.id));
  }, [tasks, effectiveSelectedIds]);

  const selectionSummary = useMemo(
    () => summarizeTrashSelection(selectedTasks, tasks, user, teams),
    [selectedTasks, tasks, user, teams],
  );

  function canManage(task: TrashTask): boolean {
    const team = task.teamId ? teams.find((t) => t.id === task.teamId) : null;
    return canManageTrashTask(user, task, team);
  }

  function applyBulkResult(res: BulkTaskResult | null | void, attemptedIds: number[]) {
    if (res && Array.isArray(res.succeededIds)) {
      const succeeded = new Set(res.succeededIds);
      setSelectedIds((prev) => prev.filter((id) => !succeeded.has(id)));
      return;
    }
    if (res === undefined) {
      const attempted = new Set(attemptedIds);
      setSelectedIds((prev) => prev.filter((id) => !attempted.has(id)));
    }
  }

  function toggleTaskSelection(taskId: number, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        return prev.includes(taskId) ? prev : [...prev, taskId];
      }
      return prev.filter((id) => id !== taskId);
    });
  }

  async function handleConfirmRestore(id: number) {
    try {
      setRestoringId(id);
      await onRestore(id);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleBulkRestoreConfirm() {
    if (!onBulkRestore) return;
    const ids = selectionSummary.manageableSelectedIds;
    if (ids.length === 0) return;

    try {
      setBulkLoading(true);
      const res = await onBulkRestore(ids);
      applyBulkResult(res, ids);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleConfirmPermanentDeleteModal() {
    if (!deleteModal) return;
    try {
      setConfirmDeleteLoading(true);
      if (deleteModal.kind === 'single') {
        await onPermanentDelete(deleteModal.task.id);
        setSelectedIds((prev) => prev.filter((id) => id !== deleteModal.task.id));
      } else if (deleteModal.kind === 'bulk' && onBulkPermanentDelete) {
        const res = await onBulkPermanentDelete(deleteModal.ids);
        applyBulkResult(res, deleteModal.ids);
      } else if (deleteModal.kind === 'empty' && onEmptyTrash) {
        const res = await onEmptyTrash();
        applyBulkResult(res, selectionSummary.manageableAllIds);
      }
      setDeleteModal(null);
    } finally {
      setConfirmDeleteLoading(false);
    }
  }

  const columns: TableProps<TrashTask>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 65,
    },
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      render: (title: string) => <strong>{title}</strong>,
    },
    {
      title: 'Nhóm',
      key: 'team',
      width: 150,
      render: (_, record) =>
        record.team ? (
          <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
            {record.team.name}
          </Tag>
        ) : (
          <span style={{ color: '#aaa', fontSize: 12 }}>Cá nhân</span>
        ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      width: 120,
      render: (priority?: TrashTask['priority']) => {
        const val = priority || 'MEDIUM';
        const item = TASK_PRIORITY_CONFIG[val] || { color: 'default', label: val };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      width: 130,
      render: (_, record) =>
        record.category ? (
          <Tag color={record.category.color}>{record.category.name}</Tag>
        ) : (
          <span style={{ color: '#bbb' }}>-</span>
        ),
    },
    {
      title: 'Người xóa',
      dataIndex: 'deletedBy',
      width: 150,
      render: (_, record) =>
        record.deletedBy ? (
          <Tag icon={<UserOutlined />} color="default">
            {record.deletedBy.name}
          </Tag>
        ) : (
          <span style={{ color: '#bbb' }}>-</span>
        ),
    },
    {
      title: 'Thời gian xóa',
      dataIndex: 'deletedAt',
      width: 150,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 200,
      render: (_, record) => {
        const authorized = canManage(record);

        return (
          <Space size="small">
            {authorized ? (
              <Popconfirm
                title="Khôi phục công việc"
                description={`Bạn có chắc chắn muốn khôi phục công việc "${record.title}"?`}
                onConfirm={() => handleConfirmRestore(record.id)}
                okText="Khôi phục"
                cancelText="Hủy"
              >
                <Button
                  type="link"
                  size="small"
                  icon={<UndoOutlined />}
                  loading={restoringId === record.id}
                >
                  Khôi phục
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                <Button
                  type="link"
                  size="small"
                  disabled
                  style={{ color: '#d9d9d9' }}
                  icon={<UndoOutlined />}
                >
                  Khôi phục
                </Button>
              </Tooltip>
            )}

            {authorized ? (
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setDeleteModal({ kind: 'single', task: record })}
              >
                Xóa vĩnh viễn
              </Button>
            ) : (
              <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                <Button
                  type="link"
                  size="small"
                  disabled
                  danger
                  style={{ color: '#d9d9d9' }}
                  icon={<DeleteOutlined />}
                >
                  Xóa vĩnh viễn
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const modalTitleText =
    deleteModal?.kind === 'empty'
      ? 'Xác nhận dọn sạch thùng rác'
      : deleteModal?.kind === 'bulk'
        ? 'Xác nhận xóa vĩnh viễn hàng loạt'
        : 'Xác nhận xóa vĩnh viễn';

  const modalOkText = deleteModal?.kind === 'empty' ? 'Dọn sạch thùng rác' : 'Xóa vĩnh viễn';

  const permanentDeleteModal = (
    <Modal
      open={Boolean(deleteModal)}
      title={
        <Space>
          <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
          <span>{modalTitleText}</span>
        </Space>
      }
      onOk={() => void handleConfirmPermanentDeleteModal()}
      onCancel={() => {
        if (!confirmDeleteLoading) {
          setDeleteModal(null);
        }
      }}
      okText={modalOkText}
      cancelText="Hủy"
      okButtonProps={{ danger: true, loading: confirmDeleteLoading }}
      cancelButtonProps={{ disabled: confirmDeleteLoading }}
      closable={!confirmDeleteLoading}
      maskClosable={!confirmDeleteLoading}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <Alert
          type="warning"
          showIcon
          message="Cảnh báo: Hành động không thể hoàn tác!"
          description="Subtask và các lời mời thành viên cộng tác liên quan sẽ bị xóa vĩnh viễn. Nhật ký kiểm tra (audit log) của nhóm vẫn được bảo lưu an toàn."
        />
        {deleteModal?.kind === 'single' && (
          <p style={{ margin: 0 }}>
            Bạn có chắc chắn muốn xóa vĩnh viễn công việc{' '}
            <strong>&ldquo;{deleteModal.task.title}&rdquo;</strong> không?
          </p>
        )}
        {deleteModal?.kind === 'bulk' && (
          <p style={{ margin: 0 }}>
            Bạn có chắc chắn muốn xóa vĩnh viễn{' '}
            <strong>{deleteModal.ids.length}</strong> công việc đã chọn không?
            {deleteModal.unmanageableCount > 0 &&
              ` (${deleteModal.unmanageableCount} mục không đủ quyền sẽ được bỏ qua.)`}
          </p>
        )}
        {deleteModal?.kind === 'empty' && (
          <p style={{ margin: 0 }}>
            Bạn có chắc chắn muốn xóa vĩnh viễn toàn bộ{' '}
            <strong>{deleteModal.count}</strong> công việc đủ quyền trong thùng rác hiện tại không?
          </p>
        )}
      </div>
    </Modal>
  );

  const canEmptyTrash = Boolean(onEmptyTrash && selectionSummary.manageableAllIds.length > 0);
  const showTrashActionBar =
    tasks.length > 0 && (effectiveSelectedIds.length > 0 || canEmptyTrash);

  const trashActionBar = showTrashActionBar ? (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        marginBottom: 12,
        borderRadius: 8,
        background: effectiveSelectedIds.length > 0 ? '#fff1f0' : '#fafafa',
        border: effectiveSelectedIds.length > 0 ? '1px solid #ffa39e' : '1px solid #f0f0f0',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {effectiveSelectedIds.length > 0 && hasBulkActions ? (
          <>
            <span style={{ fontWeight: 500, fontSize: 13 }}>
              Đã chọn {effectiveSelectedIds.length} mục
              {selectionSummary.unmanageableSelectedCount > 0
                ? ` (${selectionSummary.manageableSelectedIds.length} đủ quyền)`
                : ''}
            </span>
            {onBulkRestore && (
              <Popconfirm
                title="Khôi phục hàng loạt"
                description={`Khôi phục ${selectionSummary.manageableSelectedIds.length} công việc đủ quyền?`}
                onConfirm={() => void handleBulkRestoreConfirm()}
                okText="Khôi phục"
                cancelText="Hủy"
                disabled={selectionSummary.manageableSelectedIds.length === 0 || bulkLoading}
              >
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<UndoOutlined />}
                  disabled={selectionSummary.manageableSelectedIds.length === 0}
                  loading={bulkLoading}
                >
                  Khôi phục ({selectionSummary.manageableSelectedIds.length})
                </Button>
              </Popconfirm>
            )}
            {onBulkPermanentDelete && (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={selectionSummary.manageableSelectedIds.length === 0 || bulkLoading}
                onClick={() =>
                  setDeleteModal({
                    kind: 'bulk',
                    ids: selectionSummary.manageableSelectedIds,
                    unmanageableCount: selectionSummary.unmanageableSelectedCount,
                  })
                }
              >
                Xóa vĩnh viễn ({selectionSummary.manageableSelectedIds.length})
              </Button>
            )}
            <Button
              size="small"
              type="text"
              icon={<CloseOutlined />}
              onClick={() => setSelectedIds([])}
              disabled={bulkLoading}
            >
              Bỏ chọn
            </Button>
          </>
        ) : (
          <span style={{ fontSize: 13, color: '#666' }}>
            Có {selectionSummary.manageableAllIds.length} công việc đủ quyền dọn dẹp
          </span>
        )}
      </div>

      {canEmptyTrash && (
        <Button
          size="small"
          danger
          icon={<ClearOutlined />}
          disabled={bulkLoading || confirmDeleteLoading}
          onClick={() =>
            setDeleteModal({
              kind: 'empty',
              count: selectionSummary.manageableAllIds.length,
            })
          }
        >
          Dọn sạch thùng rác ({selectionSummary.manageableAllIds.length})
        </Button>
      )}
    </div>
  ) : null;

  if (screens.xs) {
    return (
      <>
        {trashActionBar}
        <List
          loading={loading}
          dataSource={tasks}
          pagination={{ pageSize: 6, align: 'center', size: 'small' }}
          locale={{ emptyText: 'Thùng rác trống' }}
          renderItem={(task) => {
            const priority = task.priority || 'MEDIUM';
            const pConfig = TASK_PRIORITY_CONFIG[priority] || { color: 'default', label: priority };
            const authorized = canManage(task);
            const checked = effectiveSelectedIds.includes(task.id);

            return (
              <Card
                size="small"
                style={{
                  marginBottom: 12,
                  borderRadius: 8,
                  borderLeft: '4px solid #ff4d4f',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {hasBulkActions && (
                      <Checkbox
                        checked={checked}
                        disabled={!authorized}
                        onChange={(e) => toggleTaskSelection(task.id, e.target.checked)}
                        aria-label={`Chọn ${task.title}`}
                      />
                    )}
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</span>
                  </div>
                  <Tag color="red">Đã xóa</Tag>
                </div>

                {task.description && (
                  <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
                    {task.description}
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {task.team ? (
                    <Tag color="cyan">{task.team.name}</Tag>
                  ) : (
                    <Tag>Cá nhân</Tag>
                  )}
                  <Tag color={pConfig.color}>{pConfig.label}</Tag>
                  {task.category && <Tag color={task.category.color}>{task.category.name}</Tag>}
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: '#888',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {task.deletedBy && (
                    <span>
                      Người xóa: <strong>{task.deletedBy.name}</strong>
                    </span>
                  )}
                  {task.deletedAt && (
                    <span>Thời gian xóa: {formatDate(task.deletedAt)}</span>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 8,
                    borderTop: '1px solid #f0f0f0',
                    paddingTop: 8,
                    marginTop: 8,
                  }}
                >
                  {authorized ? (
                    <Popconfirm
                      title="Khôi phục công việc"
                      description={`Bạn có chắc chắn muốn khôi phục công việc "${task.title}"?`}
                      onConfirm={() => handleConfirmRestore(task.id)}
                      okText="Khôi phục"
                      cancelText="Hủy"
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<UndoOutlined />}
                        loading={restoringId === task.id}
                        style={{ color: '#1677ff' }}
                      >
                        Khôi phục
                      </Button>
                    </Popconfirm>
                  ) : (
                    <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                      <Button
                        size="small"
                        type="text"
                        disabled
                        style={{ color: '#d9d9d9' }}
                        icon={<UndoOutlined />}
                      >
                        Khôi phục
                      </Button>
                    </Tooltip>
                  )}

                  {authorized ? (
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setDeleteModal({ kind: 'single', task })}
                    >
                      Xóa vĩnh viễn
                    </Button>
                  ) : (
                    <Tooltip title="Chỉ Chủ nhóm hoặc Quản trị viên mới có thể khôi phục/xóa vĩnh viễn">
                      <Button
                        size="small"
                        type="text"
                        disabled
                        danger
                        style={{ color: '#d9d9d9' }}
                        icon={<DeleteOutlined />}
                      >
                        Xóa vĩnh viễn
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </Card>
            );
          }}
        />
        {permanentDeleteModal}
      </>
    );
  }

  return (
    <>
      {trashActionBar}
      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        rowSelection={
          hasBulkActions
            ? {
                selectedRowKeys: effectiveSelectedIds,
                onChange: (keys) => setSelectedIds(keys.map(Number)),
                getCheckboxProps: (record) => ({
                  disabled: !canManage(record),
                }),
              }
            : undefined
        }
        locale={{ emptyText: 'Thùng rác trống' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1000 }}
      />
      {permanentDeleteModal}
    </>
  );
}
