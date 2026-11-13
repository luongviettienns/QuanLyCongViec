export { default as NotFoundPage, type NotFoundPageProps } from './NotFoundPage';
export { default as ForbiddenPage, type ForbiddenPageProps } from './ForbiddenPage';
export { default as UnauthorizedPage, type UnauthorizedPageProps } from './UnauthorizedPage';
export {
  ErrorBoundary,
  type ErrorBoundaryProps,
  type ErrorBoundaryVariant,
} from './ErrorBoundary';
export {
  ErrorPageLayout,
  ErrorInlineAlert,
  ErrorCategoryIcon,
  ErrorTechnicalDetails,
  ErrorNavigationButtons,
  type ErrorPageLayoutProps,
  type ErrorInlineAlertProps,
  type ErrorCategoryIconProps,
  type ErrorTechnicalDetailsProps,
  type ErrorNavigationButtonsProps,
  type ErrorNavigationTarget,
} from './ErrorPageLayout';
export {
  ApiErrorFallback,
  type ApiErrorFallbackProps,
  type ApiErrorFallbackVariant,
} from './ApiErrorFallback';
export {
  classifyRuntimeError,
  getApiErrorDisplay,
  formatTechnicalErrorDetail,
  extractHttpStatus,
  hasCustomCategoryIcon,
  canNavigateBackInApp,
  normalizeRoutePath,
  isCurrentRoutePath,
  type ErrorCategory,
  type ErrorResultStatus,
  type ClassifiedErrorDisplay,
  type ClassifyErrorOptions,
  type CanNavigateBackOptions,
} from './error-pages.utils.ts';
