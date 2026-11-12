import { useMemo, useState } from 'react';
import {
  Table,
  Tag,
  Button,
  Popconfirm,
  Space,
  List,
  Card,
  Tooltip,
  Checkbox,
  Dropdown,
  type MenuProps,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  EyeOutlined,
  SwapOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import type { TableProps } from 'antd';
import {
  TASK_PRIORITY_CONFIG,
  TASK_STATUS_CONFIG,
  type BulkTaskResult,
  type Task,
  type TaskStatus,
} from '../../types/task.types';
import type { Category } from '../../../categories/types/category.types';
import type { Team } from '../../../teams/types/team.types';
import { useAuth } from '../../../auth/hooks/useAuth';
import { getTaskPermissions } from '../../utils/task-permission.utils';
import { summarizeBulkSelection } from '../../utils/task-bulk.utils';
import { formatDate, getDeadlineDisplayState } from '../../../../shared/utils/date.utils';
import { useResponsive } from '../../../../shared/hooks';

interface TaskTableProps {
  tasks: Task[];
  teams?: Team[];
  loading: boolean;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onBulkDelete?: (ids: number[]) => Promise<BulkTaskResult | null | void>;
  onBulkStatusMove?: (ids: number[], status: TaskStatus) => Promise<BulkTaskResult | null | void>;
}

const BULK_STATUS_ORDER: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

export default function TaskTable({
  tasks,
  teams = [],
  loading,
  onEdit,
  onDelete,
  onBulkDelete,
  onBulkStatusMove,
}: TaskTableProps) {
  const { user } = useAuth();
  const screens = useResponsive();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const hasBulkActions = Boolean(onBulkDelete || onBulkStatusMove);

  const effectiveSelectedIds = useMemo(() => {
    const validIds = new Set(tasks.map((t) => t.id));
    return selectedIds.filter((id) => validIds.has(id));
  }, [selectedIds, tasks]);

  const selectedTasks = useMemo(() => {
    const selectedSet = new Set(effectiveSelectedIds);
    return tasks.filter((t) => selectedSet.has(t.id));
  }, [tasks, effectiveSelectedIds]);

  const selectionSummary = useMemo(
    () => summarizeBulkSelection(selectedTasks, user, teams),
    [selectedTasks, user, teams],
  );

  function getPerms(task: Task) {
    const team = task.teamId ? teams.find((t) => t.id === task.teamId) : null;
    return getTaskPermissions(user, task, team);
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

  async function handleBulkStatusChange(targetStatus: TaskStatus) {
    if (!onBulkStatusMove) return;
    const ids = selectionSummary.statusTargets[targetStatus];
    if (ids.length === 0) return;

    try {
      setBulkLoading(true);
      const res = await onBulkStatusMove(ids, targetStatus);
      applyBulkResult(res, ids);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDeleteConfirm() {
    if (!onBulkDelete) return;
    const ids = selectionSummary.deletableIds;
    if (ids.length === 0) return;

    try {
      setBulkLoading(true);
      const res = await onBulkDelete(ids);
      applyBulkResult(res, ids);
    } finally {
      setBulkLoading(false);
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

  const statusMenuItems: MenuProps['items'] = BULK_STATUS_ORDER.map((status) => {
    const config = TASK_STATUS_CONFIG[status];
    const eligibleCount = selectionSummary.statusTargets[status].length;
    return {
      key: status,
      disabled: eligibleCount === 0 || bulkLoading,
      label: `${config.label} (${eligibleCount})`,
      onClick: () => void handleBulkStatusChange(status),
    };
  });

  const totalEligibleStatusMoves = BULK_STATUS_ORDER.reduce(
    (sum, status) => sum + selectionSummary.statusTargets[status].length,
    0,
  );

  const bulkActionBar =
    hasBulkActions && effectiveSelectedIds.length > 0 ? (
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
          background: '#f0f5ff',
          border: '1px solid #adc6ff',
        }}
      >
        <span style={{ fontWeight: 500, fontSize: 13, color: '#1d39c4' }}>
          Đã chọn {selectionSummary.total} công việc
        </span>
        <Space size={8} wrap>
          {onBulkStatusMove && (
            <Dropdown menu={{ items: statusMenuItems }} trigger={['click']} disabled={totalEligibleStatusMoves === 0 || bulkLoading}>
              <Button size="small" icon={<SwapOutlined />} loading={bulkLoading}>
                Đổi trạng thái
              </Button>
            </Dropdown>
          )}
          {onBulkDelete && (
            <Popconfirm
              title="Xác nhận xoá hàng loạt"
              description={`Xoá ${selectionSummary.deletableIds.length}/${selectionSummary.total} công việc đủ quyền xoá vào thùng rác?`}
              onConfirm={() => void handleBulkDeleteConfirm()}
              okText="Xoá"
              cancelText="Huỷ"
              okButtonProps={{ danger: true, loading: bulkLoading }}
              disabled={selectionSummary.deletableIds.length === 0 || bulkLoading}
            >
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={selectionSummary.deletableIds.length === 0}
                loading={bulkLoading}
              >
                Xoá ({selectionSummary.deletableIds.length})
              </Button>
            </Popconfirm>
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
        </Space>
      </div>
    ) : null;

  const columns: TableProps<Task>['columns'] = [
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
      title: 'Nhóm / Thực hiện',
      key: 'teamAssignee',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          {record.team ? (
            <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>
              {record.team.name}
            </Tag>
          ) : (
            <span style={{ color: '#aaa', fontSize: 12 }}>Cá nhân</span>
          )}
          {record.assignee ? (
            <Tag icon={<UserOutlined />} color="purple" style={{ margin: 0, fontSize: 11 }}>
              {record.assignee.name}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      render: (desc?: string) => desc || <span style={{ color: '#aaa' }}>Chưa có mô tả</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 130,
      render: (status: Task['status']) => {
        const config = TASK_STATUS_CONFIG[status] || { color: 'default', label: status };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    {
      title: 'Độ ưu tiên',
      dataIndex: 'priority',
      width: 120,
      render: (priority?: Task['priority']) => {
        const val = priority || 'MEDIUM';
        const item = TASK_PRIORITY_CONFIG[val] || { color: 'default', label: val };
        return <Tag color={item.color}>{item.label}</Tag>;
      },
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      width: 120,
      render: (cat?: Category | null) => (
        cat ? <Tag color={cat.color}>{cat.name}</Tag> : <span style={{ color: '#bbb' }}>-</span>
      ),
    },
    {
      title: 'Bắt đầu',
      dataIndex: 'startDate',
      width: 110,
      render: (date?: string | null) => (date ? formatDate(date) : <span style={{ color: '#bbb' }}>-</span>),
    },
    {
      title: 'Hạn chót',
      dataIndex: 'dueDate',
      width: 160,
      render: (date?: string | null, record?: Task) => {
        if (!date) return <span style={{ color: '#bbb' }}>-</span>;
        const deadline = getDeadlineDisplayState(date, record?.status);
        if (!deadline.formatted) return <span style={{ color: '#bbb' }}>-</span>;
        return (
          <Space size={4} wrap>
            <span>{deadline.formatted}</span>
            {deadline.badgeText && (
              <Tag color={deadline.color} style={{ margin: 0, fontSize: 11 }}>
                {deadline.badgeText}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 160,
      render: (_, record) => {
        const perms = getPerms(record);
        const editLabel = perms.canEditContent ? 'Sửa' : perms.canChangeStatus ? 'Cập nhật' : 'Xem';

        return (
          <Space size="small">
            <Button type="link" size="small" onClick={() => onEdit(record)}>
              {editLabel}
            </Button>
            {perms.canDelete ? (
              <Popconfirm
                title="Xác nhận xoá"
                description={`Bạn có chắc chắn muốn xoá công việc "${record.title}"?`}
                onConfirm={() => onDelete(record.id)}
                okText="Xoá"
                cancelText="Huỷ"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger>
                  Xoá
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title="Chỉ người tạo hoặc quản trị viên mới có thể xóa">
                <Button type="link" size="small" disabled style={{ color: '#d9d9d9' }}>
                  Xoá
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  if (screens.xs) {
    return (
      <>
        {bulkActionBar}
        <List
          loading={loading}
          dataSource={tasks}
          pagination={{ pageSize: 6, align: 'center', size: 'small' }}
          locale={{ emptyText: 'Không có công việc nào' }}
          renderItem={(task) => {
            const statusConfig = TASK_STATUS_CONFIG[task.status] || { color: 'default', label: task.status };
            const priority = task.priority || 'MEDIUM';
            const pConfig = TASK_PRIORITY_CONFIG[priority] || { color: 'default', label: priority };
            const deadline = getDeadlineDisplayState(task.dueDate, task.status);
            const perms = getPerms(task);
            const editLabel = perms.canEditContent ? 'Sửa' : perms.canChangeStatus ? 'Cập nhật' : 'Xem';
            const checked = effectiveSelectedIds.includes(task.id);

            return (
              <Card
                size="small"
                style={{
                  marginBottom: 12,
                  borderRadius: 8,
                  borderLeft: `4px solid ${
                    task.status === 'DONE' ? '#52c41a' : task.status === 'IN_PROGRESS' ? '#1890ff' : '#fa8c16'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {hasBulkActions && (
                      <Checkbox
                        checked={checked}
                        onChange={(e) => toggleTaskSelection(task.id, e.target.checked)}
                        aria-label={`Chọn ${task.title}`}
                      />
                    )}
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{task.title}</span>
                  </div>
                  <Tag color={statusConfig.color}>{statusConfig.label}</Tag>
                </div>

              {task.description && (
                <div style={{ color: '#666', fontSize: 13, marginBottom: 8 }}>
                  {task.description}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {task.team && <Tag color="cyan">{task.team.name}</Tag>}
                {task.assignee && (
                  <Tag icon={<UserOutlined />} color="purple">
                    {task.assignee.name}
                  </Tag>
                )}
                <Tag color={pConfig.color}>{pConfig.label}</Tag>
                {task.category && <Tag color={task.category.color}>{task.category.name}</Tag>}
              </div>

              <div style={{ fontSize: 12, color: '#888', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8, alignItems: 'center' }}>
                {task.startDate && <span>Bắt đầu: {formatDate(task.startDate)}</span>}
                {task.dueDate && deadline.formatted && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>Hạn: {deadline.formatted}</span>
                    {deadline.badgeText && (
                      <Tag
                        color={deadline.color}
                        style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px' }}
                      >
                        {deadline.badgeText}
                      </Tag>
                    )}
                  </span>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  borderTop: '1px solid #f5f5f5',
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <Button
                  size="small"
                  type="text"
                  icon={perms.canEditContent ? <EditOutlined /> : <EyeOutlined />}
                  onClick={() => onEdit(task)}
                  style={{ color: '#1677ff' }}
                >
                  {editLabel}
                </Button>
                {perms.canDelete ? (
                  <Popconfirm
                    title="Xác nhận xoá"
                    description={`Bạn có chắc chắn muốn xoá công việc "${task.title}"?`}
                    onConfirm={() => onDelete(task.id)}
                    okText="Xoá"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true }}
                  >
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}>
                      Xoá
                    </Button>
                  </Popconfirm>
                ) : null}
              </div>
            </Card>
          );
        }}
        />
      </>
    );
  }

  return (
    <>
      {bulkActionBar}
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
              }
            : undefined
        }
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1000 }}
      />
    </>
  );
}
