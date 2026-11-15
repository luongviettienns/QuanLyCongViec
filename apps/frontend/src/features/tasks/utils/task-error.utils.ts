import {
  isAbortError,
  isForbiddenError,
  isNetworkError,
  isNotFoundError,
  isUnauthorizedError,
} from '../../../shared/api/index.ts';

export type ErrorFallbackVariant = 'none' | 'page' | 'inline';
export type SectionContentState = 'spinner' | 'empty' | 'list' | 'error-only';

export interface SectionRenderPlan {
  showInlineError: boolean;
  contentState: SectionContentState;
}

/**
 * Returns true when an API failure should be ignored without rendering alerts or
 * toasts (aborted requests or 401 errors already handled globally by session state).
 */
export function shouldIgnoreTaskApiError(error: unknown): boolean {
  return isAbortError(error) || isUnauthorizedError(error);
}

/**
 * Returns true when an authorization or missing-resource failure (403/404)
 * requires clearing previously loaded list items so stale records from another
 * filter or team are never shown below the error notice.
 */
export function shouldClearTaskListOnError(error: unknown): boolean {
  return isForbiddenError(error) || isNotFoundError(error);
}

/**
 * Resolves whether a list view should render no fallback, a full-page fallback
 * (empty data), or an inline warning above stale items.
 */
export function resolveErrorFallbackVariant(
  error: unknown,
  itemCount: number,
): ErrorFallbackVariant {
  if (!error) {
    return 'none';
  }
  return itemCount <= 0 ? 'page' : 'inline';
}

/**
 * Coordinates loading spinner, empty placeholder, list, and inline error states
 * for modal sub-sections so failed loads suppress the empty state and keep
 * retry controls visible while retrying.
 */
export function resolveSectionRenderPlan(
  loading: boolean,
  error: unknown,
  itemCount: number,
): SectionRenderPlan {
  const hasError = Boolean(error);
  if (itemCount > 0) {
    return {
      showInlineError: hasError,
      contentState: 'list',
    };
  }
  if (hasError) {
    return {
      showInlineError: true,
      contentState: 'error-only',
    };
  }
  return {
    showInlineError: false,
    contentState: loading ? 'spinner' : 'empty',
  };
}

/**
 * Deduplicates simultaneous network/offline toast notifications across parallel
 * task metadata/list queries while keeping distinct keys for scoped API errors.
 */
export function getTaskQueryMessageKey(
  error: unknown,
  scopedKey: string,
): string {
  return isNetworkError(error) ? 'tasks-network-error' : scopedKey;
}
