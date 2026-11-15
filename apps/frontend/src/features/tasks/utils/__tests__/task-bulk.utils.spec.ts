import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeBulkSelection,
  summarizeTrashSelection,
} from '../task-bulk.utils.ts';
import type { Task, TrashTask } from '../../types/task.types.ts';
import type { Team } from '../../../teams/types/team.types.ts';
import type { User } from '../../../auth/types/auth.types.ts';

describe('task-bulk.utils', () => {
  const ownerUser: User = { id: 1, email: 'owner@test.com', name: 'Owner', createdAt: '', updatedAt: '' };
  const memberUser: User = { id: 2, email: 'member@test.com', name: 'Member', createdAt: '', updatedAt: '' };
  const team: Team = {
    id: 10,
    name: 'Core Team',
    ownerId: 1,
    owner: { id: 1, name: 'Owner', email: 'owner@test.com' },
    members: [
      { id: 101, teamId: 10, userId: 1, role: 'OWNER', joinedAt: '', user: ownerUser },
      { id: 102, teamId: 10, userId: 2, role: 'MEMBER', joinedAt: '', user: memberUser },
    ],
    createdAt: '',
    updatedAt: '',
  };

  it('summarizeBulkSelection computes deletableIds and allowed statusTargets per role', () => {
    const tasks: Task[] = [
      { id: 100, title: 'Owner TODO', status: 'TODO', userId: 1, teamId: 10, assigneeId: 2 },
      { id: 101, title: 'Owner DONE', status: 'DONE', userId: 1, teamId: 10, assigneeId: 2 },
      { id: 102, title: 'Member Personal', status: 'IN_PROGRESS', userId: 2, teamId: null },
    ];

    // Member is assignee on 100 & 101, creator of 102
    const memberSummary = summarizeBulkSelection(tasks, memberUser, [team]);
    assert.equal(memberSummary.total, 3);
    assert.deepEqual(memberSummary.deletableIds, [102]);
    // 100 (TODO -> IN_PROGRESS only for assignee), 102 (personal creator -> can move to DONE/TODO)
    assert.deepEqual(memberSummary.statusTargets.IN_PROGRESS, [100]);
    assert.deepEqual(memberSummary.statusTargets.DONE, [102]);
    assert.deepEqual(memberSummary.statusTargets.TODO, [102]);

    // Owner on team tasks 100 & 101
    const ownerSummary = summarizeBulkSelection([tasks[0], tasks[1]], ownerUser, [team]);
    assert.deepEqual(ownerSummary.deletableIds, [100, 101]);
    assert.deepEqual(ownerSummary.statusTargets.TODO, [101]);
    assert.deepEqual(ownerSummary.statusTargets.DONE, [100]);
  });

  it('summarizeTrashSelection distinguishes manageable selected vs total manageable trash tasks', () => {
    const trash: TrashTask[] = [
      { id: 201, title: 'Team Trash', status: 'DONE', userId: 2, teamId: 10, deletedAt: '2026-11-12T00:00:00Z' },
      { id: 202, title: 'Personal Trash', status: 'TODO', userId: 2, teamId: null, deletedAt: '2026-11-12T00:00:00Z' },
    ];

    // Regular member created 201 (team task) & 202 (personal): can only manage personal 202 in trash
    const memberTrash = summarizeTrashSelection(trash, trash, memberUser, [team]);
    assert.deepEqual(memberTrash.manageableSelectedIds, [202]);
    assert.equal(memberTrash.unmanageableSelectedCount, 1);
    assert.deepEqual(memberTrash.manageableAllIds, [202]);
  });
});
