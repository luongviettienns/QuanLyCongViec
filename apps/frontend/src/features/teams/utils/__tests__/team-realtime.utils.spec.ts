import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRealtimeTeamId,
  shouldRefreshTeamPageOnEvent,
  shouldRefreshTeamActivityOnEvent,
  shouldRefreshTeamCategoriesOnEvent,
  createDebouncedCallback,
} from '../team-realtime.utils.ts';

describe('Team Realtime Sync Utils', () => {
  describe('extractRealtimeTeamId', () => {
    it('extracts teamId from top-level event or nested payload', () => {
      assert.equal(extractRealtimeTeamId({ teamId: 12, payload: { teamId: 99 } }), 12);
      assert.equal(extractRealtimeTeamId({ teamId: null, payload: { teamId: 42 } }), 42);
      assert.equal(extractRealtimeTeamId({ payload: { teamId: 'abc' } }), null);
      assert.equal(extractRealtimeTeamId({}), null);
    });
  });

  describe('shouldRefreshTeamPageOnEvent', () => {
    it('skips self-triggered TEAM_UPDATED and TEAM_DELETED events to avoid duplicate API calls', () => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: 'TEAM_UPDATED',
        actorId: 10,
        currentUserId: 10,
        event: { teamId: 5, payload: { teamId: 5, action: 'UPDATE_TEAM' } },
        selectedTeamId: 5,
      });

      assert.deepEqual(decision, {
        shouldReloadList: false,
        shouldReloadDetail: false,
        targetTeamId: 5,
        wasCurrentUserRemoved: false,
        wasSelectedTeamDeleted: false,
      });
    });

    it('reloads both list and detail when another user updates the selected team', () => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: 'TEAM_UPDATED',
        actorId: 10,
        currentUserId: 20,
        event: {
          teamId: 5,
          payload: { teamId: 5, action: 'CHANGE_ROLE' },
        },
        selectedTeamId: 5,
      });

      assert.deepEqual(decision, {
        shouldReloadList: true,
        shouldReloadDetail: true,
        targetTeamId: 5,
        wasCurrentUserRemoved: false,
        wasSelectedTeamDeleted: false,
      });
    });

    it('reloads list only (not selected detail) when another team is updated or current user is added to another team', () => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: 'TEAM_UPDATED',
        actorId: 10,
        currentUserId: 20,
        event: {
          teamId: 8,
          payload: { teamId: 8, action: 'ADD_MEMBER', memberUserId: 20 },
        },
        selectedTeamId: 5,
      });

      assert.deepEqual(decision, {
        shouldReloadList: true,
        shouldReloadDetail: false,
        targetTeamId: 8,
        wasCurrentUserRemoved: false,
        wasSelectedTeamDeleted: false,
      });
    });

    it('marks wasCurrentUserRemoved and avoids loading detail of removed selected team', () => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: 'TEAM_UPDATED',
        actorId: 10,
        currentUserId: 20,
        event: {
          teamId: 5,
          payload: { teamId: 5, action: 'REMOVE_MEMBER', removedUserId: 20 },
        },
        selectedTeamId: 5,
      });

      assert.deepEqual(decision, {
        shouldReloadList: true,
        shouldReloadDetail: false,
        targetTeamId: 5,
        wasCurrentUserRemoved: true,
        wasSelectedTeamDeleted: false,
      });
    });

    it('marks wasSelectedTeamDeleted and avoids loading detail when selected team is deleted by owner', () => {
      const decision = shouldRefreshTeamPageOnEvent({
        eventType: 'TEAM_DELETED',
        actorId: 10,
        currentUserId: 20,
        event: {
          teamId: 5,
          payload: { teamId: 5, teamName: 'Alpha' },
        },
        selectedTeamId: 5,
      });

      assert.deepEqual(decision, {
        shouldReloadList: true,
        shouldReloadDetail: false,
        targetTeamId: 5,
        wasCurrentUserRemoved: false,
        wasSelectedTeamDeleted: true,
      });
    });
  });

  describe('shouldRefreshTeamActivityOnEvent', () => {
    it('returns true only when TEAM_ACTIVITY_CREATED targets the active team', () => {
      assert.equal(
        shouldRefreshTeamActivityOnEvent({
          eventType: 'TEAM_ACTIVITY_CREATED',
          activeTeamId: 5,
          event: { teamId: 5, payload: { teamId: 5, action: 'TASK_CREATED' } },
        }),
        true,
      );

      assert.equal(
        shouldRefreshTeamActivityOnEvent({
          eventType: 'TEAM_ACTIVITY_CREATED',
          activeTeamId: 5,
          event: { teamId: 9, payload: { teamId: 9, action: 'TASK_CREATED' } },
        }),
        false,
      );

      assert.equal(
        shouldRefreshTeamActivityOnEvent({
          eventType: 'TEAM_UPDATED',
          activeTeamId: 5,
          event: { teamId: 5, payload: { teamId: 5 } },
        }),
        false,
      );
    });
  });

  describe('shouldRefreshTeamCategoriesOnEvent', () => {
    it('refreshes categories for matching team when changed by another user, and skips self-events', () => {
      assert.equal(
        shouldRefreshTeamCategoriesOnEvent({
          eventType: 'TEAM_CATEGORY_CHANGED',
          activeTeamId: 5,
          currentUserId: 20,
          event: { actorId: 10, teamId: 5, payload: { teamId: 5, categoryId: 3 } },
        }),
        true,
      );

      assert.equal(
        shouldRefreshTeamCategoriesOnEvent({
          eventType: 'TEAM_CATEGORY_CHANGED',
          activeTeamId: 5,
          currentUserId: 10,
          event: { actorId: 10, teamId: 5, payload: { teamId: 5, categoryId: 3 } },
        }),
        false,
      );

      assert.equal(
        shouldRefreshTeamCategoriesOnEvent({
          eventType: 'TEAM_CATEGORY_CHANGED',
          activeTeamId: 5,
          currentUserId: 20,
          event: { actorId: 10, teamId: 9, payload: { teamId: 9, categoryId: 4 } },
        }),
        false,
      );
    });
  });

  describe('createDebouncedCallback', () => {
    it('coalesces rapid triggers into one invocation and cancels cleanly', async () => {
      let count = 0;
      const debounced = createDebouncedCallback(() => {
        count += 1;
      }, 40);

      debounced.trigger();
      debounced.trigger();
      debounced.trigger();
      assert.equal(count, 0);

      await new Promise((r) => setTimeout(r, 70));
      assert.equal(count, 1);

      debounced.trigger();
      debounced.cancel();
      await new Promise((r) => setTimeout(r, 70));
      assert.equal(count, 1);
    });
  });
});
