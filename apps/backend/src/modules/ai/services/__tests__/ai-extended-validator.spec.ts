import { NotFoundException } from '@nestjs/common';
import { CollaboratorStatus, TaskPriority, TaskStatus, TeamRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPolicyService } from '../../../tasks/policies/task-policy.service.js';
import { AiExtendedValidatorService } from '../ai-extended-validator.service.js';

function createPrismaMock() {
  return {
    task: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    subtask: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    taskCollaborator: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

function createTaskQueryMock() {
  return {
    findOne: vi.fn(),
  };
}

function makeTeam(overrides?: Partial<{
  id: number;
  name: string;
  ownerId: number;
  owner: { id: number; name: string };
  members: Array<{ userId: number; role: TeamRole; user?: { id: number; name: string } }>;
}>) {
  return {
    id: 10,
    name: 'Nhóm Backend',
    ownerId: 1,
    owner: { id: 1, name: 'Trưởng nhóm' },
    members: [
      { userId: 1, role: TeamRole.ADMIN, user: { id: 1, name: 'Trưởng nhóm' } },
      { userId: 2, role: TeamRole.ADMIN, user: { id: 2, name: 'Quản trị viên' } },
      { userId: 3, role: TeamRole.MEMBER, user: { id: 3, name: 'Thành viên A' } },
      { userId: 4, role: TeamRole.MEMBER, user: { id: 4, name: 'Thành viên B' } },
    ],
    ...overrides,
  };
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    id: 100,
    userId: 1,
    title: 'Viết API AI',
    description: 'Mô tả ban đầu',
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    position: 0,
    startDate: null,
    dueDate: null,
    categoryId: null,
    category: null,
    teamId: 10,
    team: makeTeam(),
    assigneeId: 3,
    assignee: { id: 3, name: 'Thành viên A', email: 'a@example.com' },
    collaborators: [],
    subtasks: [],
    deletedAt: null,
    deletedById: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSubtask(overrides?: Record<string, unknown>) {
  return {
    id: 200,
    taskId: 100,
    title: 'Subtask mẫu',
    description: 'Chi tiết subtask',
    status: TaskStatus.TODO,
    position: 0,
    assigneeId: 3,
    assignee: { id: 3, name: 'Thành viên A' },
    createdById: 1,
    completedById: null,
    completedAt: null,
    deletedAt: null,
    deletedWithTask: false,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AiExtendedValidatorService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let taskQueryService: ReturnType<typeof createTaskQueryMock>;
  let policy: TaskPolicyService;
  let validator: AiExtendedValidatorService;

  beforeEach(() => {
    prisma = createPrismaMock();
    taskQueryService = createTaskQueryMock();
    policy = new TaskPolicyService();
    validator = new AiExtendedValidatorService(
      prisma as never,
      taskQueryService as never,
      policy,
    );
  });

  describe('validateDeleteTaskProposal', () => {
    it('rejects invalid taskId with BAD_REQUEST', async () => {
      const res = await validator.validateDeleteTaskProposal(1, { taskId: 0 });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: expect.any(String),
      });
    });

    it('masks outsider or missing task as NOT_FOUND', async () => {
      taskQueryService.findOne.mockRejectedValueOnce(
        new NotFoundException('Không tìm thấy công việc với mã #100'),
      );

      const res = await validator.validateDeleteTaskProposal(999, { taskId: 100 });
      expect(res).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy công việc với mã #100',
      });
    });

    it('forbids regular MEMBER non-creator assignee from deleting a team task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));

      const res = await validator.validateDeleteTaskProposal(3, { taskId: 100 });
      expect(res).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền xóa công việc này',
      });
    });

    it('allows ADMIN, owner, or creator to delete task and counts active subtasks', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 3 }));
      prisma.subtask.count.mockResolvedValueOnce(4);

      const res = await validator.validateDeleteTaskProposal(2, { taskId: 100 });
      expect(prisma.subtask.count).toHaveBeenCalledWith({
        where: { taskId: 100, deletedAt: null },
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'DELETE_TASK',
        payload: { taskId: 100 },
        preview: {
          kind: 'DELETE_TASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          teamName: 'Nhóm Backend',
          subtaskCount: 4,
        },
      });
    });
  });

  describe('validateRestoreTaskProposal', () => {
    it('masks outsider or missing deleted task as NOT_FOUND using includeDeleted', async () => {
      taskQueryService.findOne.mockRejectedValueOnce(
        new NotFoundException('Không tìm thấy công việc với mã #100'),
      );

      const res = await validator.validateRestoreTaskProposal(999, { taskId: 100 });
      expect(taskQueryService.findOne).toHaveBeenCalledWith(100, 999, undefined, {
        includeDeleted: true,
      });
      expect(res).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy công việc với mã #100',
      });
    });

    it('rejects active (not deleted) task with BAD_REQUEST', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ deletedAt: null }));

      const res = await validator.validateRestoreTaskProposal(1, { taskId: 100 });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Công việc này chưa bị xóa, không thể khôi phục',
      });
    });

    it('forbids regular MEMBER (even if creator) from restoring a team task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 3, deletedAt: new Date('2026-11-10T00:00:00.000Z') }),
      );

      const res = await validator.validateRestoreTaskProposal(3, { taskId: 100 });
      expect(res).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền khôi phục công việc này',
      });
    });

    it('rejects restore with CONFLICT when an active task in the same scope has the same title', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ deletedAt: new Date('2026-11-10T00:00:00.000Z') }),
      );
      prisma.task.findFirst.mockResolvedValueOnce({ id: 101, title: 'Viết API AI' });

      const res = await validator.validateRestoreTaskProposal(2, { taskId: 100 });
      expect(res).toEqual({
        ok: false,
        code: 'CONFLICT',
        reason: expect.stringContaining('Viết API AI'),
      });
    });

    it('allows personal creator or team ADMIN/owner to restore deleted task with unique title', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({
          teamId: null,
          team: null,
          userId: 3,
          deletedAt: new Date('2026-11-10T00:00:00.000Z'),
        }),
      );
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await validator.validateRestoreTaskProposal(3, { taskId: 100 });
      expect(res).toEqual({
        ok: true,
        actionType: 'RESTORE_TASK',
        payload: { taskId: 100 },
        preview: {
          kind: 'RESTORE_TASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          teamName: null,
        },
      });
    });
  });

  describe('validateReturnTaskProposal', () => {
    it('rejects empty or >500-char reason with BAD_REQUEST', async () => {
      const emptyRes = await validator.validateReturnTaskProposal(3, {
        taskId: 100,
        reason: '   ',
      });
      expect(emptyRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Vui lòng nhập lý do trả lại công việc',
      });

      const longRes = await validator.validateReturnTaskProposal(3, {
        taskId: 100,
        reason: 'a'.repeat(501),
      });
      expect(longRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Lý do trả lại không được vượt quá 500 ký tự',
      });
    });

    it('rejects personal task and DONE task with BAD_REQUEST', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ teamId: null, team: null }));
      const personalRes = await validator.validateReturnTaskProposal(3, {
        taskId: 100,
        reason: 'Không đủ thông tin',
      });
      expect(personalRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Công việc cá nhân không thể thực hiện thao tác trả về',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ status: TaskStatus.DONE }));
      const doneRes = await validator.validateReturnTaskProposal(3, {
        taskId: 100,
        reason: 'Không đủ thông tin',
      });
      expect(doneRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Không thể trả lại công việc đã hoàn thành',
      });
    });

    it('forbids creator-assignee or non-assignee from returning task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 1 }));
      const selfCreatedRes = await validator.validateReturnTaskProposal(1, {
        taskId: 100,
        reason: 'Lý do hợp lệ',
      });
      expect(selfCreatedRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ người đang được phân công mới có quyền trả lại công việc',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));
      const nonAssigneeRes = await validator.validateReturnTaskProposal(2, {
        taskId: 100,
        reason: 'Lý do hợp lệ',
      });
      expect(nonAssigneeRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ người đang được phân công mới có quyền trả lại công việc',
      });
    });

    it('accepts valid return by team assignee who is not the creator', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));

      const res = await validator.validateReturnTaskProposal(3, {
        taskId: 100,
        reason: '  Cần làm rõ thêm scope  ',
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'RETURN_TASK',
        payload: { taskId: 100, reason: 'Cần làm rõ thêm scope' },
        preview: {
          kind: 'RETURN_TASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          teamName: 'Nhóm Backend',
          reason: 'Cần làm rõ thêm scope',
        },
      });
    });
  });

  describe('validateCreateSubtaskProposal', () => {
    it('rejects invalid title (<2 or >255 chars) with BAD_REQUEST', async () => {
      const shortRes = await validator.validateCreateSubtaskProposal(1, {
        taskId: 100,
        title: ' A ',
      });
      expect(shortRes.ok).toBe(false);
      if (!shortRes.ok) expect(shortRes.code).toBe('BAD_REQUEST');

      const longRes = await validator.validateCreateSubtaskProposal(1, {
        taskId: 100,
        title: 'a'.repeat(256),
      });
      expect(longRes.ok).toBe(false);
      if (!longRes.ok) expect(longRes.code).toBe('BAD_REQUEST');
    });

    it('forbids non-manager collaborator from creating subtask and blocks DONE parent task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({
          userId: 1,
          assigneeId: 3,
          collaborators: [{ userId: 4, status: CollaboratorStatus.ACCEPTED }],
        }),
      );
      const forbidRes = await validator.validateCreateSubtaskProposal(4, {
        taskId: 100,
        title: 'Tạo subtask',
      });
      expect(forbidRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền tạo công việc con cho công việc này',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ status: TaskStatus.DONE }));
      const doneRes = await validator.validateCreateSubtaskProposal(1, {
        taskId: 100,
        title: 'Tạo subtask',
      });
      expect(doneRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể thêm công việc con vào công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      });
    });

    it('rejects ineligible subtask assignee (not main assignee and not ACCEPTED collaborator)', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ assigneeId: 3 }));
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce(null);

      const res = await validator.validateCreateSubtaskProposal(1, {
        taskId: 100,
        title: 'Viết unit test',
        assigneeId: 4,
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Người được giao công việc con phải là người phụ trách chính hoặc người phối hợp đã chấp nhận lời mời',
      });
    });

    it('rejects ACCEPTED collaborator who is no longer a team member on team task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ assigneeId: 3 }));
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 99,
        status: CollaboratorStatus.ACCEPTED,
      });

      const res = await validator.validateCreateSubtaskProposal(1, {
        taskId: 100,
        title: 'Viết unit test',
        assigneeId: 99,
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Người được giao không còn là thành viên của nhóm',
      });
    });

    it('accepts valid subtask creation assigned to ACCEPTED team collaborator and resolves assignee preview', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ assigneeId: 3 }));
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });

      const res = await validator.validateCreateSubtaskProposal(3, {
        taskId: 100,
        title: '  Viết unit test  ',
        description: '  Bao phủ RBAC  ',
        assigneeId: 4,
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'CREATE_SUBTASK',
        payload: {
          taskId: 100,
          title: 'Viết unit test',
          description: 'Bao phủ RBAC',
          assigneeId: 4,
        },
        preview: {
          kind: 'CREATE_SUBTASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          title: 'Viết unit test',
          description: 'Bao phủ RBAC',
          assignee: { id: 4, name: 'Thành viên B' },
        },
      });
    });
  });

  describe('validateUpdateSubtaskProposal', () => {
    it('rejects empty update fields or missing subtask', async () => {
      const emptyRes = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
      });
      expect(emptyRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Vui lòng cung cấp ít nhất một thông tin cần cập nhật',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.subtask.findFirst.mockResolvedValueOnce(null);
      const missingRes = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
        title: 'Cập nhật',
      });
      expect(missingRes).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy công việc con',
      });
    });

    it('enforces parent DONE lock on content modifications and non-DONE status transitions', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ status: TaskStatus.DONE }));
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ status: TaskStatus.DONE }));
      const contentOnDone = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
        title: 'Sửa tiêu đề',
      });
      expect(contentOnDone).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể chỉnh sửa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ status: TaskStatus.DONE }));
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ status: TaskStatus.DONE }));
      const reopenOnDone = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
        status: 'IN_PROGRESS',
      });
      expect(reopenOnDone).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể đổi công việc con thành chưa hoàn thành khi công việc chính đang ở trạng thái hoàn thành. Hãy mở lại công việc chính trước.',
      });
    });

    it('enforces universal no-skip TODO -> DONE invariant even for managers', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ status: TaskStatus.TODO }));

      const res = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
        status: 'DONE',
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể chuyển công việc con trực tiếp từ Cần làm sang Hoàn thành (TODO -> DONE). Phải chuyển sang Đang làm (TODO -> IN_PROGRESS) trước.',
      });
    });

    it('enforces Collaborator RBAC and forward-only workflow (TODO -> IN_PROGRESS -> DONE)', async () => {
      // Unassigned or non-ACCEPTED collaborator cannot update status
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ assigneeId: 4 }));
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce(null);

      const notAcceptedRes = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        status: 'IN_PROGRESS',
      });
      expect(notAcceptedRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền thay đổi trạng thái công việc con này',
      });

      // Assigned ACCEPTED collaborator cannot edit title
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ assigneeId: 4 }));
      const editContentRes = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        title: 'Sửa lén',
      });
      expect(editContentRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền chỉnh sửa nội dung hoặc người thực hiện của công việc con',
      });

      // Assigned ACCEPTED collaborator can do TODO -> IN_PROGRESS
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));
      prisma.subtask.findFirst.mockResolvedValueOnce(
        makeSubtask({ assigneeId: 4, status: TaskStatus.TODO }),
      );
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });
      const validCollabStep1 = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        status: 'IN_PROGRESS',
      });
      expect(validCollabStep1.ok).toBe(true);

      // Assigned ACCEPTED collaborator cannot revert IN_PROGRESS -> TODO
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1, assigneeId: 3 }));
      prisma.subtask.findFirst.mockResolvedValueOnce(
        makeSubtask({ assigneeId: 4, status: TaskStatus.IN_PROGRESS }),
      );
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });
      const revertRes = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        status: 'TODO',
      });
      expect(revertRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Người phối hợp chỉ có thể chuyển công việc con từ Đang làm sang Hoàn thành (IN_PROGRESS -> DONE)',
      });
    });

    it('rejects collaborator when subtask is already DONE (BAD_REQUEST) and allows IN_PROGRESS -> DONE (ok: true)', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.IN_PROGRESS }),
      );
      prisma.subtask.findFirst.mockResolvedValueOnce(
        makeSubtask({ assigneeId: 4, status: TaskStatus.DONE }),
      );
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });

      const doneSubtaskRes = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        status: 'IN_PROGRESS',
      });
      expect(doneSubtaskRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể thay đổi trạng thái công việc con đã hoàn thành. Hãy nhờ người quản lý mở lại nếu cần.',
      });

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.IN_PROGRESS }),
      );
      prisma.subtask.findFirst.mockResolvedValueOnce(
        makeSubtask({
          title: 'Hoàn tất API',
          assigneeId: 4,
          status: TaskStatus.IN_PROGRESS,
        }),
      );
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });

      const completeStepRes = await validator.validateUpdateSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
        status: 'DONE',
      });
      expect(completeStepRes).toEqual({
        ok: true,
        actionType: 'UPDATE_SUBTASK',
        payload: {
          taskId: 100,
          subtaskId: 200,
          status: 'DONE',
        },
        preview: {
          kind: 'UPDATE_SUBTASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          subtaskId: 200,
          subtaskTitle: 'Hoàn tất API',
          changes: [
            {
              field: 'status',
              label: 'Trạng thái',
              before: 'Đang làm',
              after: 'Hoàn thành',
            },
          ],
        },
      });
    });

    it('builds Vietnamese diff changes for valid manager subtask update', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ assigneeId: 3 }));
      prisma.subtask.findFirst.mockResolvedValueOnce(
        makeSubtask({
          title: 'Tiêu đề cũ',
          description: 'Mô tả cũ',
          status: TaskStatus.TODO,
          assigneeId: 3,
          assignee: { id: 3, name: 'Thành viên A' },
        }),
      );
      prisma.taskCollaborator.findFirst.mockResolvedValueOnce({
        id: 1,
        taskId: 100,
        userId: 4,
        status: CollaboratorStatus.ACCEPTED,
      });

      const res = await validator.validateUpdateSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
        title: 'Tiêu đề mới',
        description: null,
        status: 'IN_PROGRESS',
        assigneeId: 4,
      });

      expect(res).toEqual({
        ok: true,
        actionType: 'UPDATE_SUBTASK',
        payload: {
          taskId: 100,
          subtaskId: 200,
          title: 'Tiêu đề mới',
          description: null,
          status: 'IN_PROGRESS',
          assigneeId: 4,
        },
        preview: {
          kind: 'UPDATE_SUBTASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          subtaskId: 200,
          subtaskTitle: 'Tiêu đề cũ',
          changes: [
            { field: 'title', label: 'Tiêu đề', before: 'Tiêu đề cũ', after: 'Tiêu đề mới' },
            { field: 'description', label: 'Mô tả', before: 'Mô tả cũ', after: null },
            { field: 'status', label: 'Trạng thái', before: 'Cần làm', after: 'Đang làm' },
            {
              field: 'assigneeId',
              label: 'Người thực hiện',
              before: 'Thành viên A',
              after: 'Thành viên B',
            },
          ],
        },
      });
    });
  });

  describe('validateDeleteSubtaskProposal', () => {
    it('blocks deleting subtask when parent task is DONE', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ status: TaskStatus.DONE }));

      const res = await validator.validateDeleteSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
      });
      expect(res).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể xóa công việc con khi công việc chính đã hoàn thành. Hãy mở lại công việc chính trước.',
      });
    });

    it('forbids collaborator from deleting subtask and returns NOT_FOUND when subtask missing', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({
          userId: 1,
          assigneeId: 3,
          collaborators: [{ userId: 4, status: CollaboratorStatus.ACCEPTED }],
        }),
      );
      const forbidRes = await validator.validateDeleteSubtaskProposal(4, {
        taskId: 100,
        subtaskId: 200,
      });
      expect(forbidRes).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền xóa công việc con này',
      });

      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.subtask.findFirst.mockResolvedValueOnce(null);
      const missingRes = await validator.validateDeleteSubtaskProposal(1, {
        taskId: 100,
        subtaskId: 200,
      });
      expect(missingRes).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy công việc con',
      });
    });

    it('accepts valid subtask deletion by manager', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.subtask.findFirst.mockResolvedValueOnce(makeSubtask({ title: 'Subtask cần xóa' }));

      const res = await validator.validateDeleteSubtaskProposal(3, {
        taskId: 100,
        subtaskId: 200,
      });
      expect(res).toEqual({
        ok: true,
        actionType: 'DELETE_SUBTASK',
        payload: { taskId: 100, subtaskId: 200 },
        preview: {
          kind: 'DELETE_SUBTASK',
          taskId: 100,
          taskTitle: 'Viết API AI',
          subtaskId: 200,
          subtaskTitle: 'Subtask cần xóa',
        },
      });
    });
  });
});
