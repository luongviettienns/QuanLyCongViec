import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Avatar,
  Button,
  Dropdown,
  Input,
  Modal,
  Popover,
  Space,
  Tag,
  Tooltip,
  Typography,
  type InputRef,
  type MenuProps,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  HolderOutlined,
  MoreOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useSortable } from '@dnd-kit/react/sortable';
import type { Subtask, TaskStatus } from '../../types/task.types';
import {
  getChecklistStatusMenuOptions,
  getNextChecklistStatusAction,
  resolveInlineEditSubmit,
  type ChecklistAssigneeOption,
} from '../../utils/checklist.utils';
import { ChecklistAssigneeMenu } from './ChecklistAssigneeMenu';

const { Text } = Typography;

export interface ChecklistItemRowProps {
  item: Subtask;
  index: number;
  totalCount: number;
  compact?: boolean;
  canManage: boolean;
  isAssignedCollaborator: boolean;
  isParentDone: boolean;
  isHighlighted?: boolean;
  eligibleAssignees: ChecklistAssigneeOption[];
  enableDrag?: boolean;
  onChangeStatus: (subtaskId: number, nextStatus: TaskStatus) => Promise<void>;
  onRename: (subtaskId: number, nextTitle: string) => Promise<boolean>;
  onAssign: (subtaskId: number, assigneeId: number | null) => Promise<void>;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onOpenFullEdit: (item: Subtask) => void;
  onDelete: (subtaskId: number) => Promise<void>;
  onHighlightMount?: (el: HTMLDivElement | null) => void;
}

