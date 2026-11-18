import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TasksService } from '../../tasks/tasks.service.js';
import { TeamsService } from '../../teams/teams.service.js';
import { CategoriesService } from '../../categories/categories.service.js';
import { NotificationsService } from '../../notifications/services/notifications.service.js';
import {
  DEADLINE_FILTERS,
  TASK_SCOPES,
  TASK_SORT_OPTIONS,
  TASK_STATUS_FILTERS,
} from '../../tasks/dto/filter-tasks.dto.js';
import type { AuthenticatedMcpUser } from './mcp-token.service.js';
import {
  clampLimit,
  formatMcpErrorMessage,
  serializeNotificationItem,
  serializeTaskDetail,
  serializeTaskSummary,
  serializeTeamDetail,
  serializeTeamSummary,
} from '../utils/mcp-serializers.js';

const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

const TASK_STATS_SCOPES = [
  'all',
  'my_work',
  'assigned_to_me',
  'collaborating',
  'subtasks_assigned_to_me',
  'created_by_me',
] as const;

function jsonToolSuccess(payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload),
      },
    ],
    structuredContent: payload,
  };
}

function jsonToolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: formatMcpErrorMessage(error),
      },
    ],
  };
}

@Injectable()
export class McpServerService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly teamsService: TeamsService,
    private readonly categoriesService: CategoriesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Creates a fresh stateless read-only McpServer bound to the authenticated user's identity.
   * Every tool delegates strictly to existing RBAC-enforced services.
   */
  createReadOnlyServer(authUser: AuthenticatedMcpUser): McpServer {
    const server = new McpServer(
      {
        name: 'taskflow-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    const userId = authUser.userId;

    // 1. get_my_tasks
    server.registerTool(
      'get_my_tasks',
      {
        title: 'Get My Tasks',
        description:
          'Lấy danh sách "Việc của tôi" (công việc cá nhân, việc được phân công chính, việc phối hợp và việc có đầu việc con được giao cho người dùng hiện tại). Chỉ đọc.',
        inputSchema: {
          status: z.enum(TASK_STATUS_FILTERS).optional().describe('Lọc trạng thái: TODO, IN_PROGRESS, DONE hoặc INCOMPLETE (chưa hoàn thành)'),
          deadlineFilter: z.enum(DEADLINE_FILTERS).optional().describe('Lọc hạn chót: overdue, today, due_soon, no_due_date'),
          priority: z.enum(TASK_PRIORITIES).optional().describe('Lọc độ ưu tiên: LOW, MEDIUM, HIGH'),
          search: z.string().max(100).optional().describe('Tìm theo tiêu đề công việc'),
          sortBy: z.enum(TASK_SORT_OPTIONS).optional().describe('Sắp xếp: default, due_date_asc, due_date_desc, priority_desc'),
          limit: z.number().int().min(1).max(100).optional().describe('Số lượng công việc tối đa trả về (mặc định 30, tối đa 100)'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async (args) => {
        try {
          const limit = clampLimit(args.limit, 30, 100);
          const tasks = await this.tasksService.findAll(
            {
              scope: 'my_work',
              status: args.status,
              deadlineFilter: args.deadlineFilter,
              priority: args.priority,
              search: args.search,
              sortBy: args.sortBy,
            },
            userId,
          );
          const sliced = tasks.slice(0, limit).map((t) => serializeTaskSummary(t));
          return jsonToolSuccess({
            totalMatched: tasks.length,
            returned: sliced.length,
            truncated: tasks.length > sliced.length,
            tasks: sliced,
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 2. list_tasks
    server.registerTool(
      'list_tasks',
      {
        title: 'List Tasks',
        description:
          'Liệt kê công việc theo bộ lọc linh hoạt (phạm vi, nhóm/cá nhân, trạng thái, ưu tiên, danh mục, người phụ trách, hạn chót, từ khóa). Chỉ đọc.',
        inputSchema: {
          scope: z.enum(TASK_SCOPES).optional().describe('Phạm vi: all, my_work, assigned_to_me, collaborating, pending_invites, subtasks_assigned_to_me, created_by_me'),
          teamId: z.number().int().min(1).optional().describe('Lọc theo mã nhóm (không kết hợp cùng personalOnly=true)'),
          personalOnly: z.boolean().optional().describe('Chỉ lấy công việc cá nhân không thuộc nhóm nào'),
          status: z.enum(TASK_STATUS_FILTERS).optional().describe('Trạng thái: TODO, IN_PROGRESS, DONE, INCOMPLETE'),
          priority: z.enum(TASK_PRIORITIES).optional().describe('Độ ưu tiên: LOW, MEDIUM, HIGH'),
          categoryId: z.number().int().min(1).optional().describe('Mã danh mục'),
          assigneeId: z.number().int().min(1).optional().describe('Mã người phụ trách'),
          deadlineFilter: z.enum(DEADLINE_FILTERS).optional().describe('Hạn chót: overdue, today, due_soon, no_due_date'),
          search: z.string().max(100).optional().describe('Tìm theo tiêu đề công việc'),
          sortBy: z.enum(TASK_SORT_OPTIONS).optional().describe('Cách sắp xếp'),
          limit: z.number().int().min(1).max(100).optional().describe('Giới hạn số bản ghi (mặc định 30, tối đa 100)'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async (args) => {
        try {
          const limit = clampLimit(args.limit, 30, 100);
          const tasks = await this.tasksService.findAll(
            {
              scope: args.scope,
              teamId: args.teamId,
              personalOnly: args.personalOnly,
              status: args.status,
              priority: args.priority,
              categoryId: args.categoryId,
              assigneeId: args.assigneeId,
              deadlineFilter: args.deadlineFilter,
              search: args.search,
              sortBy: args.sortBy,
            },
            userId,
          );
          const sliced = tasks.slice(0, limit).map((t) => serializeTaskSummary(t));
          return jsonToolSuccess({
            totalMatched: tasks.length,
            returned: sliced.length,
            truncated: tasks.length > sliced.length,
            tasks: sliced,
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 3. get_task_detail
    server.registerTool(
      'get_task_detail',
      {
        title: 'Get Task Detail',
        description:
          'Xem chi tiết đầy đủ của 1 công việc theo ID, bao gồm mô tả, danh sách đầu việc con (checklist), người phụ trách và người phối hợp. Chỉ đọc.',
        inputSchema: {
          taskId: z.number().int().min(1).describe('Mã công việc cần xem chi tiết'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async ({ taskId }) => {
        try {
          const task = await this.tasksService.findOne(taskId, userId);
          return jsonToolSuccess({
            task: serializeTaskDetail(task),
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 4. get_task_stats
    server.registerTool(
      'get_task_stats',
      {
        title: 'Get Task Statistics',
        description:
          'Lấy thống kê tổng quan công việc (tổng số, cần làm, đang làm, hoàn thành, quá hạn, hôm nay, sắp đến hạn, tỷ lệ hoàn thành, phân bổ ưu tiên). Chỉ đọc.',
        inputSchema: {
          teamId: z.number().int().min(1).optional().describe('Lọc thống kê theo mã nhóm cụ thể'),
          scope: z.enum(TASK_STATS_SCOPES).optional().describe('Phạm vi thống kê: all, my_work, assigned_to_me, collaborating, subtasks_assigned_to_me, created_by_me'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async (args) => {
        try {
          const stats = await this.tasksService.getStats(userId, {
            teamId: args.teamId,
            scope: args.scope,
          });
          return jsonToolSuccess({ stats });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 5. list_teams
    server.registerTool(
      'list_teams',
      {
        title: 'List Teams',
        description:
          'Lấy danh sách các nhóm làm việc mà người dùng đang sở hữu hoặc là thành viên. Chỉ đọc.',
        inputSchema: {},
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async () => {
        try {
          const teams = await this.teamsService.findAllForUser(userId);
          return jsonToolSuccess({
            total: teams.length,
            teams: teams.map((t) => serializeTeamSummary(t, userId)),
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 6. get_team_detail
    server.registerTool(
      'get_team_detail',
      {
        title: 'Get Team Detail',
        description:
          'Xem chi tiết 1 nhóm làm việc theo ID, bao gồm vai trò của bạn và danh sách thành viên trong nhóm. Chỉ đọc.',
        inputSchema: {
          teamId: z.number().int().min(1).describe('Mã nhóm làm việc'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async ({ teamId }) => {
        try {
          const team = await this.teamsService.findOne(userId, teamId);
          return jsonToolSuccess({
            team: serializeTeamDetail(team, userId),
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 7. list_categories
    server.registerTool(
      'list_categories',
      {
        title: 'List Categories',
        description:
          'Lấy danh sách danh mục công việc (cá nhân, tất cả hoặc thuộc 1 nhóm cụ thể). Chỉ đọc.',
        inputSchema: {
          scope: z.enum(['all', 'personal', 'team']).optional().describe('Phạm vi danh mục: all, personal hoặc team'),
          teamId: z.number().int().min(1).optional().describe('Lọc danh mục của 1 nhóm cụ thể'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async (args) => {
        try {
          const requestedScope = args.scope ?? 'all';
          const isAllTeamCategories = requestedScope === 'team' && args.teamId === undefined;
          const rawCategories = await this.categoriesService.findAll(userId, {
            scope: isAllTeamCategories ? 'all' : requestedScope,
            teamId: args.teamId,
          });
          const categories = isAllTeamCategories
            ? rawCategories.filter((c) => c.teamId !== null)
            : rawCategories;
          return jsonToolSuccess({
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
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // 8. list_notifications
    server.registerTool(
      'list_notifications',
      {
        title: 'List Notifications',
        description:
          'Lấy danh sách thông báo của người dùng (tất cả, chưa đọc hoặc quan trọng) kèm số lượng chưa đọc. Chỉ đọc.',
        inputSchema: {
          filter: z.enum(['all', 'unread', 'important']).optional().describe('Bộ lọc thông báo: all, unread, important'),
          limit: z.number().int().min(1).max(50).optional().describe('Số lượng tối đa (mặc định 20, tối đa 50)'),
          cursor: z.number().int().min(1).optional().describe('Con trỏ phân trang ID thông báo'),
        },
        annotations: READ_ONLY_TOOL_ANNOTATIONS,
      },
      async (args) => {
        try {
          const limit = clampLimit(args.limit, 20, 50);
          const result = await this.notificationsService.findAllForUser(userId, {
            filter: args.filter ?? 'all',
            limit,
            cursor: args.cursor,
          });
          return jsonToolSuccess({
            unreadCount: result.unreadCount,
            nextCursor: result.nextCursor,
            returned: result.items.length,
            items: result.items.map((item) => serializeNotificationItem(item)),
          });
        } catch (error) {
          return jsonToolError(error);
        }
      },
    );

    // --- READ-ONLY RESOURCES ---
    server.registerResource(
      'my-summary',
      'taskflow://me/summary',
      {
        title: 'My TaskFlow Summary',
        description: 'Tổng quan công việc của tôi (quá hạn, hôm nay, sắp đến hạn) và số thông báo chưa đọc.',
        mimeType: 'application/json',
      },
      async (uri) => {
        try {
          const [stats, unreadCount] = await Promise.all([
            this.tasksService.getStats(userId, { scope: 'my_work' }),
            this.notificationsService.getUnreadCount(userId),
          ]);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  user: { id: authUser.userId, name: authUser.name },
                  myWorkStats: stats,
                  unreadNotifications: unreadCount,
                }),
              },
            ],
          };
        } catch (error) {
          throw new Error(formatMcpErrorMessage(error));
        }
      },
    );

    server.registerResource(
      'my-work-tasks',
      'taskflow://tasks/my-work',
      {
        title: 'My Incomplete Tasks',
        description: 'Danh sách công việc chưa hoàn thành thuộc phạm vi Việc của tôi (tối đa 50 việc).',
        mimeType: 'application/json',
      },
      async (uri) => {
        try {
          const tasks = await this.tasksService.findAll(
            { scope: 'my_work', status: 'INCOMPLETE', sortBy: 'due_date_asc' },
            userId,
          );
          const sliced = tasks.slice(0, 50).map((t) => serializeTaskSummary(t));
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  totalMatched: tasks.length,
                  returned: sliced.length,
                  tasks: sliced,
                }),
              },
            ],
          };
        } catch (error) {
          throw new Error(formatMcpErrorMessage(error));
        }
      },
    );

    server.registerResource(
      'my-teams',
      'taskflow://teams',
      {
        title: 'My Teams',
        description: 'Danh sách các nhóm làm việc của người dùng hiện tại.',
        mimeType: 'application/json',
      },
      async (uri) => {
        try {
          const teams = await this.teamsService.findAllForUser(userId);
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  total: teams.length,
                  teams: teams.map((t) => serializeTeamSummary(t, userId)),
                }),
              },
            ],
          };
        } catch (error) {
          throw new Error(formatMcpErrorMessage(error));
        }
      },
    );

    server.registerResource(
      'unread-notifications',
      'taskflow://notifications/unread',
      {
        title: 'Unread Notifications',
        description: 'Tối đa 20 thông báo chưa đọc mới nhất của người dùng.',
        mimeType: 'application/json',
      },
      async (uri) => {
        try {
          const result = await this.notificationsService.findAllForUser(userId, {
            filter: 'unread',
            limit: 20,
          });
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({
                  unreadCount: result.unreadCount,
                  items: result.items.map((i) => serializeNotificationItem(i)),
                }),
              },
            ],
          };
        } catch (error) {
          throw new Error(formatMcpErrorMessage(error));
        }
      },
    );

    // --- READ-ONLY PROMPTS ---
    server.registerPrompt(
      'daily_briefing',
      {
        title: 'Báo cáo công việc trong ngày',
        description: 'Tổng hợp nhanh các việc quá hạn, việc đến hạn hôm nay và thông báo quan trọng chưa đọc.',
      },
      () => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                'Hãy dùng các công cụ MCP chỉ đọc của TaskFlow (`get_task_stats` với scope="my_work", `get_my_tasks` với deadlineFilter="overdue", `get_my_tasks` với deadlineFilter="today", và `list_notifications` với filter="important") để lập bản tóm tắt công việc hôm nay bằng tiếng Việt ngắn gọn, rõ mức độ ưu tiên.',
              ].join('\n'),
            },
          },
        ],
      }),
    );

    server.registerPrompt(
      'team_workload_overview',
      {
        title: 'Tổng quan khối lượng công việc nhóm',
        description: 'Phân tích tiến độ, thành viên và các công việc rủi ro quá hạn của 1 nhóm làm việc.',
        argsSchema: {
          teamId: z.string().regex(/^[1-9]\d*$/, 'teamId phải là số nguyên dương').describe('Mã nhóm cần phân tích'),
        },
      },
      ({ teamId }) => ({
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Hãy gọi \`get_team_detail\` (teamId=${teamId}), \`get_task_stats\` (teamId=${teamId}) và \`list_tasks\` (teamId=${teamId}, status="INCOMPLETE", sortBy="due_date_asc") rồi tổng hợp báo cáo khối lượng công việc và rủi ro quá hạn của nhóm bằng tiếng Việt.`,
            },
          },
        ],
      }),
    );

    return server;
  }
}
