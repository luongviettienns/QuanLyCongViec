import { Alert, Button, Space, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  PlusCircleOutlined,
  RollbackOutlined,
  SyncOutlined,
  UndoOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import type {
  AiActionType,
  AiPendingActionItem,
  AiPendingActionStatus,
} from '../types/ai.types';
import {
  buildAiPreviewFields,
  formatAiActionTitle,
  isAiActionPending,
  isDangerAiAction,
  isTaskLinkedAiAction,
} from '../utils/ai-chat.utils';

const { Text } = Typography;

export interface AiPendingActionCardProps {
  action: AiPendingActionItem;
  busyAction?: 'confirm' | 'cancel' | null;
  onConfirm: (actionId: number) => void | Promise<void>;
  onCancel: (actionId: number) => void | Promise<void>;
  onOpenTask?: (taskId: number) => void;
}

function renderActionIcon(actionType: AiActionType) {
  switch (actionType) {
    case 'CREATE_TASK':
    case 'CREATE_SUBTASK':
      return <PlusCircleOutlined style={{ color: '#1677ff' }} />;
    case 'DELETE_TASK':
    case 'DELETE_SUBTASK':
      return <DeleteOutlined style={{ color: '#ff4d4f' }} />;
    case 'REMOVE_TEAM_MEMBER':
      return <UserDeleteOutlined style={{ color: '#ff4d4f' }} />;
    case 'RESTORE_TASK':
      return <UndoOutlined style={{ color: '#1677ff' }} />;
    case 'RETURN_TASK':
      return <RollbackOutlined style={{ color: '#fa8c16' }} />;
    case 'ADD_TEAM_MEMBER':
      return <UserAddOutlined style={{ color: '#1677ff' }} />;
    case 'UPDATE_TEAM_MEMBER_ROLE':
      return <UserSwitchOutlined style={{ color: '#1677ff' }} />;
    case 'UPDATE_TASK':
    case 'UPDATE_SUBTASK':
      return <EditOutlined style={{ color: '#1677ff' }} />;
  }
}

function getDisplayStatus(action: AiPendingActionItem): {
  label: string;
  color: string;
  effectiveStatus: AiPendingActionStatus;
} {
  if (action.status === 'PENDING' && !isAiActionPending(action)) {
    return { label: 'Đã hết hạn', color: 'warning', effectiveStatus: 'EXPIRED' };
  }

  switch (action.status) {
    case 'PENDING':
      return { label: 'Chờ xác nhận', color: 'processing', effectiveStatus: 'PENDING' };
    case 'EXECUTING':
      return { label: 'Đang thực thi', color: 'processing', effectiveStatus: 'EXECUTING' };
    case 'EXECUTED':
      return { label: 'Đã thực thi', color: 'success', effectiveStatus: 'EXECUTED' };
    case 'CANCELLED':
      return { label: 'Đã hủy', color: 'default', effectiveStatus: 'CANCELLED' };
    case 'EXPIRED':
      return { label: 'Đã hết hạn', color: 'warning', effectiveStatus: 'EXPIRED' };
    case 'FAILED':
      return { label: 'Thất bại', color: 'error', effectiveStatus: 'FAILED' };
  }
}

export function AiPendingActionCard({
  action,
  busyAction = null,
  onConfirm,
  onCancel,
  onOpenTask,
}: AiPendingActionCardProps) {
  const canAct = isAiActionPending(action);
  const isDanger = isDangerAiAction(action.actionType);
  const statusMeta = getDisplayStatus(action);
  const fields = buildAiPreviewFields(action.preview);
  const title = formatAiActionTitle(action);
  const isBusy = Boolean(busyAction);

  const cardClassName = [
    'ai-action-card',
    canAct && isDanger ? 'ai-action-card--danger' : '',
    canAct ? '' : 'ai-action-card--resolved',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cardClassName} data-testid={`ai-action-card-${action.id}`}>
      <div className="ai-action-card-header">
        <span className="ai-action-card-title">
          {renderActionIcon(action.actionType)}
          <span>{title}</span>
        </span>

        <Tag
          color={statusMeta.color}
          icon={
            statusMeta.effectiveStatus === 'EXECUTED' ? (
              <CheckCircleOutlined />
            ) : statusMeta.effectiveStatus === 'FAILED' ? (
              <CloseCircleOutlined />
            ) : statusMeta.effectiveStatus === 'EXPIRED' ? (
              <ExclamationCircleOutlined />
            ) : statusMeta.effectiveStatus === 'EXECUTING' ? (
              <SyncOutlined spin />
            ) : statusMeta.effectiveStatus === 'PENDING' ? (
              <ClockCircleOutlined />
            ) : undefined
          }
          style={{ margin: 0 }}
        >
          {statusMeta.label}
        </Tag>
      </div>

      {isDanger && canAct && (
        <div className="ai-action-danger-row" data-testid={`ai-action-danger-${action.id}`}>
          <Tag color="error" icon={<ExclamationCircleOutlined />} style={{ margin: 0 }}>
            Thao tác nhạy cảm
          </Tag>
        </div>
      )}

      {action.preview.kind === 'UPDATE_TASK' && action.preview.taskTitle && (
        <div className="ai-action-card-subtitle">{action.preview.taskTitle}</div>
      )}

      {fields.length > 0 && (
        <div className="ai-action-fields">
          {fields.map((field, index) => (
            <div className="ai-action-field-row" key={`${field.label}-${index}`}>
              <span className="ai-action-field-label">{field.label}:</span>
              {field.value !== undefined ? (
                <span className="ai-action-field-value">{field.value}</span>
              ) : (
                <span className="ai-action-field-value">
                  <span className="ai-diff-before">{field.before || 'Trống'}</span>
                  <span className="ai-diff-arrow">→</span>
                  <span className="ai-diff-after">{field.after || 'Trống'}</span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {action.status === 'FAILED' && action.errorMessage && (
        <Alert type="error" showIcon title={action.errorMessage} />
      )}

      {action.status === 'EXECUTED' && (
        <div className="ai-action-executed-row">
          <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>
            {isTaskLinkedAiAction(action.actionType) && action.executedTaskId
              ? `Đã áp dụng (Công việc #${action.executedTaskId})`
              : 'Đã áp dụng'}
          </Tag>
          {isTaskLinkedAiAction(action.actionType) &&
            action.actionType !== 'DELETE_TASK' &&
            onOpenTask &&
            action.executedTaskId !== null && (
              <Button
                size="small"
                type="link"
                icon={<LinkOutlined />}
                onClick={() => onOpenTask(action.executedTaskId!)}
                style={{ padding: '0 4px' }}
              >
                Mở công việc
              </Button>
            )}
        </div>
      )}

      {canAct && (
        <div className="ai-action-card-footer">
          <Space size={8} wrap>
            <Button
              size="small"
              icon={<CloseOutlined />}
              loading={busyAction === 'cancel'}
              disabled={isBusy}
              onClick={() => void onCancel(action.id)}
              data-testid={`ai-action-cancel-${action.id}`}
            >
              Hủy
            </Button>
            <Button
              size="small"
              type="primary"
              danger={isDanger}
              icon={<CheckOutlined />}
              loading={busyAction === 'confirm'}
              disabled={isBusy}
              onClick={() => void onConfirm(action.id)}
              data-testid={`ai-action-confirm-${action.id}`}
            >
              Xác nhận
            </Button>
          </Space>
        </div>
      )}

      {statusMeta.effectiveStatus === 'EXPIRED' && (
        <Text type="secondary" style={{ fontSize: 11.5 }}>
          Đề xuất này đã quá hạn xác nhận. Hãy yêu cầu Trợ lý AI tạo đề xuất mới nếu bạn vẫn muốn thực hiện.
        </Text>
      )}
    </div>
  );
}
