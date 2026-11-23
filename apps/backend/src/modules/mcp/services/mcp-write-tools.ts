import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TeamRole } from '@prisma/client';
import { z } from 'zod';
import { AiActionService } from '../../ai/services/ai-action.service.js';
import { AiExtendedValidatorService } from '../../ai/services/ai-extended-validator.service.js';
import { AiTaskValidatorService } from '../../ai/services/ai-task-validator.service.js';
import { AiTeamValidatorService } from '../../ai/services/ai-team-validator.service.js';
import type { ValidatedProposalResult } from '../../ai/services/ai-validator.types.js';
import { TasksService } from '../../tasks/tasks.service.js';
import { clampLimit, formatMcpErrorMessage, serializeTaskSummary } from '../utils/mcp-serializers.js';

const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const WRITE_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const DESTRUCTIVE_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
const TASK_STATUS_VALUES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
const TEAM_ROLES = [TeamRole.ADMIN, TeamRole.MEMBER] as const;

export interface McpWriteToolDeps {
  tasksService: TasksService;
  taskValidator: AiTaskValidatorService;
  extendedValidator: AiExtendedValidatorService;
  teamValidator: AiTeamValidatorService;
  aiActionService: AiActionService;
}

function jsonSuccess(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function jsonError(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

async function runValidatedWrite(
  userId: number,
  validate: () => Promise<ValidatedProposalResult>,
  aiActionService: AiActionService,
) {
  try {
    const validation = await validate();
    if (!validation.ok) {
      return jsonError(validation.reason);
    }

    const executed = await aiActionService.executeDirectAction(
      userId,
      validation.actionType,
      validation.payload,
    );

    return jsonSuccess({
      ok: true,
      actionType: validation.actionType,
      preview: validation.preview,
      executedTaskId: executed.executedTaskId,
      task: executed.task,
    });
  } catch (error) {
    return jsonError(formatMcpErrorMessage(error));
  }
}

/**
 * Registers list_trash_tasks and the 11 safe-tier write tools onto an McpServer instance
 * when the authenticated token carries McpTokenScope.READ_WRITE.
 */
export function registerReadWriteMcpTools(
  server: McpServer,
  userId: number,
  deps: McpWriteToolDeps,
): void {
  const { tasksService, taskValidator, extendedValidator, teamValidator, aiActionService } = deps;

  server.registerTool(
    'list_trash_tasks',
    {
      title: 'List Trash Tasks',
      description:
        'Liệt kê các công việc đang nằm trong Thùng rác (đã xóa mềm, có thể khôi phục). Chỉ đọc.',
      inputSchema: {
        teamId: z.number().int().min(1).optional().describe('Lọc theo mã nhóm (không kết hợp personalOnly=true)'),
        personalOnly: z.boolean().optional().describe('Chỉ lấy công việc cá nhân trong thùng rác'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Độ ưu tiên: LOW, MEDIUM, HIGH'),
        search: z.string().max(100).optional().describe('Tìm theo tiêu đề công việc'),
        limit: z.number().int().min(1).max(100).optional().describe('Giới hạn số bản ghi (mặc định 30, tối đa 100)'),
      },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    async (args) => {
      try {
        const limit = clampLimit(args.limit, 30, 100);
        const tasks = await tasksService.findTrash(
          {
            teamId: args.teamId,
            personalOnly: args.personalOnly,
            priority: args.priority,
            search: args.search,
          },
          userId,
        );
        const sliced = tasks.slice(0, limit).map((t) => serializeTaskSummary(t));
        return jsonSuccess({
          totalMatched: tasks.length,
          returned: sliced.length,
          truncated: tasks.length > sliced.length,
          tasks: sliced,
        });
      } catch (error) {
        return jsonError(formatMcpErrorMessage(error));
      }
    },
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description: 'Tạo công việc mới (cá nhân hoặc trong nhóm) với kiểm tra RBAC đầy đủ.',
      inputSchema: {
        title: z.string().min(3).max(100).describe('Tiêu đề công việc (3..100 ký tự)'),
        description: z.string().max(1000).optional().describe('Mô tả chi tiết công việc'),
        status: z.enum(TASK_STATUS_VALUES).optional().describe('Trạng thái ban đầu: TODO, IN_PROGRESS, DONE'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Độ ưu tiên: LOW, MEDIUM, HIGH'),
        startDate: z.string().optional().describe('Ngày bắt đầu YYYY-MM-DD'),
        dueDate: z.string().optional().describe('Hạn chót YYYY-MM-DD'),
        categoryId: z.number().int().min(1).optional().describe('Mã danh mục'),
        teamId: z.number().int().min(1).optional().describe('Mã nhóm (bỏ trống nếu là việc cá nhân)'),
        assigneeId: z.number().int().min(1).optional().describe('Mã người phụ trách'),
        collaboratorIds: z.array(z.number().int().min(1)).optional().describe('Danh sách mã người phối hợp (chỉ việc nhóm)'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => taskValidator.validateCreateTaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'update_task',
    {
      title: 'Update Task',
      description: 'Cập nhật nội dung, trạng thái, hạn chót, phân công hoặc nhóm của một công việc.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc cần cập nhật'),
        title: z.string().min(3).max(100).optional().describe('Tiêu đề mới'),
        description: z.string().max(1000).nullable().optional().describe('Mô tả mới (hoặc null để xóa)'),
        status: z.enum(TASK_STATUS_VALUES).optional().describe('Trạng thái mới: TODO, IN_PROGRESS, DONE'),
        priority: z.enum(TASK_PRIORITIES).optional().describe('Độ ưu tiên mới: LOW, MEDIUM, HIGH'),
        startDate: z.string().nullable().optional().describe('Ngày bắt đầu YYYY-MM-DD hoặc null'),
        dueDate: z.string().nullable().optional().describe('Hạn chót YYYY-MM-DD hoặc null'),
        categoryId: z.number().int().min(1).nullable().optional().describe('Mã danh mục hoặc null'),
        teamId: z.number().int().min(1).nullable().optional().describe('Mã nhóm mới hoặc null'),
        assigneeId: z.number().int().min(1).nullable().optional().describe('Mã người phụ trách hoặc null'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => taskValidator.validateUpdateTaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'delete_task',
    {
      title: 'Move Task To Trash',
      description: 'Xóa mềm công việc vào Thùng rác (có thể khôi phục qua restore_task).',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc cần chuyển vào Thùng rác'),
      },
      annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateDeleteTaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'restore_task',
    {
      title: 'Restore Task From Trash',
      description: 'Khôi phục một công việc từ Thùng rác.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc trong Thùng rác cần khôi phục'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateRestoreTaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'return_task',
    {
      title: 'Return Team Task',
      description: 'Trả lại công việc nhóm từ người được phân công về cho người tạo kèm lý do.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc nhóm cần trả lại'),
        reason: z.string().min(1).max(500).describe('Lý do trả lại công việc'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateReturnTaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'create_subtask',
    {
      title: 'Create Subtask',
      description: 'Thêm đầu việc con (subtask) cho một công việc chưa hoàn thành.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc cha'),
        title: z.string().min(2).max(255).describe('Tiêu đề công việc con'),
        description: z.string().max(1000).nullable().optional().describe('Mô tả chi tiết hoặc null'),
        assigneeId: z.number().int().min(1).nullable().optional().describe('Mã người thực hiện hoặc null'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateCreateSubtaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'update_subtask',
    {
      title: 'Update Subtask',
      description: 'Cập nhật tiêu đề, mô tả, người thực hiện hoặc trạng thái công việc con.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc cha'),
        subtaskId: z.number().int().min(1).describe('Mã công việc con'),
        title: z.string().min(2).max(255).optional().describe('Tiêu đề mới'),
        description: z.string().max(1000).nullable().optional().describe('Mô tả mới hoặc null'),
        assigneeId: z.number().int().min(1).nullable().optional().describe('Mã người thực hiện hoặc null'),
        status: z.enum(TASK_STATUS_VALUES).optional().describe('Trạng thái mới: TODO, IN_PROGRESS, DONE'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateUpdateSubtaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'delete_subtask',
    {
      title: 'Delete Subtask',
      description: 'Xóa một công việc con (subtask) khỏi công việc cha.',
      inputSchema: {
        taskId: z.number().int().min(1).describe('Mã công việc cha'),
        subtaskId: z.number().int().min(1).describe('Mã công việc con cần xóa'),
      },
      annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => extendedValidator.validateDeleteSubtaskProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'add_team_member',
    {
      title: 'Add Team Member',
      description: 'Thêm thành viên mới vào nhóm làm việc qua email.',
      inputSchema: {
        teamId: z.number().int().min(1).describe('Mã nhóm làm việc'),
        email: z.string().email().describe('Email người dùng cần thêm'),
        role: z.enum(TEAM_ROLES).optional().describe('Vai trò: ADMIN hoặc MEMBER (mặc định MEMBER)'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => teamValidator.validateAddTeamMemberProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'update_team_member_role',
    {
      title: 'Update Team Member Role',
      description: 'Đổi vai trò (ADMIN hoặc MEMBER) của thành viên trong nhóm.',
      inputSchema: {
        teamId: z.number().int().min(1).describe('Mã nhóm làm việc'),
        memberId: z.number().int().min(1).describe('Mã user của thành viên trong nhóm'),
        role: z.enum(TEAM_ROLES).describe('Vai trò mới: ADMIN hoặc MEMBER'),
      },
      annotations: WRITE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => teamValidator.validateUpdateTeamMemberRoleProposal(userId, args),
        aiActionService,
      ),
  );

  server.registerTool(
    'remove_team_member',
    {
      title: 'Remove Team Member',
      description: 'Xóa thành viên khỏi nhóm làm việc (hoặc tự rời nhóm).',
      inputSchema: {
        teamId: z.number().int().min(1).describe('Mã nhóm làm việc'),
        memberId: z.number().int().min(1).describe('Mã user của thành viên cần xóa'),
      },
      annotations: DESTRUCTIVE_TOOL_ANNOTATIONS,
    },
    (args) =>
      runValidatedWrite(
        userId,
        () => teamValidator.validateRemoveTeamMemberProposal(userId, args),
        aiActionService,
      ),
  );
}
