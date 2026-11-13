export { default as NotFoundPage } from './NotFoundPage';
export { default as ForbiddenPage } from './ForbiddenPage';
export { default as UnauthorizedPage } from './UnauthorizedPage';
export { ErrorBoundary, type ErrorBoundaryProps } from './ErrorBoundary';
export {
  ErrorPageLayout,
  ErrorCategoryIcon,
  ErrorTechnicalDetails,
  ErrorNavigationButtons,
  type ErrorPageLayoutProps,
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
  type ErrorCategory,
  type ErrorResultStatus,
  type ClassifiedErrorDisplay,
  type ClassifyErrorOptions,
} from './error-pages.utils.ts';
