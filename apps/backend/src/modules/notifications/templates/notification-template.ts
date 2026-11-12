import { TaskStatus, TeamRole } from '@prisma/client';
import type { DomainNotificationEvent } from '../types/notification-event.types.js';

export interface RenderedTemplate {
  title: string;
  content: string;
}

function statusToVi(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.TODO:
      return 'Cần làm (TODO)';
    case TaskStatus.IN_PROGRESS:
      return 'Đang làm (IN_PROGRESS)';
    case TaskStatus.DONE:
      return 'Hoàn thành (DONE)';
    default:
      return status;
  }
}

function roleToVi(role: TeamRole): string {
  switch (role) {
    case TeamRole.ADMIN:
      return 'Quản trị viên (ADMIN)';
    case TeamRole.MEMBER:
      return 'Thành viên (MEMBER)';
    default:
      return role;
  }
}

export function renderNotificationTemplate(
  event: DomainNotificationEvent,
  actorName: string,
): RenderedTemplate {
  switch (event.type) {
    case 'TASK_ASSIGNED':
      return {
        title: 'Bạn được phân công công việc mới',
        content: `${actorName} đã phân công công việc "${event.taskTitle}" cho bạn.`,
      };

    case 'TASK_UNASSIGNED':
      return {
        title: 'Hủy phân công công việc',
        content: `${actorName} đã hủy phân công của bạn tại công việc "${event.taskTitle}".`,
      };

    case 'TASK_STATUS_CHANGED':
      return {
        title: 'Cập nhật trạng thái công việc',
        content: `${actorName} đã chuyển trạng thái công việc "${event.taskTitle}" từ ${statusToVi(event.oldStatus)} sang ${statusToVi(event.newStatus)}.`,
      };

    case 'TASK_COMPLETED':
      return {
        title: 'Công việc đã hoàn thành',
        content: `${actorName} đã hoàn thành công việc "${event.taskTitle}".`,
      };

    case 'TASK_RETURNED':
      return {
        title: 'Công việc bị trả lại',
        content: `${actorName} đã trả lại công việc "${event.taskTitle}". Lý do: ${event.reason}`,
      };

    case 'TASK_DEADLINE_CHANGED':
      return {
        title: 'Thay đổi thời hạn công việc',
        content: event.newDueDate
          ? `${actorName} đã cập nhật hạn chót của công việc "${event.taskTitle}" thành ${event.newDueDate}.`
          : `${actorName} đã xóa hạn chót của công việc "${event.taskTitle}".`,
      };

    case 'TASK_DEADLINE_SOON':
      return {
        title: 'Nhắc nhở: Công việc sắp đến hạn',
        content: `Công việc "${event.taskTitle}" sẽ đến hạn vào ngày ${event.dueDate}. Hãy hoàn thành đúng tiến độ.`,
      };

    case 'TASK_OVERDUE':
      return {
        title: 'Cảnh báo: Công việc đã quá hạn',
        content: `Công việc "${event.taskTitle}" đã quá hạn vào ngày ${event.dueDate} nhưng chưa hoàn thành.`,
      };

    case 'TASK_DELETED':
      return {
        title: 'Công việc đã bị xóa',
        content: `${actorName} đã xóa công việc "${event.taskTitle}".`,
      };

    case 'TASK_MOVED_TEAM':
      return {
        title: 'Công việc được chuyển nhóm',
        content: `${actorName} đã chuyển công việc "${event.taskTitle}" sang nhóm "${event.targetTeamName}".`,
      };

    case 'TEAM_MEMBER_ADDED':
      return {
        title: 'Chào mừng bạn vào nhóm mới',
        content: `${actorName} đã thêm bạn vào nhóm "${event.teamName}" với vai trò ${roleToVi(event.role)}.`,
      };

    case 'TEAM_MEMBER_REMOVED':
      return {
        title: 'Thay đổi thành viên nhóm',
        content: event.isSelfLeave
          ? `${actorName} đã rời khỏi nhóm "${event.teamName}".`
          : `${actorName} đã xóa bạn khỏi nhóm "${event.teamName}".`,
      };

    case 'TEAM_ROLE_CHANGED':
      return {
        title: 'Thay đổi vai trò trong nhóm',
        content: `${actorName} đã thay đổi vai trò của bạn trong nhóm "${event.teamName}" thành ${roleToVi(event.newRole)}.`,
      };

    case 'TEAM_OWNERSHIP_TRANSFERRED':
      return {
        title: 'Chuyển giao quyền chủ sở hữu nhóm',
        content: `${actorName} đã chuyển quyền sở hữu nhóm "${event.teamName}" cho bạn. Bạn hiện là Chủ nhóm.`,
      };

    case 'TEAM_DELETED':
      return {
        title: 'Nhóm làm việc đã giải tán',
        content: `${actorName} đã giải tán nhóm "${event.teamName}".`,
      };

    case 'TASK_COLLABORATOR_INVITED':
      return {
        title: 'Lời mời phối hợp công việc mới',
        content: `${actorName} đã mời bạn phối hợp thực hiện công việc "${event.taskTitle}".`,
      };

    case 'TASK_COLLABORATOR_ACCEPTED':
      return {
        title: 'Lời mời phối hợp được chấp nhận',
        content: `${actorName} đã đồng ý tham gia phối hợp công việc "${event.taskTitle}".`,
      };

    case 'TASK_COLLABORATOR_DECLINED':
      return {
        title: 'Lời mời phối hợp bị từ chối',
        content: `${actorName} đã từ chối tham gia phối hợp công việc "${event.taskTitle}".`,
      };

    case 'TASK_COLLABORATOR_REMOVED':
      return {
        title: event.isSelfLeave
          ? 'Thành viên rời khỏi vai trò phối hợp'
          : 'Thu hồi quyền phối hợp công việc',
        content: event.isSelfLeave
          ? `${actorName} đã rời khỏi vai trò phối hợp trong công việc "${event.taskTitle}".`
          : `${actorName} đã thu hồi quyền phối hợp của bạn trong công việc "${event.taskTitle}".`,
      };

    case 'SUBTASK_ASSIGNED':
      if (event.isReassigned) {
        return {
          title: 'Bạn được giao lại việc con',
          content: `${actorName} đã giao lại việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}" cho bạn.`,
        };
      }
      return {
        title: 'Bạn được phân công việc con mới',
        content: `${actorName} đã phân công việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}" cho bạn.`,
      };

    case 'SUBTASK_UNASSIGNED':
      if (event.reassignedToUserId) {
        return {
          title: 'Việc con đã được chuyển giao',
          content: `${actorName} đã chuyển giao việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}" cho người khác.`,
        };
      }
      return {
        title: 'Hủy phân công việc con',
        content: `${actorName} đã hủy phân công bạn khỏi việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}".`,
      };

    case 'SUBTASK_STATUS_CHANGED':
      return {
        title: 'Cập nhật tiến độ việc con',
        content: `${actorName} đã chuyển việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}" từ ${statusToVi(event.oldStatus)} sang ${statusToVi(event.newStatus)}.`,
      };

    case 'SUBTASK_COMPLETED':
      return {
        title: 'Việc con đã hoàn thành',
        content: `${actorName} đã hoàn thành việc con "${event.subtaskTitle}" trong công việc "${event.taskTitle}".`,
      };

    case 'SUBTASK_REOPENED':
      return {
        title: 'Việc con được mở lại',
        content: `${actorName} đã mở lại việc con "${event.subtaskTitle}" (${statusToVi(event.newStatus)}) trong công việc "${event.taskTitle}".`,
      };

    default:
      return {
        title: 'Thông báo hệ thống',
        content: `Bạn có thông báo mới liên quan đến hoạt động của ${actorName}.`,
      };
  }
}
