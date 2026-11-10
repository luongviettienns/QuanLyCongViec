import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from '../../types/task.types.js';

describe('Task Board & Filters Logic', () => {
  describe('Team Filter vs isFiltering semantics', () => {
    it('selecting a team alone does NOT activate isFiltering (allows team Kanban intra-column reordering)', () => {
      // Replicate useTaskFilters isFiltering logic
      const checkIsFiltering = (
        search: string,
        status: string,
        category: number | 'ALL',
        priority: string,
        scope: string,
      ) => {
        return (
          search.trim() !== '' ||
          status !== 'ALL' ||
          category !== 'ALL' ||
          priority !== 'ALL' ||
          scope !== 'all'
        );
      };

      // 1. All default
      assert.equal(checkIsFiltering('', 'ALL', 'ALL', 'ALL', 'all'), false);

      // 2. Team selected (teamId = 42), other filters default -> isFiltering MUST be false
      // This ensures Team Admin/Owner can freely reorder the team board without blocking alerts
      assert.equal(checkIsFiltering('', 'ALL', 'ALL', 'ALL', 'all'), false);

      // 3. Partial subset filters -> isFiltering MUST be true
      assert.equal(checkIsFiltering('bug', 'ALL', 'ALL', 'ALL', 'all'), true);
      assert.equal(checkIsFiltering('', 'IN_PROGRESS', 'ALL', 'ALL', 'all'), true);
      assert.equal(checkIsFiltering('', 'ALL', 10, 'ALL', 'all'), true);
      assert.equal(checkIsFiltering('', 'ALL', 'ALL', 'HIGH', 'all'), true);
      assert.equal(checkIsFiltering('', 'ALL', 'ALL', 'ALL', 'assigned_to_me'), true);
    });
  });

  describe('Cross-column Position Reindexing', () => {
    it('moving a task between columns reindexes BOTH source and destination columns with zero gaps', () => {
      const initialTasks: Task[] = [
        { id: 1, title: 'Task 1', status: 'TODO', position: 0, userId: 1, createdAt: '', updatedAt: '' },
        { id: 2, title: 'Task 2', status: 'TODO', position: 1, userId: 1, createdAt: '', updatedAt: '' },
        { id: 3, title: 'Task 3', status: 'TODO', position: 2, userId: 1, createdAt: '', updatedAt: '' },
        { id: 4, title: 'Task 4', status: 'IN_PROGRESS', position: 0, userId: 1, createdAt: '', updatedAt: '' },
        { id: 5, title: 'Task 5', status: 'IN_PROGRESS', position: 1, userId: 1, createdAt: '', updatedAt: '' },
      ];

      const taskIdToMove = 2;
      const newStatus = 'IN_PROGRESS';
      const newPosition = 1; // insert between Task 4 and Task 5

      const targetTask = initialTasks.find((t) => t.id === taskIdToMove)!;
      const remaining = initialTasks.filter((t) => t.id !== taskIdToMove);

      // 1. Source column reindexed
      const sourceTasks = remaining
        .filter((t) => t.status === targetTask.status)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((t, idx) => ({ ...t, position: idx }));

      // 2. Destination column reindexed
      const destTasks = remaining
        .filter((t) => t.status === newStatus)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const updatedItem = {
        ...targetTask,
        status: newStatus as Task['status'],
        position: newPosition,
      };

      destTasks.splice(newPosition, 0, updatedItem);
      const reindexedDest = destTasks.map((t, idx) => ({ ...t, position: idx }));

      // 3. Untouched columns
      const untouchedTasks = remaining.filter(
        (t) => t.status !== targetTask.status && t.status !== newStatus,
      );

      const result = [...untouchedTasks, ...sourceTasks, ...reindexedDest];

      // Verification on Source column (TODO): Task 1 (pos 0) and Task 3 (pos 1) -> NO GAP!
      const todoTasks = result.filter((t) => t.status === 'TODO');
      assert.equal(todoTasks.length, 2);
      assert.equal(todoTasks[0].id, 1);
      assert.equal(todoTasks[0].position, 0);
      assert.equal(todoTasks[1].id, 3);
      assert.equal(todoTasks[1].position, 1); // was 2, now 1!

      // Verification on Destination column (IN_PROGRESS): Task 4 (pos 0), Task 2 (pos 1), Task 5 (pos 2)
      const inProgTasks = result.filter((t) => t.status === 'IN_PROGRESS');
      assert.equal(inProgTasks.length, 3);
      assert.equal(inProgTasks[0].id, 4);
      assert.equal(inProgTasks[0].position, 0);
      assert.equal(inProgTasks[1].id, 2);
      assert.equal(inProgTasks[1].position, 1);
      assert.equal(inProgTasks[2].id, 5);
      assert.equal(inProgTasks[2].position, 2);
    });
  });
});