export function ChecklistItemRow({
  item,
  index,
  totalCount,
  compact = false,
  canManage,
  isAssignedCollaborator,
  isParentDone,
  isHighlighted = false,
  eligibleAssignees,
  enableDrag = false,
  onChangeStatus,
  onRename,
  onAssign,
  onMoveUp,
  onMoveDown,
  onOpenFullEdit,
  onDelete,
  onHighlightMount,
}: ChecklistItemRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [assignPopoverOpen, setAssignPopoverOpen] = useState(false);
  const inputRef = useRef<InputRef | null>(null);
  const skipNextBlurRef = useRef(false);

  const { ref, handleRef, isDragging, isDropTarget } = useSortable({
    id: `subtask-${item.id}`,
    index,
    disabled: !enableDrag,
    plugins: [],
    transition: null,
  });

  const cancelInlineEdit = useCallback(() => {
    skipNextBlurRef.current = true;
    setEditingTitle(false);
    setDraftTitle(item.title);
    setTitleError(null);
  }, [item.title]);

  useEffect(() => {
    if (editingTitle) {
      skipNextBlurRef.current = false;
      inputRef.current?.focus({ cursor: 'end' });
    }
  }, [editingTitle]);

  useEffect(() => {
    if (!editingTitle) return;
    // Intercept Escape in window capture phase before @rc-component/portal's window keydown handler closes Modal/Drawer.
    const handleEscCapture = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        cancelInlineEdit();
      }
    };
    window.addEventListener('keydown', handleEscCapture, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleEscCapture, { capture: true });
    };
  }, [editingTitle, cancelInlineEdit]);

  const canEditContent = canManage && !isParentDone;
  const nextAction = getNextChecklistStatusAction(item, {
    canManage,
    isAssignedCollaborator,
    isParentDone,
  });
  const statusOptions = getChecklistStatusMenuOptions(item, {
    canManage,
    isAssignedCollaborator,
    isParentDone,
  });

  const resolvedAssignee =
    item.assignee ??
    (item.assigneeId
      ? eligibleAssignees.find((opt) => opt.value === item.assigneeId)
      : undefined);

  const startInlineEdit = () => {
    if (!canEditContent) return;
    setDraftTitle(item.title);
    setTitleError(null);
    setEditingTitle(true);
  };

  const commitInlineEdit = async (fromBlur = false) => {
    const decision = resolveInlineEditSubmit(draftTitle, item.title, fromBlur);
    if (decision.action === 'cancel') {
      skipNextBlurRef.current = false;
      setEditingTitle(false);
      setDraftTitle(item.title);
      setTitleError(null);
      return;
    }
    if (decision.action === 'error') {
      setTitleError(decision.errorMessage);
      return;
    }
    if (decision.action === 'noop') {
      skipNextBlurRef.current = true;
      setEditingTitle(false);
      setTitleError(null);
      return;
    }

    skipNextBlurRef.current = true;
    setEditingTitle(false);
    setTitleError(null);
    const saved = await onRename(item.id, decision.title);
    if (!saved) {
      setDraftTitle(item.title);
    }
  };

  const handleToggleCheck = () => {
    if (nextAction.disabled || !nextAction.nextStatus) return;
    void onChangeStatus(item.id, nextAction.nextStatus);
  };

  const handleConfirmDelete = () => {
    Modal.confirm({
      title: 'Xóa đầu việc này?',
      content: `"${item.title}" sẽ bị xóa khỏi checklist.`,
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => onDelete(item.id),
    });
  };

  const availableStatusMenuItems: MenuProps['items'] = statusOptions
    .filter((opt) => opt.status !== item.status)
    .map((opt) => ({
      key: `status-${opt.status}`,
      label: `Chuyển sang: ${opt.label}`,
      disabled: opt.disabled,
      onClick: () => {
        if (!opt.disabled) {
          void onChangeStatus(item.id, opt.status);
        }
      },
    }));

  const menuItems: MenuProps['items'] = [
    ...availableStatusMenuItems,
    ...(canEditContent
      ? [
          { type: 'divider' as const },
          {
            key: 'rename',
            icon: <EditOutlined />,
            label: 'Đổi tên',
            onClick: () => startInlineEdit(),
          },
          ...(eligibleAssignees.length > 0
            ? [
                {
                  key: 'assign',
                  icon: <UserOutlined />,
                  label: 'Người phụ trách',
                  children: [
                    {
                      key: 'assign-none',
                      label: 'Chưa phân công',
                      disabled: !item.assigneeId,
                      onClick: () => void onAssign(item.id, null),
                    },
                    { type: 'divider' as const },
                    ...eligibleAssignees.map((opt) => ({
                      key: `assign-${opt.value}`,
                      label: opt.label,
                      disabled: item.assigneeId === opt.value,
                      onClick: () => void onAssign(item.id, opt.value),
                    })),
                  ],
                },
              ]
            : []),
          {
            key: 'full-edit',
            icon: <FileTextOutlined />,
            label: 'Sửa mô tả chi tiết',
            onClick: () => onOpenFullEdit(item),
          },
          ...(totalCount > 1
            ? [
                { type: 'divider' as const },
                {
                  key: 'move-up',
                  icon: <ArrowUpOutlined />,
                  label: 'Di chuyển lên',
                  disabled: index === 0,
                  onClick: () => onMoveUp(index),
                },
                {
                  key: 'move-down',
                  icon: <ArrowDownOutlined />,
                  label: 'Di chuyển xuống',
                  disabled: index === totalCount - 1,
                  onClick: () => onMoveDown(index),
                },
              ]
            : []),
          { type: 'divider' as const },
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: 'Xóa đầu việc',
            danger: true,
            onClick: handleConfirmDelete,
          },
        ]
      : []),
  ];

  const hasMenuItems =
    canEditContent || statusOptions.some((opt) => opt.status !== item.status && !opt.disabled);

  const assigneeSelectorContent = (
    <ChecklistAssigneeMenu
      selectedAssigneeId={item.assigneeId}
      eligibleAssignees={eligibleAssignees}
      onSelect={(nextAssigneeId) => {
        setAssignPopoverOpen(false);
        if ((item.assigneeId ?? null) !== nextAssigneeId) {
          void onAssign(item.id, nextAssigneeId);
        }
      }}
    />
  );

  const completedTooltipText =
    item.status === 'DONE' && item.completedBy
      ? `Hoàn thành bởi: ${item.completedBy.name}${
          item.completedAt
            ? ` lúc ${new Date(item.completedAt).toLocaleString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}`
            : ''
        }`
      : undefined;

  const rowClasses = [
    'checklist-row',
    isHighlighted ? 'checklist-row--highlighted' : '',
    isDragging ? 'checklist-row--dragging' : '',
    isDropTarget && !isDragging ? 'checklist-row--drop-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={(node) => {
        ref(node);
        if (isHighlighted && onHighlightMount) {
          onHighlightMount(node);
        }
      }}
      className={rowClasses}
    >
      {enableDrag && (
        <button
          ref={handleRef}
          type="button"
          className="checklist-drag-handle"
          aria-label="Kéo để sắp xếp lại đầu việc"
          title="Kéo để sắp xếp"
        >
          <HolderOutlined style={{ fontSize: 13 }} />
        </button>
      )}

      <Tooltip title={nextAction.tooltip}>
        <span
          style={{
            display: 'inline-flex',
            flexShrink: 0,
            cursor: nextAction.disabled ? 'not-allowed' : undefined,
          }}
        >
          <button
            type="button"
            className="checklist-check-btn"
            aria-label={nextAction.tooltip}
            disabled={nextAction.disabled}
            onClick={handleToggleCheck}
            style={{
              pointerEvents: nextAction.disabled ? 'none' : undefined,
            }}
          >
            <span className={`checklist-check-box checklist-check-box--${nextAction.visualState}`}>
              {nextAction.visualState === 'in_progress' && <span className="checklist-check-dot" />}
              {nextAction.visualState === 'done' && <CheckOutlined />}
            </span>
          </button>
        </span>
      </Tooltip>

      <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
        {editingTitle ? (
          <div>
            <Input
              ref={inputRef}
              size="small"
              value={draftTitle}
              maxLength={255}
              status={titleError ? 'error' : undefined}
              onChange={(e) => {
                setDraftTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  void commitInlineEdit(false);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  e.nativeEvent.stopImmediatePropagation();
                  cancelInlineEdit();
                }
              }}
              onBlur={() => {
                if (skipNextBlurRef.current) {
                  skipNextBlurRef.current = false;
                  return;
                }
                void commitInlineEdit(true);
              }}
            />
            {titleError && (
              <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                {titleError}
              </Text>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text
                delete={item.status === 'DONE'}
                className={canEditContent ? 'checklist-title-editable' : undefined}
                onClick={canEditContent ? startInlineEdit : undefined}
                title={canEditContent ? 'Nhấn để đổi tên đầu việc' : undefined}
                style={{
                  fontSize: compact ? 13 : 13.5,
                  lineHeight: 1.4,
                  color: item.status === 'DONE' ? '#8c8c8c' : '#1f1f1f',
                  fontWeight: item.status === 'DONE' ? 400 : 500,
                  wordBreak: 'break-word',
                }}
              >
                {item.title}
              </Text>

              {item.status === 'IN_PROGRESS' && (
                <Tag
                  color="processing"
                  style={{
                    margin: 0,
                    fontSize: 10,
                    lineHeight: '16px',
                    padding: '0 5px',
                    borderRadius: 8,
                  }}
                >
                  Đang làm
                </Tag>
              )}

              {completedTooltipText && !compact && (
                <Tooltip title={completedTooltipText}>
                  <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12, cursor: 'help' }} />
                </Tooltip>
              )}
            </div>

            {item.description && !compact && (
              <Text
                type="secondary"
                style={{ fontSize: 12, lineHeight: 1.35, wordBreak: 'break-word' }}
              >
                {item.description}
              </Text>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          paddingTop: 1,
        }}
      >
        {resolvedAssignee ? (
          canEditContent && eligibleAssignees.length > 0 ? (
            <Popover
              open={assignPopoverOpen}
              onOpenChange={setAssignPopoverOpen}
              trigger="click"
              placement="bottomRight"
              content={assigneeSelectorContent}
            >
              <Tooltip title={`Phụ trách: ${resolvedAssignee.name} (nhấn để đổi)`}>
                <Button
                  type="text"
                  size="small"
                  className="checklist-action-btn"
                  style={{
                    padding: '0 4px',
                    height: 26,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Avatar size={20} style={{ backgroundColor: '#722ed1', fontSize: 11 }}>
                    {resolvedAssignee.name.charAt(0).toUpperCase()}
                  </Avatar>
                  {!compact && (
                    <Text
                      ellipsis
                      style={{ maxWidth: 88, fontSize: 12, color: '#595959' }}
                    >
                      {resolvedAssignee.name}
                    </Text>
                  )}
                </Button>
              </Tooltip>
            </Popover>
          ) : (
            <Tooltip title={`Phụ trách: ${resolvedAssignee.name}`}>
              <Space size={4} style={{ padding: '0 4px' }}>
                <Avatar size={20} style={{ backgroundColor: '#722ed1', fontSize: 11 }}>
                  {resolvedAssignee.name.charAt(0).toUpperCase()}
                </Avatar>
                {!compact && (
                  <Text ellipsis style={{ maxWidth: 88, fontSize: 12, color: '#595959' }}>
                    {resolvedAssignee.name}
                  </Text>
                )}
              </Space>
            </Tooltip>
          )
        ) : (
          canEditContent &&
          eligibleAssignees.length > 0 && (
            <Popover
              open={assignPopoverOpen}
              onOpenChange={setAssignPopoverOpen}
              trigger="click"
              placement="bottomRight"
              content={assigneeSelectorContent}
            >
              <Tooltip title="Giao người phụ trách">
                <Button
                  type="text"
                  size="small"
                  className="checklist-hover-only checklist-action-btn"
                  icon={<UserAddOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />}
                  aria-label="Giao người phụ trách"
                />
              </Tooltip>
            </Popover>
          )
        )}

        {hasMenuItems && (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <Button
              type="text"
              size="small"
              className="checklist-more-btn checklist-action-btn"
              icon={<MoreOutlined />}
              aria-label="Thao tác đầu việc"
            />
          </Dropdown>
        )}
      </div>
    </div>
  );
}
