import React, { type ReactNode } from 'react';
import { Typography, Tag, Space } from 'antd';
import {
  UserAddOutlined,
  UserDeleteOutlined,
  SwapOutlined,
  CrownOutlined,
  LogoutOutlined,
  HistoryOutlined,
  PlusCircleOutlined,
  SyncOutlined,
  DeleteOutlined,
  UndoOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UsergroupAddOutlined,
  UsergroupDeleteOutlined,
  RollbackOutlined,
  ExportOutlined,
  ImportOutlined,
  CalendarOutlined,
  FlagOutlined,
  EditOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import type { TeamActivityLog, TeamActivityAction } from '../types/team.types.ts';

const { Text } = Typography;

export interface ActivityRenderResult {
  icon: ReactNode;
  titleNode: ReactNode;
  detailNode?: ReactNode;
}

export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}, ${day}/${month}/${year}`;
  } catch {
    return isoString;
  }
}

export function renderStatusTag(status?: string | null): ReactNode {
  if (!status) return null;
  switch (status) {
    case 'TODO':
      return React.createElement(
        Tag,
        { color: 'default', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } },
        'Cần làm',
      );
    case 'IN_PROGRESS':
      return React.createElement(
        Tag,
        { color: 'processing', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } },
        'Đang làm',
      );
    case 'DONE':
      return React.createElement(
        Tag,
        { color: 'success', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } },
        'Hoàn thành',
      );
    default:
      return React.createElement(
        Tag,
        { variant: 'filled', style: { margin: '0 4px', fontSize: 11 } },
        status,
      );
  }
}

export function renderPriorityTag(priority?: string | null): ReactNode {
  if (!priority) return null;
  switch (priority) {
    case 'LOW':
      return React.createElement(Tag, { color: 'blue', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, 'Thấp');
    case 'MEDIUM':
      return React.createElement(Tag, { color: 'cyan', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, 'Trung bình');
    case 'HIGH':
      return React.createElement(Tag, { color: 'warning', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, 'Cao');
    case 'URGENT':
      return React.createElement(Tag, { color: 'error', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, 'Khẩn cấp');
    default:
      return React.createElement(Tag, { variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, priority);
  }
}

function getActorAndTargetNames(log: TeamActivityLog) {
  const actorName = log.actor?.name || 'Hệ thống';
  const targetName = log.targetUser?.name || 'Thành viên';
  const taskTitle = log.metadata?.taskTitle || 'Công việc';
  const subtaskTitle = log.metadata?.subtaskTitle || 'Việc con';
  return { actorName, targetName, taskTitle, subtaskTitle };
}

function getMetadataSummary(log: TeamActivityLog): string | null {
  const metadataParts: string[] = [];
  if (log.metadata?.unassignedTaskCount && log.metadata.unassignedTaskCount > 0) {
    metadataParts.push(`Hủy phân công ${log.metadata.unassignedTaskCount} Task`);
  }
  if (log.metadata?.affectedSubtaskCount && log.metadata.affectedSubtaskCount > 0) {
    metadataParts.push(`${log.metadata.affectedSubtaskCount} Subtask`);
  }
  if (log.metadata?.revokedCollaboratorCount && log.metadata.revokedCollaboratorCount > 0) {
    metadataParts.push(`Thu hồi ${log.metadata.revokedCollaboratorCount} người phối hợp`);
  }
  return metadataParts.length > 0 ? metadataParts.join(' và ') : null;
}

export const ACTION_RENDERERS: Record<TeamActivityAction, (log: TeamActivityLog) => ActivityRenderResult> = {
  // 1. Task Lifecycle
  TASK_CREATED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(PlusCircleOutlined, { style: { color: '#52c41a', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã tạo công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_STATUS_CHANGED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(SyncOutlined, { style: { color: '#1677ff', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chuyển trạng thái ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' từ ',
        renderStatusTag(log.metadata?.oldStatus as string),
        ' → ',
        renderStatusTag(log.metadata?.newStatus as string),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_ASSIGNED: (log) => {
    const { actorName, targetName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UserAddOutlined, { style: { color: '#722ed1', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã phân công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' cho ',
        React.createElement(Text, { strong: true }, targetName),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_UNASSIGNED: (log) => {
    const { actorName, targetName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UserDeleteOutlined, { style: { color: '#fa8c16', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã gỡ phân công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' khỏi ',
        React.createElement(Text, { strong: true }, targetName),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_RETURNED: (log) => {
    const { actorName, targetName, taskTitle } = getActorAndTargetNames(log);
    const reason = log.metadata?.reason ? ` (Lý do: ${log.metadata.reason})` : '';
    return {
      icon: React.createElement(RollbackOutlined, { style: { color: '#fa8c16', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã trả lại công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' cho ',
        React.createElement(Text, { strong: true }, targetName),
        reason,
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_MOVED_OUT: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    const revoked = log.metadata?.revokedCollaboratorCount
      ? ` (Thu hồi ${log.metadata.revokedCollaboratorCount} người phối hợp)`
      : '';
    return {
      icon: React.createElement(ExportOutlined, { style: { color: '#fa8c16', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chuyển công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' ra khỏi nhóm',
        revoked,
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_MOVED_IN: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(ImportOutlined, { style: { color: '#52c41a', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chuyển công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' vào nhóm',
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_DEADLINE_CHANGED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    const oldDate = log.metadata?.oldDueDate ? String(log.metadata.oldDueDate) : 'Chưa có hạn';
    const newDate = log.metadata?.newDueDate ? String(log.metadata.newDueDate) : 'Đã xóa hạn';
    return {
      icon: React.createElement(CalendarOutlined, { style: { color: '#722ed1', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã đổi hạn chót ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' từ ',
        React.createElement(Tag, { variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, oldDate),
        ' → ',
        React.createElement(Tag, { color: 'purple', variant: 'filled', style: { margin: '0 4px', fontSize: 11 } }, newDate),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_PRIORITY_CHANGED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(FlagOutlined, { style: { color: '#eb2f96', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã đổi độ ưu tiên ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' từ ',
        renderPriorityTag(log.metadata?.oldPriority as string),
        ' → ',
        renderPriorityTag(log.metadata?.newPriority as string),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_UPDATED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    const changed = Array.isArray(log.metadata?.changedFields)
      ? log.metadata.changedFields.join(', ')
      : 'thông tin';
    return {
      icon: React.createElement(EditOutlined, { style: { color: '#1890ff', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã cập nhật ',
        changed,
        ' của công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_DELETED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(DeleteOutlined, { style: { color: '#ff4d4f', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chuyển công việc ',
        React.createElement(Text, { strong: true, delete: true, style: { color: '#8c8c8c' } }, `"${taskTitle}"`),
        ' vào thùng rác',
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  TASK_RESTORED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UndoOutlined, { style: { color: '#13c2c2', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã khôi phục công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
        ' từ thùng rác',
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  // 2. Subtasks
  SUBTASK_COMPLETED: (log) => {
    const { actorName, taskTitle, subtaskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(CheckCircleOutlined, { style: { color: '#52c41a', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã hoàn thành việc con ',
        React.createElement(Text, { strong: true }, `"${subtaskTitle}"`),
        ' trong công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  SUBTASK_REOPENED: (log) => {
    const { actorName, taskTitle, subtaskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(ClockCircleOutlined, { style: { color: '#faad14', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã mở lại việc con ',
        React.createElement(Text, { strong: true }, `"${subtaskTitle}"`),
        ' trong công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  // 3. Collaborators
  COLLABORATOR_INVITED: (log) => {
    const { actorName, targetName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UsergroupAddOutlined, { style: { color: '#1890ff', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã mời ',
        React.createElement(Text, { strong: true }, targetName),
        ' phối hợp trong công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  COLLABORATOR_ADDED: (log) => {
    // Backwards-compatible fallback for existing records
    return ACTION_RENDERERS.COLLABORATOR_INVITED(log);
  },

  COLLABORATOR_ACCEPTED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(CheckCircleOutlined, { style: { color: '#52c41a', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chấp nhận lời mời phối hợp trong công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  COLLABORATOR_DECLINED: (log) => {
    const { actorName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(CloseCircleOutlined, { style: { color: '#ff4d4f', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã từ chối lời mời phối hợp trong công việc ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  COLLABORATOR_REMOVED: (log) => {
    const { actorName, targetName, taskTitle } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UsergroupDeleteOutlined, { style: { color: '#ff4d4f', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã gỡ ',
        React.createElement(Text, { strong: true }, targetName),
        ' khỏi việc phối hợp ',
        React.createElement(Text, { strong: true, style: { color: '#1677ff' } }, `"${taskTitle}"`),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },

  // 4. Team Members
  ADD_MEMBER: (log) => {
    const { actorName, targetName } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(UserAddOutlined, { style: { color: '#52c41a', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã thêm ',
        React.createElement(Text, { strong: true }, targetName),
        ' vào nhóm',
      ),
      detailNode: React.createElement(
        Space,
        { size: 'small' },
        React.createElement(
          'span',
          null,
          'Vai trò: ',
          React.createElement(
            Tag,
            { color: log.newRole === 'ADMIN' ? 'blue' : 'green', variant: 'filled' },
            log.newRole ?? 'MEMBER',
          ),
        ),
        React.createElement('span', null, '·'),
        React.createElement('span', null, formatDate(log.createdAt)),
      ),
    };
  },

  CHANGE_ROLE: (log) => {
    const { actorName, targetName } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(SwapOutlined, { style: { color: '#fa8c16', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã cấp quyền ',
        React.createElement(
          Tag,
          { color: log.newRole === 'ADMIN' ? 'blue' : 'green', variant: 'filled' },
          log.newRole,
        ),
        ' cho ',
        React.createElement(Text, { strong: true }, targetName),
      ),
      detailNode: React.createElement(
        Space,
        { size: 'small' },
        React.createElement('span', null, `${log.oldRole ?? 'MEMBER'} → ${log.newRole ?? 'ADMIN'}`),
        React.createElement('span', null, '·'),
        React.createElement('span', null, formatDate(log.createdAt)),
      ),
    };
  },

  REMOVE_MEMBER: (log) => {
    const { actorName, targetName } = getActorAndTargetNames(log);
    const metadataDesc = getMetadataSummary(log);
    return {
      icon: React.createElement(UserDeleteOutlined, { style: { color: '#ff4d4f', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã xóa ',
        React.createElement(Text, { strong: true }, targetName),
        ' khỏi nhóm',
      ),
      detailNode: React.createElement(
        Space,
        { size: 'small' },
        metadataDesc ? React.createElement('span', null, `${metadataDesc} ·`) : null,
        React.createElement('span', null, formatDate(log.createdAt)),
      ),
    };
  },

  LEAVE_TEAM: (log) => {
    const { targetName } = getActorAndTargetNames(log);
    const metadataDesc = getMetadataSummary(log);
    return {
      icon: React.createElement(LogoutOutlined, { style: { color: '#8c8c8c', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, targetName),
        ' đã tự rời khỏi nhóm',
      ),
      detailNode: React.createElement(
        Space,
        { size: 'small' },
        metadataDesc ? React.createElement('span', null, `${metadataDesc} ·`) : null,
        React.createElement('span', null, formatDate(log.createdAt)),
      ),
    };
  },

  TRANSFER_OWNER: (log) => {
    const { actorName, targetName } = getActorAndTargetNames(log);
    return {
      icon: React.createElement(CrownOutlined, { style: { color: '#faad14', fontSize: 18 } }),
      titleNode: React.createElement(
        'span',
        null,
        React.createElement(Text, { strong: true }, actorName),
        ' đã chuyển quyền Owner cho ',
        React.createElement(Text, { strong: true }, targetName),
      ),
      detailNode: React.createElement('span', null, formatDate(log.createdAt)),
    };
  },
} satisfies Record<TeamActivityAction, (log: TeamActivityLog) => ActivityRenderResult>;

export function renderActivityItem(log: TeamActivityLog): ActivityRenderResult {
  const renderer = ACTION_RENDERERS[log.action];
  if (renderer) {
    return renderer(log);
  }
  const { actorName } = getActorAndTargetNames(log);
  return {
    icon: React.createElement(HistoryOutlined, { style: { color: '#8c8c8c', fontSize: 18 } }),
    titleNode: React.createElement(
      'span',
      null,
      React.createElement(Text, { strong: true }, actorName),
      ` đã thực hiện thao tác: ${log.action}`,
    ),
    detailNode: React.createElement('span', null, formatDate(log.createdAt)),
  };
}
