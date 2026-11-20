import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  NetworkError,
  UnauthorizedError,
  subscribeUnauthorized,
} from '../../../../shared/api/index.ts';
import { sendAiChatStream } from '../../api/ai.api.ts';
import type {
  AiActionType,
  AiMessageItem,
  AiPendingActionItem,
  AiProposalPreview,
  SendAiChatResponse,
} from '../../types/ai.types.ts';
import {
  applyResolvedActionToList,
  buildAiPreviewFields,
  formatAiActionTitle,
  formatAiRelativeError,
  isAiActionPending,
  isDangerAiAction,
  isTaskLinkedAiAction,
  isTeamMutatingAiAction,
  mergeResolvedActionsIntoChatResponse,
  parseAiInlineMarkdown,
  parseAiMarkdownBlocks,
  parseSseChunk,
} from '../ai-chat.utils.ts';

const originalFetch = globalThis.fetch;
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

function installMockLocalStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  (globalThis as { localStorage?: Partial<Storage> }).localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage === undefined) {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  } else {
    (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
  }
});

function makeCreateAction(overrides: Partial<AiPendingActionItem> = {}): AiPendingActionItem {
  return {
    id: 101,
    userId: 1,
    conversationId: 10,
    messageId: 20,
    actionType: 'CREATE_TASK',
    status: 'PENDING',
    preview: {
      kind: 'CREATE_TASK',
      title: 'Hoàn thiện báo cáo Q4',
      description: 'Tổng hợp số liệu từ các nhóm',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startDate: '2026-11-20',
      dueDate: '2026-11-25',
      team: { id: 3, name: 'Backend Team' },
      assignee: { id: 7, name: 'Nguyễn Văn A' },
      category: { id: 2, name: 'Báo cáo' },
      collaborators: [
        { id: 8, name: 'Trần Thị B' },
        { id: 9, name: 'Lê Văn C' },
      ],
    },
    executedTaskId: null,
    errorMessage: null,
    expiresAt: '2026-11-19T12:00:00.000Z',
    confirmedAt: null,
    createdAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

function makeUpdateAction(overrides: Partial<AiPendingActionItem> = {}): AiPendingActionItem {
  return {
    id: 202,
    userId: 1,
    conversationId: 10,
    messageId: 21,
    actionType: 'UPDATE_TASK',
    status: 'PENDING',
    preview: {
      kind: 'UPDATE_TASK',
      taskId: 42,
      taskTitle: 'Triển khai API mới',
      changes: [
        { field: 'status', label: 'Trạng thái', before: 'Cần làm', after: 'Đang làm' },
        { field: 'dueDate', label: 'Hạn chót', before: null, after: '2026-11-30' },
      ],
    },
    executedTaskId: null,
    errorMessage: null,
    expiresAt: '2026-11-19T12:00:00.000Z',
    confirmedAt: null,
    createdAt: '2026-11-19T10:00:00.000Z',
    ...overrides,
  };
}

describe('ai-chat.utils', () => {
  it('formatAiActionTitle returns concise Vietnamese titles for CREATE_TASK and UPDATE_TASK', () => {
    assert.equal(formatAiActionTitle(makeCreateAction()), 'Tạo công việc mới');
    assert.equal(formatAiActionTitle(makeUpdateAction()), 'Cập nhật công việc #42');
  });

  it('buildAiPreviewFields maps CREATE_TASK fields with Vietnamese labels and skips empty optional fields', () => {
    const fullFields = buildAiPreviewFields(makeCreateAction().preview);
    assert.deepEqual(fullFields, [
      { label: 'Tiêu đề', value: 'Hoàn thiện báo cáo Q4' },
      { label: 'Mô tả', value: 'Tổng hợp số liệu từ các nhóm' },
      { label: 'Trạng thái', value: 'Đang làm' },
      { label: 'Độ ưu tiên', value: 'Cao' },
      { label: 'Phạm vi', value: 'Nhóm: Backend Team' },
      { label: 'Ngày bắt đầu', value: '2026-11-20' },
      { label: 'Hạn chót', value: '2026-11-25' },
      { label: 'Người phụ trách', value: 'Nguyễn Văn A' },
      { label: 'Danh mục', value: 'Báo cáo' },
      { label: 'Người phối hợp', value: 'Trần Thị B, Lê Văn C' },
    ]);

    const minimalFields = buildAiPreviewFields({
      kind: 'CREATE_TASK',
      title: 'Mua văn phòng phẩm',
      description: null,
      status: 'TODO',
      priority: 'LOW',
      startDate: null,
      dueDate: null,
      team: null,
      assignee: null,
      category: null,
      collaborators: [],
    });
    assert.deepEqual(minimalFields, [
      { label: 'Tiêu đề', value: 'Mua văn phòng phẩm' },
      { label: 'Trạng thái', value: 'Cần làm' },
      { label: 'Độ ưu tiên', value: 'Thấp' },
      { label: 'Phạm vi', value: 'Cá nhân' },
    ]);
  });

  it('buildAiPreviewFields maps UPDATE_TASK changes preserving before/after diffs', () => {
    const fields = buildAiPreviewFields(makeUpdateAction().preview);
    assert.deepEqual(fields, [
      { label: 'Trạng thái', before: 'Cần làm', after: 'Đang làm' },
      { label: 'Hạn chót', before: null, after: '2026-11-30' },
    ]);
  });

  it('isAiActionPending returns true only when status is PENDING and expiresAt is strictly in the future', () => {
    const now = new Date('2026-11-19T11:00:00.000Z');
    assert.equal(
      isAiActionPending({ status: 'PENDING', expiresAt: '2026-11-19T11:00:01.000Z' }, now),
      true,
    );
    assert.equal(
      isAiActionPending({ status: 'PENDING', expiresAt: '2026-11-19T11:00:00.000Z' }, now),
      false,
    );
    assert.equal(
      isAiActionPending({ status: 'PENDING', expiresAt: '2026-11-19T10:59:59.000Z' }, now),
      false,
    );
    assert.equal(
      isAiActionPending({ status: 'PENDING', expiresAt: 'not-a-date' }, now),
      false,
    );
    assert.equal(
      isAiActionPending({ status: 'EXECUTED', expiresAt: '2026-11-19T12:00:00.000Z' }, now),
      false,
    );
    assert.equal(
      isAiActionPending({ status: 'CANCELLED', expiresAt: '2026-11-19T12:00:00.000Z' }, now),
      false,
    );
  });

  it('applyResolvedActionToList immutably updates matching action inside messages', () => {
    const pending1 = makeCreateAction({ id: 101, status: 'PENDING' });
    const pending2 = makeUpdateAction({ id: 202, status: 'PENDING' });

    const msg1: AiMessageItem = {
      id: 1,
      conversationId: 10,
      role: 'USER',
      content: 'Tạo việc',
      toolCallsSummary: null,
      pendingActions: [],
      createdAt: '2026-11-19T10:00:00.000Z',
    };
    const msg2: AiMessageItem = {
      id: 2,
      conversationId: 10,
      role: 'ASSISTANT',
      content: 'Đây là đề xuất',
      toolCallsSummary: [{ name: 'create_task', ok: true, summary: 'Đề xuất tạo công việc' }],
      pendingActions: [pending1, pending2],
      createdAt: '2026-11-19T10:00:05.000Z',
    };

    const resolved1: AiPendingActionItem = {
      ...pending1,
      status: 'EXECUTED',
      executedTaskId: 99,
      confirmedAt: '2026-11-19T10:05:00.000Z',
    };

    const originalMessages = [msg1, msg2];
    const updatedMessages = applyResolvedActionToList(originalMessages, resolved1);

    assert.notEqual(updatedMessages, originalMessages);
    assert.equal(updatedMessages[0], msg1);
    assert.notEqual(updatedMessages[1], msg2);
    assert.equal(updatedMessages[1].pendingActions[0].status, 'EXECUTED');
    assert.equal(updatedMessages[1].pendingActions[0].executedTaskId, 99);
    assert.equal(updatedMessages[1].pendingActions[1], pending2);
    assert.equal(msg2.pendingActions[0].status, 'PENDING');
  });

  it('formatAiRelativeError produces friendly Vietnamese messages for network, 403, 404, 409, 503, and 500 errors', () => {
    const netMsg = formatAiRelativeError(new NetworkError());
    assert.match(netMsg, /kết nối/i);

    assert.equal(
      formatAiRelativeError(new ApiError('Đề xuất hành động đã được xử lý hoặc đang thực thi', 409)),
      'Đề xuất hành động đã được xử lý hoặc đang thực thi',
    );
    assert.match(
      formatAiRelativeError(new ApiError('Conflict', 409)),
      /đã được xử lý|hết hiệu lực/i,
    );

    assert.equal(
      formatAiRelativeError(new ApiError('Trợ lý AI chưa được cấu hình', 503)),
      'Trợ lý AI chưa được cấu hình',
    );
    assert.match(
      formatAiRelativeError(new ApiError('Service Unavailable', 503)),
      /không khả dụng|cấu hình/i,
    );

    assert.equal(
      formatAiRelativeError(new ApiError('Forbidden', 403)),
      'Bạn không có quyền thực hiện thao tác này.',
    );
    assert.equal(
      formatAiRelativeError(new ApiError('Not Found', 404)),
      'Không tìm thấy dữ liệu yêu cầu.',
    );
    assert.equal(
      formatAiRelativeError(new ApiError('Internal Server Error', 500)),
      'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
    );
    assert.equal(
      formatAiRelativeError(new Error('Lỗi cụ thể từ AI'), 'Fallback'),
      'Lỗi cụ thể từ AI',
    );
    assert.equal(formatAiRelativeError(null, 'Fallback mặc định'), 'Fallback mặc định');
  });

  it('formatAiActionTitle returns concise Vietnamese titles for all 11 extended action kinds', () => {
    const cases: Array<{ actionType: AiActionType; preview: AiProposalPreview; expected: string }> = [
      {
        actionType: 'DELETE_TASK',
        preview: {
          kind: 'DELETE_TASK',
          taskId: 10,
          taskTitle: 'Dọn dẹp log',
          teamName: 'Backend',
          subtaskCount: 2,
        },
        expected: 'Xóa công việc #10',
      },
      {
        actionType: 'RESTORE_TASK',
        preview: {
          kind: 'RESTORE_TASK',
          taskId: 11,
          taskTitle: 'Khôi phục báo cáo',
          teamName: null,
        },
        expected: 'Khôi phục công việc #11',
      },
      {
        actionType: 'RETURN_TASK',
        preview: {
          kind: 'RETURN_TASK',
          taskId: 12,
          taskTitle: 'Kiểm thử bảo mật',
          teamName: 'QA Team',
          reason: 'Thiếu tài liệu đặc tả',
        },
        expected: 'Trả lại công việc #12',
      },
      {
        actionType: 'CREATE_SUBTASK',
        preview: {
          kind: 'CREATE_SUBTASK',
          taskId: 15,
          taskTitle: 'Triển khai CI/CD',
          title: 'Cấu hình Docker',
          description: null,
          assignee: null,
        },
        expected: 'Thêm công việc con (#15)',
      },
      {
        actionType: 'UPDATE_SUBTASK',
        preview: {
          kind: 'UPDATE_SUBTASK',
          taskId: 15,
          taskTitle: 'Triển khai CI/CD',
          subtaskId: 55,
          subtaskTitle: 'Cấu hình Docker',
          changes: [],
        },
        expected: 'Cập nhật công việc con #55',
      },
      {
        actionType: 'DELETE_SUBTASK',
        preview: {
          kind: 'DELETE_SUBTASK',
          taskId: 15,
          taskTitle: 'Triển khai CI/CD',
          subtaskId: 56,
          subtaskTitle: 'Script cũ',
        },
        expected: 'Xóa công việc con #56',
      },
      {
        actionType: 'ADD_TEAM_MEMBER',
        preview: {
          kind: 'ADD_TEAM_MEMBER',
          teamId: 3,
          teamName: 'Frontend',
          targetUser: { id: 8, name: 'Trần Thị B', email: 'b@example.com' },
          role: 'MEMBER',
        },
        expected: 'Thêm thành viên vào nhóm',
      },
      {
        actionType: 'UPDATE_TEAM_MEMBER_ROLE',
        preview: {
          kind: 'UPDATE_TEAM_MEMBER_ROLE',
          teamId: 3,
          teamName: 'Frontend',
          memberUser: { id: 8, name: 'Trần Thị B' },
          oldRole: 'MEMBER',
          newRole: 'ADMIN',
        },
        expected: 'Đổi vai trò thành viên',
      },
      {
        actionType: 'REMOVE_TEAM_MEMBER',
        preview: {
          kind: 'REMOVE_TEAM_MEMBER',
          teamId: 3,
          teamName: 'Frontend',
          memberUser: { id: 8, name: 'Trần Thị B' },
          memberRole: 'MEMBER',
          isSelfLeaving: false,
        },
        expected: 'Xóa thành viên khỏi nhóm',
      },
      {
        actionType: 'REMOVE_TEAM_MEMBER',
        preview: {
          kind: 'REMOVE_TEAM_MEMBER',
          teamId: 3,
          teamName: 'Frontend',
          memberUser: { id: 1, name: 'Tôi' },
          memberRole: 'ADMIN',
          isSelfLeaving: true,
        },
        expected: 'Rời khỏi nhóm',
      },
    ];

    for (const item of cases) {
      assert.equal(
        formatAiActionTitle({ actionType: item.actionType, preview: item.preview }),
        item.expected,
      );
    }
  });

  it('buildAiPreviewFields maps DELETE_TASK, RESTORE_TASK, and RETURN_TASK previews', () => {
    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'DELETE_TASK',
        taskId: 10,
        taskTitle: 'Dọn dẹp log',
        teamName: 'Backend Team',
        subtaskCount: 3,
      }),
      [
        { label: 'Công việc', value: 'Dọn dẹp log' },
        { label: 'Phạm vi', value: 'Nhóm: Backend Team' },
        { label: 'Công việc con', value: '3 công việc con' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'DELETE_TASK',
        taskId: 11,
        taskTitle: 'Việc cá nhân',
        teamName: null,
        subtaskCount: 0,
      }),
      [
        { label: 'Công việc', value: 'Việc cá nhân' },
        { label: 'Phạm vi', value: 'Cá nhân' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'RESTORE_TASK',
        taskId: 12,
        taskTitle: 'Khôi phục task',
        teamName: null,
      }),
      [
        { label: 'Công việc', value: 'Khôi phục task' },
        { label: 'Phạm vi', value: 'Cá nhân' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'RETURN_TASK',
        taskId: 13,
        taskTitle: 'Audit API',
        teamName: 'Platform',
        reason: 'Chưa đủ test case',
      }),
      [
        { label: 'Công việc', value: 'Audit API' },
        { label: 'Nhóm', value: 'Platform' },
        { label: 'Lý do trả lại', value: 'Chưa đủ test case' },
      ],
    );
  });

  it('buildAiPreviewFields maps CREATE_SUBTASK, UPDATE_SUBTASK, and DELETE_SUBTASK previews', () => {
    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'CREATE_SUBTASK',
        taskId: 20,
        taskTitle: 'Phát hành v2',
        title: 'Viết changelog',
        description: 'Ghi chú các thay đổi chính',
        assignee: { id: 5, name: 'Lê Văn C' },
      }),
      [
        { label: 'Công việc chính', value: 'Phát hành v2' },
        { label: 'Công việc con', value: 'Viết changelog' },
        { label: 'Mô tả', value: 'Ghi chú các thay đổi chính' },
        { label: 'Người thực hiện', value: 'Lê Văn C' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'CREATE_SUBTASK',
        taskId: 20,
        taskTitle: 'Phát hành v2',
        title: 'Tag release',
        description: null,
        assignee: null,
      }),
      [
        { label: 'Công việc chính', value: 'Phát hành v2' },
        { label: 'Công việc con', value: 'Tag release' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'UPDATE_SUBTASK',
        taskId: 20,
        taskTitle: 'Phát hành v2',
        subtaskId: 77,
        subtaskTitle: 'Viết changelog',
        changes: [
          { field: 'status', label: 'Trạng thái', before: 'Cần làm', after: 'Đang làm' },
        ],
      }),
      [
        { label: 'Công việc chính', value: 'Phát hành v2' },
        { label: 'Công việc con', value: 'Viết changelog' },
        { label: 'Trạng thái', before: 'Cần làm', after: 'Đang làm' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'DELETE_SUBTASK',
        taskId: 20,
        taskTitle: 'Phát hành v2',
        subtaskId: 78,
        subtaskTitle: 'Bước thừa',
      }),
      [
        { label: 'Công việc chính', value: 'Phát hành v2' },
        { label: 'Công việc con', value: 'Bước thừa' },
      ],
    );
  });

  it('buildAiPreviewFields maps team member previews with Vietnamese role labels', () => {
    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'ADD_TEAM_MEMBER',
        teamId: 4,
        teamName: 'Design Team',
        targetUser: { id: 9, name: 'Phạm D', email: 'd@example.com' },
        role: 'ADMIN',
      }),
      [
        { label: 'Nhóm', value: 'Design Team' },
        { label: 'Thành viên', value: 'Phạm D (d@example.com)' },
        { label: 'Vai trò', value: 'Quản trị viên' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'UPDATE_TEAM_MEMBER_ROLE',
        teamId: 4,
        teamName: 'Design Team',
        memberUser: { id: 9, name: 'Phạm D' },
        oldRole: 'MEMBER',
        newRole: 'ADMIN',
      }),
      [
        { label: 'Nhóm', value: 'Design Team' },
        { label: 'Thành viên', value: 'Phạm D' },
        { label: 'Vai trò', before: 'Thành viên', after: 'Quản trị viên' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'REMOVE_TEAM_MEMBER',
        teamId: 4,
        teamName: 'Design Team',
        memberUser: { id: 9, name: 'Phạm D' },
        memberRole: 'MEMBER',
        isSelfLeaving: false,
      }),
      [
        { label: 'Nhóm', value: 'Design Team' },
        { label: 'Thành viên', value: 'Phạm D' },
        { label: 'Vai trò hiện tại', value: 'Thành viên' },
        { label: 'Hình thức', value: 'Xóa khỏi nhóm' },
      ],
    );

    assert.deepEqual(
      buildAiPreviewFields({
        kind: 'REMOVE_TEAM_MEMBER',
        teamId: 4,
        teamName: 'Design Team',
        memberUser: { id: 1, name: 'Tôi' },
        memberRole: 'ADMIN',
        isSelfLeaving: true,
      }),
      [
        { label: 'Nhóm', value: 'Design Team' },
        { label: 'Thành viên', value: 'Tôi' },
        { label: 'Vai trò hiện tại', value: 'Quản trị viên' },
        { label: 'Hình thức', value: 'Tự rời nhóm' },
      ],
    );
  });

  it('classifies isDangerAiAction, isTaskLinkedAiAction, and isTeamMutatingAiAction accurately across all 11 types', () => {
    const allTypes: AiActionType[] = [
      'CREATE_TASK',
      'UPDATE_TASK',
      'DELETE_TASK',
      'RESTORE_TASK',
      'CREATE_SUBTASK',
      'UPDATE_SUBTASK',
      'DELETE_SUBTASK',
      'RETURN_TASK',
      'ADD_TEAM_MEMBER',
      'UPDATE_TEAM_MEMBER_ROLE',
      'REMOVE_TEAM_MEMBER',
    ];

    const expectedDanger = new Set<AiActionType>([
      'DELETE_TASK',
      'DELETE_SUBTASK',
      'REMOVE_TEAM_MEMBER',
    ]);
    const expectedTeamMutating = new Set<AiActionType>([
      'ADD_TEAM_MEMBER',
      'UPDATE_TEAM_MEMBER_ROLE',
      'REMOVE_TEAM_MEMBER',
    ]);

    for (const actionType of allTypes) {
      assert.equal(
        isDangerAiAction(actionType),
        expectedDanger.has(actionType),
        `isDangerAiAction(${actionType})`,
      );
      assert.equal(
        isTeamMutatingAiAction(actionType),
        expectedTeamMutating.has(actionType),
        `isTeamMutatingAiAction(${actionType})`,
      );
      assert.equal(
        isTaskLinkedAiAction(actionType),
        !expectedTeamMutating.has(actionType),
        `isTaskLinkedAiAction(${actionType})`,
      );
    }
  });

  it('parseSseChunk parses single and split SSE chunks, normalizes CRLF, and handles malformed JSON safely', () => {
    // 1. Single chunk with multiple events
    const first = parseSseChunk(
      '',
      'event: meta\ndata: {"conversationId":42}\n\nevent: tool_start\ndata: {"name":"list_tasks"}\n\n',
    );
    assert.deepEqual(first.events, [
      { event: 'meta', data: { conversationId: 42 } },
      { event: 'tool_start', data: { name: 'list_tasks' } },
    ]);
    assert.equal(first.rest, '');

    // 2. Split across chunk boundaries including CRLF split across boundary
    const step1 = parseSseChunk('', 'event: delta\r\ndata: {"te');
    assert.deepEqual(step1.events, []);
    assert.equal(step1.rest, 'event: delta\ndata: {"te');

    const step2 = parseSseChunk(step1.rest, 'xt":"Xin "}\r\n\r');
    assert.deepEqual(step2.events, []);

    const step3 = parseSseChunk(step2.rest, '\nevent: delta\r\ndata: {"text":"chào"}\r\n\r');
    assert.deepEqual(step3.events, [{ event: 'delta', data: { text: 'Xin ' } }]);

    const step4 = parseSseChunk(step3.rest, '\n: heartbeat\n\ndata: {"ok":true}\n\n');
    assert.deepEqual(step4.events, [
      { event: 'delta', data: { text: 'chào' } },
      { event: 'message', data: { ok: true } },
    ]);
    assert.equal(step4.rest, '');

    // 3. Invalid JSON does not throw
    const bad = parseSseChunk('', 'event: error\ndata: {broken-json\n\n');
    assert.deepEqual(bad.events, [{ event: 'error', data: '{broken-json' }]);
    assert.equal(bad.rest, '');
  });

  it('sendAiChatStream sends Bearer Authorization header, streams multi-byte UTF-8 chunks, and resolves done response', async () => {
    installMockLocalStorage({ taskflow_auth_token: 'secret-jwt-token' });

    const donePayload: SendAiChatResponse = {
      conversationId: 77,
      userMessage: {
        id: 1,
        conversationId: 77,
        role: 'USER',
        content: 'Xin chào',
        toolCallsSummary: null,
        pendingActions: [],
        createdAt: '2026-11-19T10:00:00.000Z',
      },
      assistantMessage: {
        id: 2,
        conversationId: 77,
        role: 'ASSISTANT',
        content: 'Chào bạn, việc đã sẵn sàng.',
        toolCallsSummary: [{ name: 'list_tasks', ok: true, summary: 'Đã liệt kê 1 việc' }],
        pendingActions: [],
        createdAt: '2026-11-19T10:00:01.000Z',
      },
      pendingActions: [],
    };

    const encoder = new TextEncoder();
    const fullSse =
      'event: meta\ndata: {"conversationId":77}\n\n' +
      'event: tool_start\ndata: {"name":"list_tasks"}\n\n' +
      'event: tool_result\ndata: {"name":"list_tasks","ok":true,"summary":"Đã liệt kê 1 việc"}\n\n' +
      'event: delta\ndata: {"text":"Chào bạn, "}\n\n' +
      'event: delta\ndata: {"text":"việc đã sẵn sàng."}\n\n' +
      `event: done\ndata: ${JSON.stringify(donePayload)}\n\n`;
    const encoded = encoder.encode(fullSse);

    // Split across a multi-byte Vietnamese character to confirm TextDecoder { stream: true }
    const splitPoint = fullSse.indexOf('việc') + 4;
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded.slice(0, splitPoint));
          controller.enqueue(encoded.slice(splitPoint));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };

    const seen: string[] = [];
    const result = await sendAiChatStream(
      { message: 'Xin chào' },
      {
        onMeta: (d) => seen.push(`meta:${d.conversationId}`),
        onToolStart: (d) => seen.push(`tool_start:${d.name}`),
        onToolResult: (d) => seen.push(`tool_result:${d.name}:${d.ok}`),
        onDelta: (d) => seen.push(`delta:${d.text}`),
        onDone: (d) => seen.push(`done:${d.assistantMessage.id}`),
      },
    );

    assert.equal(capturedUrl, '/api/ai/chat/stream');
    assert.equal(capturedUrl.includes('token='), false);
    assert.equal(capturedHeaders.Authorization, 'Bearer secret-jwt-token');
    assert.deepEqual(seen, [
      'meta:77',
      'tool_start:list_tasks',
      'tool_result:list_tasks:true',
      'delta:Chào bạn, ',
      'delta:việc đã sẵn sàng.',
      'done:2',
    ]);
    assert.deepEqual(result, donePayload);
  });

  it('sendAiChatStream handles 401 via notifyUnauthorized, pre-stream 503 via parseApiError, and mid-stream error events', async () => {
    installMockLocalStorage({ taskflow_auth_token: 'expired-token' });

    let unauthorizedNotified = 0;
    const unsubscribe = subscribeUnauthorized(() => {
      unauthorizedNotified += 1;
    });
    try {
      globalThis.fetch = async () => new Response(null, { status: 401 });
      await assert.rejects(
        () => sendAiChatStream({ message: 'Hi' }, {}),
        (err: unknown) => err instanceof UnauthorizedError && err.status === 401,
      );
      assert.equal(unauthorizedNotified, 1);
    } finally {
      unsubscribe();
    }

    installMockLocalStorage({ taskflow_auth_token: 'valid-token' });
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: 'Trợ lý AI chưa được cấu hình' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      () => sendAiChatStream({ message: 'Hi' }, {}),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 503 &&
        err.message === 'Trợ lý AI chưa được cấu hình',
    );

    const encoder = new TextEncoder();
    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"statusCode":502,"message":"Provider timeout"}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      );

    let receivedStreamError: { statusCode: number; message: string } | null = null;
    await assert.rejects(
      () =>
        sendAiChatStream(
          { message: 'Hi' },
          {
            onError: (evt) => {
              receivedStreamError = evt;
            },
          },
        ),
      (err: unknown) =>
        err instanceof ApiError && err.status === 502 && err.message === 'Provider timeout',
    );
    assert.deepEqual(receivedStreamError, { statusCode: 502, message: 'Provider timeout' });
  });

  it('sendAiChatStream dispatches onPendingAction, handles EOF frame without trailing double-newline, and stops cleanly on AbortSignal mid-stream', async () => {
    installMockLocalStorage({ taskflow_auth_token: 'secret-jwt-token' });

    const pendingAction = makeCreateAction({ id: 909, messageId: null });
    const donePayload: SendAiChatResponse = {
      conversationId: 88,
      userMessage: {
        id: 10,
        conversationId: 88,
        role: 'USER',
        content: 'Tạo việc',
        toolCallsSummary: null,
        pendingActions: [],
        createdAt: '2026-11-19T10:00:00.000Z',
      },
      assistantMessage: {
        id: 11,
        conversationId: 88,
        role: 'ASSISTANT',
        content: 'Đã tạo đề xuất',
        toolCallsSummary: null,
        pendingActions: [{ ...pendingAction, messageId: 11 }],
        createdAt: '2026-11-19T10:00:01.000Z',
      },
      pendingActions: [{ ...pendingAction, messageId: 11 }],
    };

    // 1. onPendingAction + EOF frame without trailing \n\n
    const encoder = new TextEncoder();
    const eofNoTrailingBlankLine =
      `event: pending_action\ndata: ${JSON.stringify({ action: pendingAction })}\n\n` +
      `event: done\ndata: ${JSON.stringify(donePayload)}`; // intentionally no trailing \n\n

    globalThis.fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(eofNoTrailingBlankLine));
            controller.close();
          },
        }),
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );

    const receivedPending: AiPendingActionItem[] = [];
    let receivedDone: SendAiChatResponse | null = null;
    const eofResult = await sendAiChatStream(
      { message: 'Tạo việc' },
      {
        onPendingAction: ({ action }) => receivedPending.push(action),
        onDone: (res) => {
          receivedDone = res;
        },
      },
    );

    assert.equal(receivedPending.length, 1);
    assert.equal(receivedPending[0].id, 909);
    assert.deepEqual(receivedDone, donePayload);
    assert.deepEqual(eofResult, donePayload);

    // 2. AbortSignal mid-stream stop cancels reader and ignores subsequent chunks
    const abortController = new AbortController();
    let readerCancelled = false;

    globalThis.fetch = async () => {
      let chunkSent = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!chunkSent) {
            chunkSent = true;
            controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Một nửa "}\n\n'));
          } else {
            controller.enqueue(encoder.encode('event: delta\ndata: {"text":"bị bỏ qua"}\n\n'));
            controller.close();
          }
        },
        cancel() {
          readerCancelled = true;
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    };

    const abortedDeltas: string[] = [];
    let abortedDoneCalled = false;
    const abortedResult = await sendAiChatStream(
      { message: 'Dừng giữa chừng' },
      {
        onDelta: ({ text }) => {
          abortedDeltas.push(text);
          abortController.abort();
        },
        onDone: () => {
          abortedDoneCalled = true;
        },
      },
      abortController.signal,
    );

    assert.equal(readerCancelled, true);
    assert.deepEqual(abortedDeltas, ['Một nửa ']);
    assert.equal(abortedDoneCalled, false);
    assert.equal(abortedResult, null);
  });

  it('mergeResolvedActionsIntoChatResponse preserves mid-stream EXECUTED, CANCELLED, and FAILED action states when done arrives with PENDING snapshots', () => {
    const pending1 = makeCreateAction({ id: 501, messageId: 90, status: 'PENDING' });
    const pending2 = makeUpdateAction({ id: 502, messageId: 90, status: 'PENDING' });
    const pending3 = makeCreateAction({ id: 503, messageId: 90, status: 'PENDING' });

    const donePayload: SendAiChatResponse = {
      conversationId: 10,
      userMessage: {
        id: 89,
        conversationId: 10,
        role: 'USER',
        content: 'Xử lý việc',
        toolCallsSummary: null,
        pendingActions: [],
        createdAt: '2026-11-19T10:00:00.000Z',
      },
      assistantMessage: {
        id: 90,
        conversationId: 10,
        role: 'ASSISTANT',
        content: 'Đã chuẩn bị đề xuất',
        toolCallsSummary: null,
        pendingActions: [pending1, pending2, pending3],
        createdAt: '2026-11-19T10:00:01.000Z',
      },
      pendingActions: [pending1, pending2, pending3],
    };

    const resolvedMap = new Map<number, AiPendingActionItem>([
      [
        501,
        {
          ...pending1,
          messageId: null,
          status: 'EXECUTED',
          executedTaskId: 777,
          confirmedAt: '2026-11-19T10:00:00.500Z',
        },
      ],
      [
        503,
        {
          ...pending3,
          messageId: null,
          status: 'FAILED',
          errorMessage: 'Công việc không tồn tại',
        },
      ],
    ]);

    const merged = mergeResolvedActionsIntoChatResponse(donePayload, resolvedMap);

    assert.notEqual(merged, donePayload);
    assert.equal(merged.assistantMessage.pendingActions[0].status, 'EXECUTED');
    assert.equal(merged.assistantMessage.pendingActions[0].executedTaskId, 777);
    assert.equal(merged.assistantMessage.pendingActions[0].messageId, 90);
    assert.equal(merged.assistantMessage.pendingActions[1].status, 'PENDING');
    assert.equal(merged.assistantMessage.pendingActions[2].status, 'FAILED');
    assert.equal(merged.assistantMessage.pendingActions[2].errorMessage, 'Công việc không tồn tại');
    assert.equal(merged.pendingActions[0].status, 'EXECUTED');
    assert.equal(merged.pendingActions[2].status, 'FAILED');
    assert.equal(donePayload.assistantMessage.pendingActions[0].status, 'PENDING');
  });

  it('parseAiInlineMarkdown and parseAiMarkdownBlocks parse bold, italic, code, and lists cleanly', () => {
    const inline = parseAiInlineMarkdown('Bấm **"Xác nhận"** để tạo `task_1` *ngay*.');
    assert.deepEqual(inline, [
      { type: 'text', text: 'Bấm ' },
      { type: 'bold', text: '"Xác nhận"' },
      { type: 'text', text: ' để tạo ' },
      { type: 'code', text: 'task_1' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'ngay' },
      { type: 'text', text: '.' },
    ]);

    const blocks = parseAiMarkdownBlocks(
      '- **Công việc:** Báo cáo tuần\n- **Ưu tiên:** Cao\n\nVui lòng kiểm tra thẻ bên dưới.',
    );
    assert.deepEqual(blocks, [
      {
        type: 'ul',
        items: ['**Công việc:** Báo cáo tuần', '**Ưu tiên:** Cao'],
      },
      {
        type: 'paragraph',
        lines: ['Vui lòng kiểm tra thẻ bên dưới.'],
      },
    ]);
  });
});
