import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, NetworkError } from '../../../../shared/api/api-error.ts';
import type { AiMessageItem, AiPendingActionItem } from '../../types/ai.types.ts';
import {
  applyResolvedActionToList,
  buildAiPreviewFields,
  formatAiActionTitle,
  formatAiRelativeError,
  isAiActionPending,
} from '../ai-chat.utils.ts';

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
});
