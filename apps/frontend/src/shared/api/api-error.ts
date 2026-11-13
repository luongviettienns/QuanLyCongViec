export const DEFAULT_NETWORK_ERROR_MESSAGE =
  'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.';

export const DEFAULT_SERVER_ERROR_MESSAGE =
  'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';

export class ApiError extends Error {
  readonly status: number;
  readonly data?: unknown;

  constructor(message: string, status = 500, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class NetworkError extends ApiError {
  constructor(
    message = DEFAULT_NETWORK_ERROR_MESSAGE,
    options?: { cause?: unknown; data?: unknown },
  ) {
    super(message, 0, options?.data);
    this.name = 'NetworkError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export async function parseApiError(
  response: Response,
  defaultMessage: string,
): Promise<ApiError> {
  try {
    const errorData = await response.json();
    let errorMsg = defaultMessage;
    if (
      errorData &&
      typeof errorData.message === 'string' &&
      errorData.message.trim().length > 0
    ) {
      errorMsg = errorData.message.trim();
    } else if (Array.isArray(errorData?.message)) {
      const messages = errorData.message
        .filter(
          (item: unknown): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
        .map((item: string) => item.trim());
      if (messages.length > 0) {
        errorMsg = messages.join(', ');
      }
    }
    return new ApiError(errorMsg, response.status, errorData);
  } catch {
    return new ApiError(defaultMessage, response.status);
  }
}

export function getApiErrorStatus(err: unknown): number | undefined {
  if (err instanceof ApiError) {
    return err.status;
  }
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return status;
    }
  }
  return undefined;
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  return (err as { name?: unknown }).name === 'AbortError';
}

export function isUnauthorizedError(err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    return true;
  }
  if (
    err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'UnauthorizedError'
  ) {
    return true;
  }
  return getApiErrorStatus(err) === 401;
}

function isRawFetchNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (err.name === 'NetworkError') {
    return true;
  }
  if (err.name === 'TypeError') {
    const msg = err.message.toLowerCase();
    if (
      msg.includes('failed to fetch') ||
      msg.includes('fetch failed') ||
      msg.includes('networkerror') ||
      msg.includes('network request failed') ||
      msg.includes('network error') ||
      msg.includes('load failed') ||
      msg.includes('internet connection appears to be offline')
    ) {
      return true;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }
  }
  return false;
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) {
    return true;
  }
  if (
    err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'NetworkError'
  ) {
    return true;
  }
  if (getApiErrorStatus(err) === 0) {
    return true;
  }
  return isRawFetchNetworkFailure(err);
}

export function isForbiddenError(err: unknown): boolean {
  return getApiErrorStatus(err) === 403;
}

export function isNotFoundError(err: unknown): boolean {
  return getApiErrorStatus(err) === 404;
}

export function isServerError(err: unknown): boolean {
  const status = getApiErrorStatus(err);
  return status !== undefined && status >= 500 && status < 600;
}

const GENERIC_SERVER_MESSAGES = new Set([
  'internal server error',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
  'server error',
  'internal error',
  'something went wrong',
  'unexpected error',
  'unknown error',
  'yêu cầu thất bại',
  'lỗi cơ sở dữ liệu nội bộ',
  'error',
]);

function isGenericServerMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (GENERIC_SERVER_MESSAGES.has(normalized)) {
    return true;
  }
  return (
    normalized.startsWith('request failed') ||
    normalized.startsWith('http ') ||
    /^(500|502|503|504)\b/.test(normalized)
  );
}

export function getFriendlyErrorMessage(
  err: unknown,
  fallback = 'Đã xảy ra lỗi, vui lòng thử lại',
): string {
  if (isNetworkError(err)) {
    if (err instanceof NetworkError && err.message.trim().length > 0) {
      return err.message.trim();
    }
    return DEFAULT_NETWORK_ERROR_MESSAGE;
  }

  if (isAbortError(err)) {
    return fallback;
  }

  const rawMessage =
    err instanceof Error
      ? err.message.trim()
      : err &&
          typeof err === 'object' &&
          typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message.trim()
        : '';

  if (isServerError(err)) {
    return isGenericServerMessage(rawMessage)
      ? DEFAULT_SERVER_ERROR_MESSAGE
      : rawMessage;
  }

  const status = getApiErrorStatus(err);
  if (status === 401 || isUnauthorizedError(err)) {
    if (!rawMessage || rawMessage.toLowerCase() === 'unauthorized') {
      return 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại';
    }
    return rawMessage;
  }

  if (status === 403) {
    if (!rawMessage || rawMessage.toLowerCase() === 'forbidden') {
      return 'Bạn không có quyền thực hiện thao tác này.';
    }
    return rawMessage;
  }

  if (status === 404) {
    if (!rawMessage || rawMessage.toLowerCase() === 'not found') {
      return 'Không tìm thấy dữ liệu yêu cầu.';
    }
    return rawMessage;
  }

  if (status === 429) {
    const lower = rawMessage.toLowerCase();
    if (!rawMessage || lower.includes('too many requests')) {
      return 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';
    }
    return rawMessage;
  }

  if (status !== undefined) {
    const lower = rawMessage.toLowerCase();
    if (
      !rawMessage ||
      lower === 'bad request' ||
      lower === 'conflict' ||
      lower === 'unprocessable entity'
    ) {
      return fallback;
    }
    return rawMessage;
  }

  if (
    err instanceof TypeError ||
    err instanceof SyntaxError ||
    err instanceof ReferenceError ||
    err instanceof RangeError
  ) {
    return fallback;
  }

  if (rawMessage) {
    return rawMessage;
  }

  if (typeof err === 'string' && err.trim().length > 0) {
    return err.trim();
  }

  return fallback;
}
