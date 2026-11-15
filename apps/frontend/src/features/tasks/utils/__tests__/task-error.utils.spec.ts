import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  NetworkError,
  UnauthorizedError,
} from '../../../../shared/api/index.ts';
import {
  shouldIgnoreTaskApiError,
  shouldClearTaskListOnError,
  resolveErrorFallbackVariant,
  resolveSectionRenderPlan,
  getTaskQueryMessageKey,
} from '../task-error.utils.ts';

describe('task-error.utils', () => {
  describe('shouldIgnoreTaskApiError', () => {
    it('returns true for AbortError and UnauthorizedError (instance or status 401)', () => {
      assert.equal(shouldIgnoreTaskApiError(new DOMException('Aborted', 'AbortError')), true);
      assert.equal(shouldIgnoreTaskApiError({ name: 'AbortError' }), true);
      assert.equal(shouldIgnoreTaskApiError(new UnauthorizedError()), true);
      assert.equal(shouldIgnoreTaskApiError(new ApiError('Unauthorized', 401)), true);
      assert.equal(shouldIgnoreTaskApiError({ name: 'UnauthorizedError' }), true);
      assert.equal(shouldIgnoreTaskApiError({ status: 401 }), true);
    });

    it('returns false for NetworkError, 403, 404, 5xx, and generic values', () => {
      assert.equal(shouldIgnoreTaskApiError(new NetworkError()), false);
      assert.equal(shouldIgnoreTaskApiError(new ApiError('Forbidden', 403)), false);
      assert.equal(shouldIgnoreTaskApiError(new ApiError('Not Found', 404)), false);
      assert.equal(shouldIgnoreTaskApiError(new ApiError('Internal Server Error', 500)), false);
      assert.equal(shouldIgnoreTaskApiError(new TypeError('Failed to fetch')), false);
      assert.equal(shouldIgnoreTaskApiError(null), false);
      assert.equal(shouldIgnoreTaskApiError(undefined), false);
    });
  });

  describe('shouldClearTaskListOnError', () => {
    it('returns true for 403 Forbidden and 404 Not Found errors', () => {
      assert.equal(shouldClearTaskListOnError(new ApiError('Forbidden', 403)), true);
      assert.equal(shouldClearTaskListOnError(new ApiError('Not Found', 404)), true);
      assert.equal(shouldClearTaskListOnError({ status: 403 }), true);
      assert.equal(shouldClearTaskListOnError({ status: 404 }), true);
    });

    it('returns false for transient 5xx, network errors, and non-permission values', () => {
      assert.equal(shouldClearTaskListOnError(new NetworkError()), false);
      assert.equal(shouldClearTaskListOnError(new TypeError('Failed to fetch')), false);
      assert.equal(shouldClearTaskListOnError(new ApiError('Internal Server Error', 500)), false);
      assert.equal(shouldClearTaskListOnError(new ApiError('Bad Request', 400)), false);
      assert.equal(shouldClearTaskListOnError(null), false);
    });
  });

  describe('resolveErrorFallbackVariant', () => {
    it('returns none when no error is present', () => {
      assert.equal(resolveErrorFallbackVariant(null, 0), 'none');
      assert.equal(resolveErrorFallbackVariant(undefined, 5), 'none');
      assert.equal(resolveErrorFallbackVariant(false, 0), 'none');
    });

    it('returns page when error exists and list is empty', () => {
      assert.equal(resolveErrorFallbackVariant(new NetworkError(), 0), 'page');
      assert.equal(resolveErrorFallbackVariant(new ApiError('Server error', 500), 0), 'page');
      assert.equal(resolveErrorFallbackVariant(new ApiError('Forbidden', 403), -1), 'page');
    });

    it('returns inline when error exists and stale items are present', () => {
      assert.equal(resolveErrorFallbackVariant(new NetworkError(), 1), 'inline');
      assert.equal(resolveErrorFallbackVariant(new ApiError('Server error', 500), 12), 'inline');
    });
  });

  describe('resolveSectionRenderPlan', () => {
    it('returns spinner on initial empty loading without error', () => {
      assert.deepEqual(resolveSectionRenderPlan(true, null, 0), {
        showInlineError: false,
        contentState: 'spinner',
      });
    });

    it('returns empty when finished loading with zero items and no error', () => {
      assert.deepEqual(resolveSectionRenderPlan(false, null, 0), {
        showInlineError: false,
        contentState: 'empty',
      });
    });

    it('suppresses Empty and Spin when load error is set and list is empty (including during retry)', () => {
      const err = new ApiError('Internal Server Error', 500);
      assert.deepEqual(resolveSectionRenderPlan(false, err, 0), {
        showInlineError: true,
        contentState: 'error-only',
      });
      assert.deepEqual(resolveSectionRenderPlan(true, err, 0), {
        showInlineError: true,
        contentState: 'error-only',
      });
    });

    it('keeps list visible and shows inline error banner if refresh fails with existing items', () => {
      const err = new NetworkError();
      assert.deepEqual(resolveSectionRenderPlan(false, null, 3), {
        showInlineError: false,
        contentState: 'list',
      });
      assert.deepEqual(resolveSectionRenderPlan(false, err, 3), {
        showInlineError: true,
        contentState: 'list',
      });
      assert.deepEqual(resolveSectionRenderPlan(true, err, 3), {
        showInlineError: true,
        contentState: 'list',
      });
    });
  });

  describe('getTaskQueryMessageKey', () => {
    it('coalesces simultaneous network errors under a shared key and preserves scoped keys otherwise', () => {
      assert.equal(getTaskQueryMessageKey(new NetworkError(), 'tasks-fetch-error'), 'tasks-network-error');
      assert.equal(
        getTaskQueryMessageKey(new TypeError('Failed to fetch'), 'tasks-teams-error'),
        'tasks-network-error',
      );
      assert.equal(
        getTaskQueryMessageKey(new ApiError('Forbidden', 403), 'tasks-teams-error'),
        'tasks-teams-error',
      );
      assert.equal(
        getTaskQueryMessageKey(new ApiError('Server error', 500), 'tasks-categories-error'),
        'tasks-categories-error',
      );
    });
  });
});
