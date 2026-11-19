import { Injectable } from '@nestjs/common';
import {
  AiActionType,
  AiPendingActionStatus,
  Prisma,
  TaskPriority,
  type AiPendingAction,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service.js';
import { CategoriesService } from '../../categories/categories.service.js';
import {
  clampLimit,
  formatMcpErrorMessage,
  serializeNotificationItem,
  serializeTaskDetail,
  serializeTaskSummary,
  serializeTeamDetail,
  serializeTeamSummary,
} from '../../mcp/utils/mcp-serializers.js';
import { NotificationsService } from '../../notifications/services/notifications.service.js';
import {
  DEADLINE_FILTERS,
  TASK_SCOPES,
  TASK_SORT_OPTIONS,
  TASK_STATUS_FILTERS,
  type DeadlineFilter,
  type TaskScope,
  type TaskSortBy,
  type TaskStatusFilter,
} from '../../tasks/dto/filter-tasks.dto.js';
import { TasksService } from '../../tasks/tasks.service.js';
import { TeamsService } from '../../teams/teams.service.js';
import type { AiToolDefinition } from '../providers/ai-provider.interface.js';
import { AiTaskValidatorService } from './ai-task-validator.service.js';

export interface AiToolExecutionContext {
  userId: number;
  conversationId: number;
}

export type AiPendingActionRecord = AiPendingAction;

export interface AiToolExecutionResult {
  ok: boolean;
  data: Record<string, unknown>;
  pendingAction?: AiPendingActionRecord;
  summary: string;
}

const PENDING_ACTION_TTL_MS = 10 * 60 * 1000;
const TASK_PRIORITIES = [TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH] as const;
const TASK_STATS_SCOPES = [
  'all',
  'my_work',
  'assigned_to_me',
  'collaborating',
  'subtasks_assigned_to_me',
  'created_by_me',
] as const;
const CATEGORY_SCOPES = ['all', 'personal', 'team'] as const;
const NOTIFICATION_FILTERS = ['all', 'unread', 'important'] as const;

function readOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  if (typeof value !== 'string') return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function readOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function readOptionalString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function failTool(reason: string, code?: string): AiToolExecutionResult {
  return {
    ok: false,
    data: {
      ok: false,
      ...(code ? { code } : {}),
      reason,
    },
    summary: reason,
  };
}

@Injectable()
export class AiToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly teamsService: TeamsService,
    private readonly categoriesService: CategoriesService,
    private readonly notificationsService: NotificationsService,
    private readonly validator: AiTaskValidatorService,
  ) {}

  getToolDefinitions(): AiToolDefinition[] {
    return [
      {
        type: 'function',
        function: {
          name: 'get_my_tasks',
          description:
            'Lấy danh sách "Việc của tôi" (công việc cá nhân, việc được phân công chính, việc phối hợp và việc có đầu việc con được giao cho người dùng hiện tại). Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: [...TASK_STATUS_FILTERS],
                description: 'Lọc trạng thái: TODO, IN_PROGRESS, DONE hoặc INCOMPLETE',
              },
              deadlineFilter: {
                type: 'string',
                enum: [...DEADLINE_FILTERS],
                description: 'Lọc hạn chót: overdue, today, due_soon, no_due_date',
              },
              priority: {
                type: 'string',
                enum: [...TASK_PRIORITIES],
                description: 'Lọc độ ưu tiên: LOW, MEDIUM, HIGH',
              },
              search: {
                type: 'string',
                description: 'Tìm theo tiêu đề công việc (tối đa 100 ký tự)',
              },
              sortBy: {
                type: 'string',
                enum: [...TASK_SORT_OPTIONS],
                description: 'Sắp xếp: default, due_date_asc, due_date_desc, priority_desc',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Số lượng tối đa trả về (mặc định 30, tối đa 100)',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_tasks',
          description:
            'Liệt kê công việc theo bộ lọc linh hoạt (phạm vi, nhóm/cá nhân, trạng thái, ưu tiên, danh mục, người phụ trách, hạn chót, từ khóa). Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: [...TASK_SCOPES],
                description:
                  'Phạm vi: all, my_work, assigned_to_me, collaborating, pending_invites, subtasks_assigned_to_me, created_by_me',
              },
              teamId: {
                type: 'integer',
                minimum: 1,
                description: 'Lọc theo mã nhóm (không kết hợp cùng personalOnly=true)',
              },
              personalOnly: {
                type: 'boolean',
                description: 'Chỉ lấy công việc cá nhân không thuộc nhóm nào',
              },
              status: {
                type: 'string',
                enum: [...TASK_STATUS_FILTERS],
                description: 'Trạng thái: TODO, IN_PROGRESS, DONE, INCOMPLETE',
              },
              priority: {
                type: 'string',
                enum: [...TASK_PRIORITIES],
                description: 'Độ ưu tiên: LOW, MEDIUM, HIGH',
              },
              categoryId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã danh mục',
              },
              assigneeId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã người phụ trách',
              },
              deadlineFilter: {
                type: 'string',
                enum: [...DEADLINE_FILTERS],
                description: 'Hạn chót: overdue, today, due_soon, no_due_date',
              },
              search: {
                type: 'string',
                description: 'Tìm theo tiêu đề công việc (tối đa 100 ký tự)',
              },
              sortBy: {
                type: 'string',
                enum: [...TASK_SORT_OPTIONS],
                description: 'Cách sắp xếp',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 100,
                description: 'Giới hạn số bản ghi (mặc định 30, tối đa 100)',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_task_detail',
          description:
            'Xem chi tiết đầy đủ của 1 công việc theo ID, bao gồm mô tả, danh sách đầu việc con, người phụ trách và người phối hợp. Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã công việc cần xem chi tiết',
              },
            },
            required: ['taskId'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_task_stats',
          description:
            'Lấy thống kê tổng quan công việc (tổng số, cần làm, đang làm, hoàn thành, quá hạn, hôm nay, sắp đến hạn, tỷ lệ hoàn thành). Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              teamId: {
                type: 'integer',
                minimum: 1,
                description: 'Lọc thống kê theo mã nhóm cụ thể',
              },
              scope: {
                type: 'string',
                enum: [...TASK_STATS_SCOPES],
                description:
                  'Phạm vi thống kê: all, my_work, assigned_to_me, collaborating, subtasks_assigned_to_me, created_by_me',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_teams',
          description:
            'Lấy danh sách các nhóm làm việc mà người dùng đang sở hữu hoặc là thành viên. Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_team_detail',
          description:
            'Xem chi tiết 1 nhóm làm việc theo ID, bao gồm vai trò của bạn và danh sách thành viên trong nhóm. Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              teamId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã nhóm làm việc',
              },
            },
            required: ['teamId'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_categories',
          description:
            'Lấy danh sách danh mục công việc (cá nhân, tất cả hoặc thuộc 1 nhóm cụ thể). Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              scope: {
                type: 'string',
                enum: [...CATEGORY_SCOPES],
                description: 'Phạm vi danh mục: all, personal hoặc team',
              },
              teamId: {
                type: 'integer',
                minimum: 1,
                description: 'Lọc danh mục của 1 nhóm cụ thể',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_notifications',
          description:
            'Lấy danh sách thông báo của người dùng (tất cả, chưa đọc hoặc quan trọng) kèm số lượng chưa đọc. Chỉ đọc.',
          parameters: {
            type: 'object',
            properties: {
              filter: {
                type: 'string',
                enum: [...NOTIFICATION_FILTERS],
                description: 'Bộ lọc thông báo: all, unread, important',
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 50,
                description: 'Số lượng tối đa (mặc định 20, tối đa 50)',
              },
              cursor: {
                type: 'integer',
                minimum: 1,
                description: 'Con trỏ phân trang ID thông báo',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_task',
          description:
            'Tạo ĐỀ XUẤT (proposal) tạo công việc mới và trả về thẻ xác nhận cho người dùng. Tool này CHỈ kiểm tra quyền và tạo hành động chờ xác nhận, KHÔNG lưu trực tiếp vào cơ sở dữ liệu cho đến khi người dùng bấm "Xác nhận".',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Tiêu đề công việc (từ 3 đến 100 ký tự)',
              },
              description: {
                type: 'string',
                description: 'Mô tả chi tiết công việc (tối đa 1000 ký tự)',
              },
              status: {
                type: 'string',
                enum: ['TODO', 'IN_PROGRESS', 'DONE'],
                description: 'Trạng thái ban đầu (mặc định TODO)',
              },
              priority: {
                type: 'string',
                enum: [...TASK_PRIORITIES],
                description: 'Độ ưu tiên: LOW, MEDIUM, HIGH (mặc định MEDIUM)',
              },
              startDate: {
                type: 'string',
                description: 'Ngày bắt đầu (định dạng YYYY-MM-DD)',
              },
              dueDate: {
                type: 'string',
                description: 'Hạn chót (định dạng YYYY-MM-DD)',
              },
              categoryId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã danh mục (phải tra cứu qua list_categories trước)',
              },
              teamId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã nhóm (bỏ trống nếu là công việc cá nhân)',
              },
              assigneeId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã người được phân công (phải tra cứu qua get_team_detail nếu là việc nhóm)',
              },
              collaboratorIds: {
                type: 'array',
                items: { type: 'integer', minimum: 1 },
                description: 'Danh sách mã thành viên phối hợp (chỉ dùng cho công việc nhóm)',
              },
            },
            required: ['title'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_task',
          description:
            'Tạo ĐỀ XUẤT (proposal) cập nhật một công việc hiện có và trả về thẻ xem trước thay đổi để người dùng bấm "Xác nhận". Tool này CHỈ kiểm tra quyền và tạo hành động chờ xác nhận, KHÔNG lưu trực tiếp vào cơ sở dữ liệu.',
          parameters: {
            type: 'object',
            properties: {
              taskId: {
                type: 'integer',
                minimum: 1,
                description: 'Mã công việc cần cập nhật',
              },
              title: {
                type: 'string',
                description: 'Tiêu đề mới (từ 3 đến 100 ký tự)',
              },
              description: {
                type: ['string', 'null'],
                description: 'Mô tả mới (hoặc null để xóa mô tả)',
              },
              status: {
                type: 'string',
                enum: ['TODO', 'IN_PROGRESS', 'DONE'],
                description: 'Trạng thái mới',
              },
              priority: {
                type: 'string',
                enum: [...TASK_PRIORITIES],
                description: 'Độ ưu tiên mới: LOW, MEDIUM, HIGH',
              },
              startDate: {
                type: ['string', 'null'],
                description: 'Ngày bắt đầu mới YYYY-MM-DD (hoặc null để xóa)',
              },
              dueDate: {
                type: ['string', 'null'],
                description: 'Hạn chót mới YYYY-MM-DD (hoặc null để xóa)',
              },
              categoryId: {
                type: ['integer', 'null'],
                minimum: 1,
                description: 'Mã danh mục mới (hoặc null để hủy gán)',
              },
              teamId: {
                type: ['integer', 'null'],
                minimum: 1,
                description: 'Mã nhóm mới (hoặc null để chuyển về cá nhân)',
              },
              assigneeId: {
                type: ['integer', 'null'],
                minimum: 1,
                description: 'Mã người phụ trách mới (hoặc null để hủy phân công)',
              },
            },
            required: ['taskId'],
            additionalProperties: false,
          },
        },
      },
    ];
  }

  async executeTool(
    ctx: AiToolExecutionContext,
    name: string,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    try {
      switch (name) {
        case 'get_my_tasks':
          return await this.handleGetMyTasks(ctx.userId, rawArgs);
        case 'list_tasks':
          return await this.handleListTasks(ctx.userId, rawArgs);
        case 'get_task_detail':
          return await this.handleGetTaskDetail(ctx.userId, rawArgs);
        case 'get_task_stats':
          return await this.handleGetTaskStats(ctx.userId, rawArgs);
        case 'list_teams':
          return await this.handleListTeams(ctx.userId);
        case 'get_team_detail':
          return await this.handleGetTeamDetail(ctx.userId, rawArgs);
        case 'list_categories':
          return await this.handleListCategories(ctx.userId, rawArgs);
        case 'list_notifications':
          return await this.handleListNotifications(ctx.userId, rawArgs);
        case 'create_task':
          return await this.handleWriteProposal(ctx, 'create_task', rawArgs);
        case 'update_task':
          return await this.handleWriteProposal(ctx, 'update_task', rawArgs);
        default:
          return failTool(`Công cụ '${name}' không tồn tại`);
      }
    } catch (error) {
      return failTool(formatMcpErrorMessage(error));
    }
  }

  private async handleGetMyTasks(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const limit = clampLimit(
      typeof rawArgs.limit === 'number' ? rawArgs.limit : undefined,
      30,
      100,
    );
    const tasks = await this.tasksService.findAll(
      {
        scope: 'my_work',
        status: readOptionalEnum<TaskStatusFilter>(rawArgs.status, TASK_STATUS_FILTERS),
        deadlineFilter: readOptionalEnum<DeadlineFilter>(rawArgs.deadlineFilter, DEADLINE_FILTERS),
        priority: readOptionalEnum<TaskPriority>(rawArgs.priority, TASK_PRIORITIES),
        search: readOptionalString(rawArgs.search, 100),
        sortBy: readOptionalEnum<TaskSortBy>(rawArgs.sortBy, TASK_SORT_OPTIONS),
      },
      userId,
    );
    const sliced = tasks.slice(0, limit).map((t) => serializeTaskSummary(t));
    return {
      ok: true,
      data: {
        totalMatched: tasks.length,
        returned: sliced.length,
        truncated: tasks.length > sliced.length,
        tasks: sliced,
      },
      summary: `Đã tra cứu ${sliced.length}/${tasks.length} công việc của tôi`,
    };
  }

  private async handleListTasks(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const limit = clampLimit(
      typeof rawArgs.limit === 'number' ? rawArgs.limit : undefined,
      30,
      100,
    );
    const tasks = await this.tasksService.findAll(
      {
        scope: readOptionalEnum<TaskScope>(rawArgs.scope, TASK_SCOPES),
        teamId: readOptionalPositiveInt(rawArgs.teamId),
        personalOnly: typeof rawArgs.personalOnly === 'boolean' ? rawArgs.personalOnly : undefined,
        status: readOptionalEnum<TaskStatusFilter>(rawArgs.status, TASK_STATUS_FILTERS),
        priority: readOptionalEnum<TaskPriority>(rawArgs.priority, TASK_PRIORITIES),
        categoryId: readOptionalPositiveInt(rawArgs.categoryId),
        assigneeId: readOptionalPositiveInt(rawArgs.assigneeId),
        deadlineFilter: readOptionalEnum<DeadlineFilter>(rawArgs.deadlineFilter, DEADLINE_FILTERS),
        search: readOptionalString(rawArgs.search, 100),
        sortBy: readOptionalEnum<TaskSortBy>(rawArgs.sortBy, TASK_SORT_OPTIONS),
      },
      userId,
    );
    const sliced = tasks.slice(0, limit).map((t) => serializeTaskSummary(t));
    return {
      ok: true,
      data: {
        totalMatched: tasks.length,
        returned: sliced.length,
        truncated: tasks.length > sliced.length,
        tasks: sliced,
      },
      summary: `Đã liệt kê ${sliced.length}/${tasks.length} công việc`,
    };
  }

  private async handleGetTaskDetail(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const taskId = readOptionalPositiveInt(rawArgs.taskId);
    if (!taskId) {
      return failTool('Mã công việc (taskId) phải là số nguyên dương');
    }
    const task = await this.tasksService.findOne(taskId, userId);
    return {
      ok: true,
      data: {
        task: serializeTaskDetail(task),
      },
      summary: `Đã xem chi tiết công việc #${taskId}`,
    };
  }

  private async handleGetTaskStats(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const stats = await this.tasksService.getStats(userId, {
      teamId: readOptionalPositiveInt(rawArgs.teamId),
      scope: readOptionalEnum<(typeof TASK_STATS_SCOPES)[number]>(rawArgs.scope, TASK_STATS_SCOPES),
    });
    return {
      ok: true,
      data: { stats },
      summary: 'Đã lấy thống kê công việc',
    };
  }

  private async handleListTeams(userId: number): Promise<AiToolExecutionResult> {
    const teams = await this.teamsService.findAllForUser(userId);
    return {
      ok: true,
      data: {
        total: teams.length,
        teams: teams.map((t) => serializeTeamSummary(t, userId)),
      },
      summary: `Đã liệt kê ${teams.length} nhóm làm việc`,
    };
  }

  private async handleGetTeamDetail(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const teamId = readOptionalPositiveInt(rawArgs.teamId);
    if (!teamId) {
      return failTool('Mã nhóm (teamId) phải là số nguyên dương');
    }
    const team = await this.teamsService.findOne(userId, teamId);
    return {
      ok: true,
      data: {
        team: serializeTeamDetail(team, userId),
      },
      summary: `Đã xem chi tiết nhóm #${teamId}`,
    };
  }

  private async handleListCategories(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const requestedScope =
      readOptionalEnum<(typeof CATEGORY_SCOPES)[number]>(rawArgs.scope, CATEGORY_SCOPES) ?? 'all';
    const teamId = readOptionalPositiveInt(rawArgs.teamId);
    const isAllTeamCategories = requestedScope === 'team' && teamId === undefined;
    const rawCategories = await this.categoriesService.findAll(userId, {
      scope: isAllTeamCategories ? 'all' : requestedScope,
      teamId,
    });
    const categories = isAllTeamCategories
      ? rawCategories.filter((c) => c.teamId !== null)
      : rawCategories;

    return {
      ok: true,
      data: {
        total: categories.length,
        categories: categories.map((c) => {
          const withTeam = c as typeof c & { team?: { id: number; name: string } | null };
          return {
            id: c.id,
            name: c.name,
            color: c.color,
            teamId: c.teamId ?? null,
            teamName: withTeam.team?.name ?? null,
          };
        }),
      },
      summary: `Đã liệt kê ${categories.length} danh mục`,
    };
  }

  private async handleListNotifications(
    userId: number,
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const limit = clampLimit(
      typeof rawArgs.limit === 'number' ? rawArgs.limit : undefined,
      20,
      50,
    );
    const filter =
      readOptionalEnum<(typeof NOTIFICATION_FILTERS)[number]>(
        rawArgs.filter,
        NOTIFICATION_FILTERS,
      ) ?? 'all';
    const result = await this.notificationsService.findAllForUser(userId, {
      filter,
      limit,
      cursor: readOptionalPositiveInt(rawArgs.cursor),
    });
    return {
      ok: true,
      data: {
        unreadCount: result.unreadCount,
        nextCursor: result.nextCursor,
        returned: result.items.length,
        items: result.items.map((item) => serializeNotificationItem(item)),
      },
      summary: `Đã lấy ${result.items.length} thông báo`,
    };
  }

  private async handleWriteProposal(
    ctx: AiToolExecutionContext,
    toolName: 'create_task' | 'update_task',
    rawArgs: Record<string, unknown>,
  ): Promise<AiToolExecutionResult> {
    const validation =
      toolName === 'create_task'
        ? await this.validator.validateCreateTaskProposal(ctx.userId, rawArgs)
        : await this.validator.validateUpdateTaskProposal(ctx.userId, rawArgs);

    if (!validation.ok) {
      return failTool(validation.reason, validation.code);
    }

    const expiresAt = new Date(Date.now() + PENDING_ACTION_TTL_MS);
    const actionType =
      validation.actionType === 'CREATE_TASK'
        ? AiActionType.CREATE_TASK
        : AiActionType.UPDATE_TASK;

    const pendingAction = await this.prisma.aiPendingAction.create({
      data: {
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        actionType,
        status: AiPendingActionStatus.PENDING,
        payload: validation.payload as Prisma.InputJsonValue,
        preview: validation.preview as unknown as Prisma.InputJsonValue,
        expiresAt,
      },
    });

    const summary =
      validation.preview.kind === 'CREATE_TASK'
        ? `Đã tạo đề xuất tạo công việc "${validation.preview.title}"`
        : `Đã tạo đề xuất cập nhật công việc #${validation.preview.taskId}`;

    return {
      ok: true,
      data: {
        ok: true,
        requiresConfirmation: true,
        actionId: pendingAction.id,
        actionType: pendingAction.actionType,
        expiresAt: pendingAction.expiresAt.toISOString(),
        preview: validation.preview,
      },
      pendingAction,
      summary,
    };
  }
}
