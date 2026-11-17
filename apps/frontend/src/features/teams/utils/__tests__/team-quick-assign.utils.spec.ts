import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../../types/team.types.ts';
import {
  buildTeamMemberOptions,
  filterQuickAssignCollaboratorOptions,
  stripConflictingCollaborators,
  buildQuickAssignCreatePayload,
  isQuickAssignFormDirty,
} from '../team-quick-assign.utils.ts';

function makeTeam(overrides?: Partial<Team>): Team {
  return {
    id: 7,
    name: 'Phòng Kinh Doanh',
    description: 'Nhóm bán hàng',
    ownerId: 1,
    owner: { id: 1, name: 'Nguyễn Chủ Nhóm', email: 'owner@example.com' },
    members: [
      {
        id: 101,
        teamId: 7,
        userId: 1,
        role: 'ADMIN',
        joinedAt: '2026-11-01T00:00:00.000Z',
        user: { id: 1, name: 'Nguyễn Chủ Nhóm', email: 'owner@example.com' },
      },
      {
        id: 102,
        teamId: 7,
        userId: 2,
        role: 'ADMIN',
        joinedAt: '2026-11-02T00:00:00.000Z',
        user: { id: 2, name: 'Trần Quản Trị', email: 'admin@example.com' },
      },
      {
        id: 103,
        teamId: 7,
        userId: 3,
        role: 'MEMBER',
        joinedAt: '2026-11-03T00:00:00.000Z',
        user: { id: 3, name: 'Lê Thành Viên', email: 'member@example.com' },
      },
    ],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('team-quick-assign.utils', () => {
  describe('buildTeamMemberOptions', () => {
    it('returns empty list when team is null', () => {
      assert.deepEqual(buildTeamMemberOptions(null), []);
    });

    it('merges owner and members without duplicating owner when owner is also in members', () => {
      const options = buildTeamMemberOptions(makeTeam());
      assert.equal(options.length, 3);
      assert.deepEqual(
        options.map((o) => ({ userId: o.userId, isOwner: o.isOwner, role: o.role })),
        [
          { userId: 1, isOwner: true, role: 'OWNER' },
          { userId: 2, isOwner: false, role: 'ADMIN' },
          { userId: 3, isOwner: false, role: 'MEMBER' },
        ],
      );
    });

    it('includes owner even if members array does not contain ownerId', () => {
      const team = makeTeam({
        members: [
          {
            id: 103,
            teamId: 7,
            userId: 3,
            role: 'MEMBER',
            joinedAt: '2026-11-03T00:00:00.000Z',
            user: { id: 3, name: 'Lê Thành Viên', email: 'member@example.com' },
          },
        ],
      });
      const options = buildTeamMemberOptions(team);
      assert.equal(options.length, 2);
      assert.equal(options[0].userId, 1);
      assert.equal(options[0].isOwner, true);
      assert.equal(options[1].userId, 3);
    });
  });

  describe('filterQuickAssignCollaboratorOptions & stripConflictingCollaborators', () => {
    it('excludes primary assigneeId and currentUserId from collaborator choices', () => {
      const all = buildTeamMemberOptions(makeTeam());
      const filtered = filterQuickAssignCollaboratorOptions(all, 2, 1);
      assert.deepEqual(
        filtered.map((o) => o.userId),
        [3],
      );
    });

    it('strips conflicting collaboratorIds when primary assignee changes', () => {
      const cleaned = stripConflictingCollaborators([1, 2, 3], 3, 1);
      assert.deepEqual(cleaned, [2]);
    });
  });

  describe('buildQuickAssignCreatePayload', () => {
    it('builds payload locked to active teamId with trimmed title, assigneeId, and default MEDIUM priority', () => {
      const payload = buildQuickAssignCreatePayload(7, {
        title: '  Hoàn thiện báo cáo tuần  ',
        assigneeId: 3,
      });

      assert.deepEqual(payload, {
        title: 'Hoàn thiện báo cáo tuần',
        teamId: 7,
        assigneeId: 3,
        priority: 'MEDIUM',
        categoryId: null,
        dueDate: null,
      });
    });

    it('includes trimmed description, dueDate string, priority, categoryId, and cleaned collaboratorIds when provided', () => {
      const payload = buildQuickAssignCreatePayload(7, {
        title: 'Kiểm tra KPI',
        assigneeId: 2,
        priority: 'HIGH',
        dueDateStr: '2026-11-25',
        description: '  Kiểm tra số liệu quý IV  ',
        categoryId: 12,
        collaboratorIds: [1, 2, 3, 3],
        currentUserId: 1,
      });

      assert.deepEqual(payload, {
        title: 'Kiểm tra KPI',
        description: 'Kiểm tra số liệu quý IV',
        teamId: 7,
        assigneeId: 2,
        priority: 'HIGH',
        categoryId: 12,
        dueDate: '2026-11-25',
        collaboratorIds: [3],
      });
    });
  });

  describe('isQuickAssignFormDirty', () => {
    it('returns false for untouched default values', () => {
      assert.equal(
        isQuickAssignFormDirty({
          title: '   ',
          priority: 'MEDIUM',
          assigneeId: undefined,
          dueDate: null,
          description: '',
          collaboratorIds: [],
          categoryId: null,
        }),
        false,
      );
    });

    it('returns true if any input is modified', () => {
      assert.equal(isQuickAssignFormDirty({ title: 'Việc mới', priority: 'MEDIUM' }), true);
      assert.equal(isQuickAssignFormDirty({ assigneeId: 2, priority: 'MEDIUM' }), true);
      assert.equal(isQuickAssignFormDirty({ priority: 'HIGH' }), true);
      assert.equal(isQuickAssignFormDirty({ dueDate: '2026-11-20', priority: 'MEDIUM' }), true);
      assert.equal(isQuickAssignFormDirty({ description: 'Chi tiết', priority: 'MEDIUM' }), true);
      assert.equal(isQuickAssignFormDirty({ collaboratorIds: [3], priority: 'MEDIUM' }), true);
      assert.equal(isQuickAssignFormDirty({ categoryId: 5, priority: 'MEDIUM' }), true);
    });
  });
});
