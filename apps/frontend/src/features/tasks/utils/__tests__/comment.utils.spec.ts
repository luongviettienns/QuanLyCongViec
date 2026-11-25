import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildMentionableUsers,
  canDeleteTaskComment,
  canEditTaskComment,
  countTotalComments,
  extractMentionedUserIds,
  splitCommentContentSegments,
} from '../comment.utils.ts';
import type { Task, TaskComment } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';

describe('comment.utils', () => {
  const team: Team = {
    id: 10,
    name: 'Nhóm Backend',
    ownerId: 1,
    owner: { id: 1, name: 'Nguyễn Văn', email: 'owner@test.dev' },
    members: [
      {
        id: 101,
        teamId: 10,
        userId: 2,
        role: 'ADMIN',
        joinedAt: '2026-01-01T00:00:00.000Z',
        user: { id: 2, name: 'Nguyễn Văn An', email: 'an@test.dev' },
      },
      {
        id: 102,
        teamId: 10,
        userId: 3,
        role: 'MEMBER',
        joinedAt: '2026-01-01T00:00:00.000Z',
        user: { id: 3, name: 'Trần Bình', email: 'binh@test.dev' },
      },
    ],
  };

  const teamTask: Task = {
    id: 50,
    title: 'Task nhóm',
    status: 'TODO',
    teamId: 10,
    userId: 1,
    assigneeId: 2,
  };

  it('builds deduplicated mentionable candidates excluding current user', () => {
    const candidates = buildMentionableUsers(teamTask, team, 1);
    assert.deepEqual(
      candidates.map((c) => ({ id: c.id, name: c.name, roleLabel: c.roleLabel })),
      [
        { id: 2, name: 'Nguyễn Văn An', roleLabel: 'Quản trị' },
        { id: 3, name: 'Trần Bình', roleLabel: 'Thành viên' },
      ],
    );
  });

  it('extracts longest-matching mentions and drops removed mentions', () => {
    const candidates = buildMentionableUsers(teamTask, team, 3);
    assert.deepEqual(
      extractMentionedUserIds(
        'Nhờ @Nguyễn Văn An kiểm tra giúp nhé!',
        candidates,
        [{ id: 1, name: 'Nguyễn Văn' }], // removed before send
      ),
      [2],
    );

    assert.deepEqual(
      extractMentionedUserIds('Không nên khớp email test@Nguyễn Văn hoặc trống', candidates),
      [],
    );
  });

  it('splits comment text into mention chips and plain text safely', () => {
    const segments = splitCommentContentSegments('Chào @Nguyễn Văn An và @Nguyễn Văn,', [
      { id: 1, name: 'Nguyễn Văn' },
      { id: 2, name: 'Nguyễn Văn An' },
    ]);

    assert.deepEqual(segments, [
      { text: 'Chào ', isMention: false },
      { text: '@Nguyễn Văn An', isMention: true, userId: 2 },
      { text: ' và ', isMention: false },
      { text: '@Nguyễn Văn', isMention: true, userId: 1 },
      { text: ',', isMention: false },
    ]);
  });

  it('counts root + nested replies and enforces edit/delete permissions', () => {
    const reply: TaskComment = {
      id: 2,
      taskId: 50,
      authorId: 3,
      parentId: 1,
      content: 'Đã rõ',
      mentionedUserIds: [],
      mentions: [],
      author: { id: 3, name: 'Trần Bình', email: 'binh@test.dev' },
      createdAt: '2026-11-25T08:00:00.000Z',
      updatedAt: '2026-11-25T08:00:00.000Z',
      replies: [],
    };
    const root: TaskComment = {
      ...reply,
      id: 1,
      parentId: null,
      replies: [reply],
    };

    assert.equal(countTotalComments([root]), 2);
    assert.equal(canEditTaskComment(root, 3), true);
    assert.equal(canEditTaskComment(root, 1), false);
    assert.equal(canDeleteTaskComment(root, 1, teamTask, team), true); // owner
    assert.equal(canDeleteTaskComment(root, 2, teamTask, team), true); // admin
    assert.equal(canDeleteTaskComment(root, 99, teamTask, team), false);
  });
});
