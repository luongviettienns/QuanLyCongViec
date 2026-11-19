import { NotFoundException } from '@nestjs/common';
import { TaskPriority, TaskStatus, TeamRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskPolicyService } from '../../../tasks/policies/task-policy.service.js';
import { TaskWorkflowPolicy } from '../../../tasks/policies/task-workflow-policy.service.js';
import { AiTaskValidatorService } from '../ai-task-validator.service.js';

function createPrismaMock() {
  return {
    task: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    team: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    category: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    subtask: {
      count: vi.fn().mockResolvedValue(0),
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
    startDate: new Date('2026-11-01T00:00:00.000Z'),
    dueDate: new Date('2026-11-10T00:00:00.000Z'),
    categoryId: 5,
    category: { id: 5, name: 'Backend' },
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

describe('AiTaskValidatorService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let taskQueryService: ReturnType<typeof createTaskQueryMock>;
  let policy: TaskPolicyService;
  let workflowPolicy: TaskWorkflowPolicy;
  let validator: AiTaskValidatorService;

  beforeEach(() => {
    prisma = createPrismaMock();
    taskQueryService = createTaskQueryMock();
    policy = new TaskPolicyService();
    workflowPolicy = new TaskWorkflowPolicy(policy);
    validator = new AiTaskValidatorService(
      prisma as never,
      taskQueryService as never,
      policy,
      workflowPolicy,
    );
  });

  describe('validateCreateTaskProposal - personal tasks', () => {
    it('rejects whitespace-padded title shorter than 3 characters', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: '  ab  ',
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: expect.stringContaining('3'),
      });
    });

    it('rejects title longer than 100 characters', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: 'a'.repeat(101),
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: expect.stringContaining('100'),
      });
    });

    it('rejects invalid calendar date like 2026-02-30', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc hợp lệ',
        dueDate: '2026-02-30',
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Ngày không hợp lệ trong lịch',
      });
    });

    it('rejects when startDate > dueDate', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc hợp lệ',
        startDate: '2026-11-20',
        dueDate: '2026-11-10',
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Ngày bắt đầu không được lớn hơn hạn chót (deadline)',
      });
    });

    it('rejects assigneeId !== userId on personal task', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Việc cá nhân',
        assigneeId: 2,
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Công việc cá nhân chỉ có thể phân công cho chính bạn',
      });
    });

    it('rejects non-empty collaboratorIds on personal task', async () => {
      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Việc cá nhân',
        collaboratorIds: [2],
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Chỉ có thể mời người phối hợp cho công việc thuộc nhóm làm việc',
      });
    });

    it('rejects duplicate title (case-insensitive) in personal scope with CONFLICT', async () => {
      prisma.task.findFirst.mockResolvedValueOnce({ id: 9, title: 'Học TypeScript' });

      const result = await validator.validateCreateTaskProposal(1, {
        title: '  Học TypeScript  ',
      });

      expect(result).toEqual({
        ok: false,
        code: 'CONFLICT',
        reason: expect.stringContaining('Học TypeScript'),
      });
    });

    it('rejects personal category not owned by userId with NOT_FOUND', async () => {
      prisma.category.findFirst.mockResolvedValueOnce(null);

      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Việc cá nhân',
        categoryId: 99,
      });

      expect(result).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: expect.stringContaining('#99'),
      });
    });

    it('accepts valid personal task and resolves preview labels', async () => {
      prisma.category.findFirst.mockResolvedValueOnce({ id: 5, name: 'Cá nhân', teamId: null, userId: 1 });
      prisma.category.findUnique.mockResolvedValueOnce({ id: 5, name: 'Cá nhân' });
      prisma.user.findUnique.mockResolvedValueOnce({ id: 1, name: 'Minh' });

      const result = await validator.validateCreateTaskProposal(1, {
        title: '  Ôn tập thuật toán  ',
        description: '  Làm 5 bài graph  ',
        priority: 'HIGH',
        status: 'TODO',
        startDate: '2026-11-19',
        dueDate: '2026-11-22',
        categoryId: 5,
        assigneeId: 1,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.actionType).toBe('CREATE_TASK');
      expect(result.payload).toEqual({
        title: 'Ôn tập thuật toán',
        description: 'Làm 5 bài graph',
        status: 'TODO',
        priority: 'HIGH',
        startDate: '2026-11-19',
        dueDate: '2026-11-22',
        categoryId: 5,
        assigneeId: 1,
      });
      expect(result.preview).toEqual({
        kind: 'CREATE_TASK',
        title: 'Ôn tập thuật toán',
        description: 'Làm 5 bài graph',
        status: 'TODO',
        priority: 'HIGH',
        startDate: '2026-11-19',
        dueDate: '2026-11-22',
        team: null,
        assignee: { id: 1, name: 'Minh' },
        category: { id: 5, name: 'Cá nhân' },
        collaborators: [],
      });
    });
  });

  describe('validateCreateTaskProposal - team tasks', () => {
    it('returns NOT_FOUND when caller is not a member of teamId (outsider mask)', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const result = await validator.validateCreateTaskProposal(999, {
        title: 'Công việc nhóm',
        teamId: 10,
      });

      expect(result).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });
    });

    it('rejects non-member assigneeId with BAD_REQUEST', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());

      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc nhóm',
        teamId: 10,
        assigneeId: 999,
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Người được phân công không thuộc nhóm này',
      });
    });

    it('rejects collaboratorIds containing self, assigneeId, or non-member', async () => {
      prisma.team.findUnique.mockResolvedValue(makeTeam());

      const selfRes = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc nhóm',
        teamId: 10,
        collaboratorIds: [1],
      });
      expect(selfRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Không thể tự mời chính mình làm người phối hợp',
      });

      const assigneeRes = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc nhóm',
        teamId: 10,
        assigneeId: 3,
        collaboratorIds: [3],
      });
      expect(assigneeRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Người này đang là người phụ trách chính của công việc',
      });

      const outsiderCollabRes = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc nhóm',
        teamId: 10,
        collaboratorIds: [888],
      });
      expect(outsiderCollabRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Người được mời không phải là thành viên trong nhóm',
      });
    });

    it('rejects categoryId that does not belong to target team', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.category.findFirst.mockResolvedValueOnce(null);

      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Công việc nhóm',
        teamId: 10,
        categoryId: 77,
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Danh mục #77 không thuộc nhóm này',
      });
    });

    it('accepts valid team task with deduplicated collaborators and team category', async () => {
      prisma.team.findUnique.mockResolvedValueOnce(makeTeam());
      prisma.category.findFirst.mockResolvedValueOnce({ id: 20, name: 'API', teamId: 10 });
      prisma.category.findUnique.mockResolvedValueOnce({ id: 20, name: 'API' });

      const result = await validator.validateCreateTaskProposal(1, {
        title: 'Thiết kế schema AI',
        teamId: 10,
        assigneeId: 3,
        collaboratorIds: [4, 4],
        categoryId: 20,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.payload).toMatchObject({
        title: 'Thiết kế schema AI',
        teamId: 10,
        assigneeId: 3,
        collaboratorIds: [4],
        categoryId: 20,
      });
      expect(result.preview).toMatchObject({
        kind: 'CREATE_TASK',
        team: { id: 10, name: 'Nhóm Backend' },
        assignee: { id: 3, name: 'Thành viên A' },
        category: { id: 20, name: 'API' },
        collaborators: [{ id: 4, name: 'Thành viên B' }],
      });
    });
  });

  describe('validateUpdateTaskProposal - visibility & RBAC matrix', () => {
    it('rejects invalid taskId or empty update payload', async () => {
      const badId = await validator.validateUpdateTaskProposal(1, { taskId: 0, title: 'ABC' });
      expect(badId.ok).toBe(false);
      if (!badId.ok) expect(badId.code).toBe('BAD_REQUEST');

      const emptyFields = await validator.validateUpdateTaskProposal(1, { taskId: 100 });
      expect(emptyFields.ok).toBe(false);
      if (!emptyFields.ok) expect(emptyFields.code).toBe('BAD_REQUEST');
    });

    it('masks outsider / non-existent task as NOT_FOUND', async () => {
      taskQueryService.findOne.mockRejectedValueOnce(
        new NotFoundException('Không tìm thấy công việc với mã #100'),
      );

      const result = await validator.validateUpdateTaskProposal(999, {
        taskId: 100,
        title: 'Hack title',
      });

      expect(result).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy công việc với mã #100',
      });
    });

    it('forbids regular MEMBER assignee (non-creator) from editing content, assignee, or team', async () => {
      // User 3 is MEMBER + assignee, user 1 is creator
      taskQueryService.findOne.mockResolvedValue(makeTask({ userId: 1, assigneeId: 3 }));

      for (const patch of [
        { title: 'Tiêu đề mới' },
        { dueDate: '2026-11-25' },
        { priority: 'HIGH' },
        { categoryId: 5 },
        { teamId: null },
        { assigneeId: 4 },
      ]) {
        const res = await validator.validateUpdateTaskProposal(3, {
          taskId: 100,
          ...patch,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe('FORBIDDEN');
        }
      }
    });

    it('allows regular MEMBER assignee forward transitions (TODO -> IN_PROGRESS, IN_PROGRESS -> DONE) and blocks invalid ones', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.TODO }),
      );
      const todoToInProgress = await validator.validateUpdateTaskProposal(3, {
        taskId: 100,
        status: 'IN_PROGRESS',
      });
      expect(todoToInProgress.ok).toBe(true);

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.IN_PROGRESS }),
      );
      const inProgressToDone = await validator.validateUpdateTaskProposal(3, {
        taskId: 100,
        status: 'DONE',
      });
      expect(inProgressToDone.ok).toBe(true);

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.TODO }),
      );
      const todoToDone = await validator.validateUpdateTaskProposal(3, {
        taskId: 100,
        status: 'DONE',
      });
      expect(todoToDone).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền thay đổi trạng thái công việc này',
      });

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.DONE }),
      );
      const reopenDone = await validator.validateUpdateTaskProposal(3, {
        taskId: 100,
        status: 'IN_PROGRESS',
      });
      expect(reopenDone).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền thay đổi trạng thái công việc này',
      });
    });

    it('forbids collaborator (non-assignee, non-creator, non-admin/owner) from status or content changes', async () => {
      // User 4 is MEMBER and only a collaborator
      taskQueryService.findOne.mockResolvedValue(
        makeTask({
          userId: 1,
          assigneeId: 3,
          collaborators: [{ userId: 4, status: 'ACCEPTED' }],
        }),
      );

      const statusRes = await validator.validateUpdateTaskProposal(4, {
        taskId: 100,
        status: 'IN_PROGRESS',
      });
      expect(statusRes.ok).toBe(false);
      if (!statusRes.ok) expect(statusRes.code).toBe('FORBIDDEN');

      const contentRes = await validator.validateUpdateTaskProposal(4, {
        taskId: 100,
        title: 'Sửa tiêu đề',
      });
      expect(contentRes.ok).toBe(false);
      if (!contentRes.ok) expect(contentRes.code).toBe('FORBIDDEN');
    });

    it('forbids non-creator personal assignee from editing or changing status', async () => {
      taskQueryService.findOne.mockResolvedValue(
        makeTask({
          teamId: null,
          team: null,
          userId: 1,
          assigneeId: 3,
        }),
      );

      const statusRes = await validator.validateUpdateTaskProposal(3, {
        taskId: 100,
        status: 'IN_PROGRESS',
      });
      expect(statusRes.ok).toBe(false);
      if (!statusRes.ok) expect(statusRes.code).toBe('FORBIDDEN');
    });

    it('blocks content edit on DONE task without reopening, but allows reopening + content edit together for ADMIN/OWNER/CREATOR', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.DONE }),
      );
      const editDoneWithoutReopen = await validator.validateUpdateTaskProposal(2, {
        taskId: 100,
        title: 'Sửa khi đã xong',
      });
      expect(editDoneWithoutReopen).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể chỉnh sửa nội dung công việc đã hoàn thành. Vui lòng mở lại công việc trước khi chỉnh sửa.',
      });

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.DONE }),
      );
      const reopenAndEditTitle = await validator.validateUpdateTaskProposal(2, {
        taskId: 100,
        status: 'IN_PROGRESS',
        title: 'Mở lại và sửa tiêu đề',
      });
      expect(reopenAndEditTitle.ok).toBe(true);
    });

    it('blocks changing assigneeId on DONE task even when reopening (matches TasksService.update Step 1 order)', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.DONE, assigneeId: 3 }),
      );
      const withoutTeamRes = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        status: 'IN_PROGRESS',
        assigneeId: 4,
      });
      expect(withoutTeamRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể thay đổi người thực hiện khi công việc đã hoàn thành. Vui lòng mở lại công việc trước khi phân công lại.',
      });

      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.DONE, assigneeId: 3 }),
      );
      const withTeamRes = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        teamId: 10,
        assigneeId: 4,
      });
      expect(withTeamRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Không thể thay đổi người thực hiện khi công việc đã hoàn thành',
      });
    });

    it('rejects DONE task + unchanged assigneeId without teamId with BAD_REQUEST (TaskAssignmentService parity)', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.DONE, assigneeId: 3 }),
      );
      const unchangedAssigneeRes = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        assigneeId: 3,
      });
      expect(unchangedAssigneeRes).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể thay đổi người thực hiện khi công việc đã hoàn thành. Vui lòng mở lại công việc trước khi phân công lại.',
      });
    });

    it('blocks transitioning to DONE when unfinished subtasks exist', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ status: TaskStatus.IN_PROGRESS }),
      );
      prisma.subtask.count.mockResolvedValueOnce(2);

      const result = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        status: 'DONE',
      });

      expect(result).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason:
          'Không thể chuyển công việc chính sang hoàn thành khi vẫn còn công việc con chưa hoàn thành',
      });
    });
  });

  describe('validateUpdateTaskProposal - dates, scope transfer & preview diff', () => {
    it('rejects invalid date or startDate > current dueDate when merging unchanged side', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      const badDate = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        dueDate: '2026-02-30',
      });
      expect(badDate).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Ngày không hợp lệ trong lịch',
      });

      // current startDate is 2026-11-01, current dueDate is 2026-11-10
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      const badRange = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        startDate: '2026-11-15',
      });
      expect(badRange).toEqual({
        ok: false,
        code: 'BAD_REQUEST',
        reason: 'Ngày bắt đầu không được lớn hơn hạn chót (deadline)',
      });
    });

    it('rejects trimmed title < 3 chars and duplicate title in scope', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      const shortTitle = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        title: '  ab  ',
      });
      expect(shortTitle.ok).toBe(false);
      if (!shortTitle.ok) expect(shortTitle.code).toBe('BAD_REQUEST');

      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.task.findFirst.mockResolvedValueOnce({ id: 101, title: 'Trùng tên' });
      const dupTitle = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        title: 'Trùng tên',
      });
      expect(dupTitle.ok).toBe(false);
      if (!dupTitle.ok) expect(dupTitle.code).toBe('CONFLICT');
    });

    it('validates team transfer: masks non-member target team as NOT_FOUND, checks title conflict & category scope, builds diff preview', async () => {
      // Non-member on target team -> NOT_FOUND
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.team.findUnique.mockResolvedValueOnce(
        makeTeam({
          id: 20,
          name: 'Nhóm Frontend',
          ownerId: 50,
          members: [{ userId: 50, role: TeamRole.ADMIN }],
        }),
      );
      const outsiderTarget = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        teamId: 20,
      });
      expect(outsiderTarget).toEqual({
        ok: false,
        code: 'NOT_FOUND',
        reason: 'Không tìm thấy nhóm',
      });

      // Valid transfer to team 20 with target category 30 & target assignee 2
      const targetTeam = makeTeam({
        id: 20,
        name: 'Nhóm Frontend',
        ownerId: 1,
        members: [
          { userId: 1, role: TeamRole.ADMIN, user: { id: 1, name: 'Trưởng nhóm' } },
          { userId: 2, role: TeamRole.MEMBER, user: { id: 2, name: 'Quản trị viên' } },
        ],
      });
      taskQueryService.findOne.mockResolvedValueOnce(makeTask());
      prisma.team.findUnique.mockResolvedValueOnce(targetTeam);
      prisma.task.findFirst.mockResolvedValueOnce(null);
      prisma.category.findFirst.mockResolvedValueOnce({ id: 30, name: 'UI/UX', teamId: 20 });
      prisma.category.findUnique.mockResolvedValueOnce({ id: 30, name: 'UI/UX' });

      const validMove = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        teamId: 20,
        assigneeId: 2,
        categoryId: 30,
        dueDate: '2026-11-20',
      });

      expect(validMove.ok).toBe(true);
      if (!validMove.ok) return;

      expect(validMove.actionType).toBe('UPDATE_TASK');
      expect(validMove.payload).toEqual({
        taskId: 100,
        teamId: 20,
        assigneeId: 2,
        categoryId: 30,
        dueDate: '2026-11-20',
      });
      expect(validMove.preview).toEqual({
        kind: 'UPDATE_TASK',
        taskId: 100,
        taskTitle: 'Viết API AI',
        changes: [
          {
            field: 'teamId',
            label: 'Nhóm',
            before: 'Nhóm Backend',
            after: 'Nhóm Frontend',
          },
          {
            field: 'assigneeId',
            label: 'Người thực hiện',
            before: 'Thành viên A',
            after: 'Quản trị viên',
          },
          {
            field: 'categoryId',
            label: 'Danh mục',
            before: 'Backend',
            after: 'UI/UX',
          },
          {
            field: 'dueDate',
            label: 'Hạn chót',
            before: '2026-11-10',
            after: '2026-11-20',
          },
        ],
      });
    });

    it('forbids non-creator ADMIN from moving a team task to personal space', async () => {
      // User 2 is ADMIN in team 10, but user 1 is task.userId (creator)
      taskQueryService.findOne.mockResolvedValueOnce(makeTask({ userId: 1 }));

      const res = await validator.validateUpdateTaskProposal(2, {
        taskId: 100,
        teamId: null,
      });

      expect(res).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Chỉ người tạo mới có quyền chuyển công việc về không gian cá nhân',
      });
    });

    it('forbids cross-team transfer + status change when caller is ADMIN in source Team A but only MEMBER (non-creator, non-assignee) in target Team B', async () => {
      // User 2 is ADMIN in Team 10, task creator is user 1, assignee is user 3
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({ userId: 1, assigneeId: 3, status: TaskStatus.TODO }),
      );
      const teamB = makeTeam({
        id: 20,
        name: 'Nhóm B',
        ownerId: 1,
        members: [
          { userId: 1, role: TeamRole.ADMIN, user: { id: 1, name: 'Trưởng nhóm' } },
          { userId: 2, role: TeamRole.MEMBER, user: { id: 2, name: 'Quản trị viên' } },
          { userId: 3, role: TeamRole.MEMBER, user: { id: 3, name: 'Thành viên A' } },
        ],
      });
      prisma.team.findUnique.mockResolvedValueOnce(teamB);
      prisma.task.findFirst.mockResolvedValueOnce(null);

      const res = await validator.validateUpdateTaskProposal(2, {
        taskId: 100,
        teamId: 20,
        status: 'IN_PROGRESS',
      });

      expect(res).toEqual({
        ok: false,
        code: 'FORBIDDEN',
        reason: 'Bạn không có quyền thay đổi trạng thái công việc này',
      });
    });

    it('includes implicit categoryId disconnect in preview.changes when moving team without specifying categoryId on a categorized task', async () => {
      taskQueryService.findOne.mockResolvedValueOnce(
        makeTask({
          categoryId: 5,
          category: { id: 5, name: 'Backend' },
          assigneeId: 1,
          assignee: { id: 1, name: 'Trưởng nhóm', email: 'lead@example.com' },
        }),
      );
      const targetTeam = makeTeam({
        id: 20,
        name: 'Nhóm Frontend',
        ownerId: 1,
        members: [{ userId: 1, role: TeamRole.ADMIN, user: { id: 1, name: 'Trưởng nhóm' } }],
      });
      prisma.team.findUnique.mockResolvedValueOnce(targetTeam);
      prisma.task.findFirst.mockResolvedValueOnce(null);
      prisma.category.findFirst.mockResolvedValueOnce(null);

      const res = await validator.validateUpdateTaskProposal(1, {
        taskId: 100,
        teamId: 20,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.preview).toEqual({
        kind: 'UPDATE_TASK',
        taskId: 100,
        taskTitle: 'Viết API AI',
        changes: [
          {
            field: 'teamId',
            label: 'Nhóm',
            before: 'Nhóm Backend',
            after: 'Nhóm Frontend',
          },
          {
            field: 'categoryId',
            label: 'Danh mục',
            before: 'Backend',
            after: null,
          },
        ],
      });
    });
  });
});
