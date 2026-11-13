export type ErrorCategory =
  | 'offline'
  | 'network'
  | 'chunk'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'server'
  | 'client'
  | 'unexpected';

export type ErrorResultStatus = '403' | '404' | '500' | 'warning' | 'error';

export interface ClassifiedErrorDisplay {
  category: ErrorCategory;
  status: ErrorResultStatus;
  title: string;
  subTitle: string;
  isRetryable: boolean;
  httpStatus?: number;
  technicalDetail?: string;
}

export interface ClassifyErrorOptions {
  isOnline?: boolean;
  fallbackTitle?: string;
  fallbackSubTitle?: string;
  context?: 'runtime' | 'api';
}

const DEFAULT_DETAIL_MAX_LENGTH = 600;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

const CHUNK_ERROR_PATTERNS = [
  'chunkloaderror',
  'loading chunk',
  'loading css chunk',
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'unable to preload css',
];

const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'networkerror',
  'network error',
  'network request failed',
  'load failed',
  'fetch failed',
  'err_network',
  'err_internet_disconnected',
  'err_connection_refused',
  'err_connection_reset',
  'err_name_not_resolved',
  'econnrefused',
  'econnreset',
  'enotfound',
  'etimedout',
  'econnaborted',
  'timed out',
  'timeout',
  'không thể kết nối',
  'mất kết nối',
];

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ERR_NETWORK',
  'ERR_INTERNET_DISCONNECTED',
]);

const JS_RUNTIME_CRASH_NAMES = new Set([
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'EvalError',
  'URIError',
]);

const JS_TYPEERROR_CRASH_PATTERNS = [
  'cannot read propert',
  'cannot set propert',
  'cannot destructure',
  'is not a function',
  'is not defined',
  'is not iterable',
  'is not a constructor',
  'null is not an object',
  'undefined is not an object',
  'maximum call stack',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeReadProp(obj: unknown, key: string): unknown {
  if (!isRecord(obj)) {
    return undefined;
  }
  try {
    return obj[key];
  } catch {
    return undefined;
  }
}

function safeReadString(obj: unknown, key: string): string {
  const val = safeReadProp(obj, key);
  return typeof val === 'string' ? val : '';
}

function safeToString(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'symbol') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return `[Function${value.name ? `: ${value.name}` : ''}]`;
  }

  const seen = new WeakSet<object>();
  try {
    const json = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === 'bigint') {
        return nestedValue.toString();
      }
      if (typeof nestedValue === 'symbol') {
        return nestedValue.toString();
      }
      if (typeof nestedValue === 'function') {
        return '[Function]';
      }
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) {
          return '[Circular]';
        }
        seen.add(nestedValue);
      }
      return nestedValue;
    });
    if (typeof json === 'string' && json.length > 0) {
      return json;
    }
  } catch {
    // Fallback below when custom toJSON or Proxy throws
  }

  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[Unserializable Object]';
  }
}

function redactSensitiveText(text: string): string {
  return text.replace(BEARER_TOKEN_PATTERN, 'Bearer [REDACTED]');
}

function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function resolveIsOnline(explicitOnline?: boolean): boolean {
  if (typeof explicitOnline === 'boolean') {
    return explicitOnline;
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
  } catch {
    // Ignore restricted navigator access
  }
  return true;
}

function isChunkLoadError(error: unknown, name: string, message: string): boolean {
  if (name === 'ChunkLoadError') {
    return true;
  }
  const combined = `${name} ${message}`.toLowerCase();
  if (CHUNK_ERROR_PATTERNS.some((pattern) => combined.includes(pattern))) {
    return true;
  }
  const cause = safeReadProp(error, 'cause');
  if (cause !== undefined && cause !== error) {
    const causeName = safeReadString(cause, 'name');
    const causeMsg = safeReadString(cause, 'message');
    if (`${causeName} ${causeMsg}`.toLowerCase().includes('dynamically imported module')) {
      return true;
    }
  }
  return false;
}

function isJsRuntimeCrash(name: string, message: string): boolean {
  if (JS_RUNTIME_CRASH_NAMES.has(name)) {
    return true;
  }
  const lowerMsg = message.toLowerCase();
  return JS_TYPEERROR_CRASH_PATTERNS.some((pattern) => lowerMsg.includes(pattern));
}

function isNetworkFailure(
  error: unknown,
  name: string,
  message: string,
  httpStatus: number | undefined,
): boolean {
  if (httpStatus === 0) {
    return true;
  }
  if (name === 'TimeoutError') {
    return true;
  }
  const code = safeReadString(error, 'code').toUpperCase();
  if (code && NETWORK_ERROR_CODES.has(code)) {
    return true;
  }
  const lowerMessage = message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => lowerMessage.includes(pattern));
}

export function extractHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const directStatus = safeReadProp(error, 'status');
  if (typeof directStatus === 'number' && Number.isFinite(directStatus)) {
    return directStatus;
  }

  const statusCode = safeReadProp(error, 'statusCode');
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return statusCode;
  }

  const response = safeReadProp(error, 'response');
  const responseStatus = safeReadProp(response, 'status');
  if (typeof responseStatus === 'number' && Number.isFinite(responseStatus)) {
    return responseStatus;
  }

  if (safeReadString(error, 'name') === 'UnauthorizedError') {
    return 401;
  }

  return undefined;
}

function formatTechnicalDetailInternal(
  error: unknown,
  maxLength: number,
  seen: WeakSet<object>,
): string {
  if (maxLength <= 0 || error === null || error === undefined) {
    return '';
  }

  if (typeof error === 'string') {
    const trimmed = redactSensitiveText(error.trim());
    return trimmed ? truncateText(trimmed, maxLength) : '';
  }

  if (!isRecord(error)) {
    const formatted = redactSensitiveText(safeToString(error).trim());
    return formatted ? truncateText(formatted, maxLength) : '';
  }

  if (seen.has(error)) {
    return '[Circular Error]';
  }
  seen.add(error);

  const parts: string[] = [];
  const name = safeReadString(error, 'name').trim();
  const message = safeReadString(error, 'message').trim();
  const code = safeReadString(error, 'code').trim();
  const httpStatus = extractHttpStatus(error);

  const headerTokens: string[] = [];
  if (name) {
    headerTokens.push(name);
  }
  if (httpStatus !== undefined) {
    headerTokens.push(`HTTP ${httpStatus}`);
  }
  if (code) {
    headerTokens.push(`Code ${code}`);
  }

  const headerPrefix = headerTokens.length > 0 ? headerTokens.join(' • ') : '';
  if (headerPrefix && message) {
    parts.push(`${headerPrefix}: ${message}`);
  } else if (message) {
    parts.push(message);
  } else if (headerPrefix) {
    parts.push(headerPrefix);
  }

  const cause = safeReadProp(error, 'cause');
  if (cause !== undefined && cause !== null && cause !== error) {
    const causeDetail = formatTechnicalDetailInternal(cause, Math.min(200, maxLength), seen);
    if (causeDetail) {
      parts.push(`Cause: ${causeDetail}`);
    }
  }

  const stack = safeReadString(error, 'stack').trim();
  if (stack) {
    const stackLines = stack
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line, index) => {
        if (index === 0 && message && line.includes(message)) {
          return false;
        }
        return line.trim().length > 0;
      })
      .slice(0, 4);
    if (stackLines.length > 0) {
      parts.push(stackLines.join('\n'));
    }
  }

  if (parts.length === 0) {
    const serialized = safeToString(error).trim();
    if (serialized) {
      parts.push(serialized);
    }
  }

  const combined = redactSensitiveText(parts.join('\n').trim());
  return combined ? truncateText(combined, maxLength) : '';
}

export function formatTechnicalErrorDetail(
  error: unknown,
  maxLength = DEFAULT_DETAIL_MAX_LENGTH,
): string {
  return formatTechnicalDetailInternal(error, maxLength, new WeakSet<object>());
}

function classifyErrorInternal(
  error: unknown,
  options: ClassifyErrorOptions | undefined,
  defaultContext: 'runtime' | 'api',
): ClassifiedErrorDisplay {
  const context = options?.context ?? defaultContext;
  const technicalDetail = formatTechnicalErrorDetail(error) || undefined;
  const httpStatus = extractHttpStatus(error);
  const name = safeReadString(error, 'name').trim();
  const message =
    typeof error === 'string' ? error.trim() : safeReadString(error, 'message').trim();

  const finish = (
    base: Omit<ClassifiedErrorDisplay, 'httpStatus' | 'technicalDetail'>,
  ): ClassifiedErrorDisplay => ({
    ...base,
    ...(httpStatus !== undefined ? { httpStatus } : {}),
    ...(technicalDetail ? { technicalDetail } : {}),
  });

  if (httpStatus === 401) {
    return finish({
      category: 'unauthorized',
      status: 'warning',
      title: '401 - Phiên đăng nhập đã hết hạn',
      subTitle:
        'Phiên đăng nhập của bạn đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại để tiếp tục.',
      isRetryable: false,
    });
  }

  if (httpStatus === 403) {
    return finish({
      category: 'forbidden',
      status: '403',
      title: '403 - Không có quyền truy cập',
      subTitle: 'Xin lỗi, bạn không có quyền truy cập vào tài nguyên hoặc trang này.',
      isRetryable: false,
    });
  }

  if (httpStatus === 404) {
    return finish({
      category: 'not_found',
      status: '404',
      title: context === 'api' ? 'Không tìm thấy dữ liệu' : '404 - Không tìm thấy trang',
      subTitle:
        context === 'api'
          ? 'Dữ liệu hoặc tài nguyên bạn yêu cầu không tồn tại hoặc đã bị xóa.'
          : 'Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.',
      isRetryable: false,
    });
  }

  if (httpStatus !== undefined && httpStatus >= 500) {
    return finish({
      category: 'server',
      status: '500',
      title: 'Máy chủ đang gặp sự cố',
      subTitle: `Hệ thống tạm thời không thể xử lý yêu cầu (mã lỗi ${httpStatus}). Vui lòng thử lại sau ít phút.`,
      isRetryable: true,
    });
  }

  if (httpStatus === 408 || httpStatus === 429) {
    return finish({
      category: httpStatus === 408 ? 'network' : 'client',
      status: 'warning',
      title:
        httpStatus === 408
          ? 'Yêu cầu hết thời gian chờ'
          : 'Hệ thống đang nhận quá nhiều yêu cầu',
      subTitle:
        httpStatus === 408
          ? 'Kết nối tới máy chủ mất quá nhiều thời gian phản hồi. Vui lòng thử lại.'
          : 'Bạn thao tác quá nhanh hoặc máy chủ đang bận. Vui lòng đợi giây lát rồi thử lại.',
      isRetryable: true,
    });
  }

  if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
    return finish({
      category: 'client',
      status: 'error',
      title: 'Yêu cầu không hợp lệ',
      subTitle: `Không thể hoàn tất yêu cầu (mã lỗi ${httpStatus}). Vui lòng kiểm tra lại dữ liệu hoặc thao tác của bạn.`,
      isRetryable: false,
    });
  }

  if (isChunkLoadError(error, name, message)) {
    return finish({
      category: 'chunk',
      status: 'warning',
      title: 'Không thể tải tài nguyên trang',
      subTitle:
        'Ứng dụng vừa có bản cập nhật mới hoặc tệp giao diện chưa được tải đầy đủ. Vui lòng tải lại ứng dụng để tiếp tục.',
      isRetryable: true,
    });
  }

  const isOnline = resolveIsOnline(options?.isOnline);
  const runtimeCrash = isJsRuntimeCrash(name, message);

  if (!isOnline && !runtimeCrash) {
    return finish({
      category: 'offline',
      status: 'warning',
      title: 'Không có kết nối mạng',
      subTitle:
        'Thiết bị của bạn hiện đang ngoại tuyến. Vui lòng kiểm tra kết nối Wi-Fi hoặc mạng di động rồi thử lại.',
      isRetryable: true,
    });
  }

  if (isNetworkFailure(error, name, message, httpStatus)) {
    return finish({
      category: 'network',
      status: 'error',
      title: 'Không thể kết nối tới máy chủ',
      subTitle:
        'Kết nối mạng gặp gián đoạn hoặc máy chủ chưa phản hồi. Vui lòng kiểm tra đường truyền và thử lại.',
      isRetryable: true,
    });
  }

  return finish({
    category: 'unexpected',
    status: 'error',
    title: options?.fallbackTitle ?? 'Đã có lỗi xảy ra',
    subTitle:
      options?.fallbackSubTitle ??
      (context === 'api'
        ? 'Không thể tải dữ liệu do sự cố không mong muốn. Vui lòng thử lại.'
        : 'Đã xảy ra sự cố không mong muốn trong quá trình hiển thị giao diện.'),
    isRetryable: true,
  });
}

export function classifyRuntimeError(
  error: unknown,
  options?: ClassifyErrorOptions,
): ClassifiedErrorDisplay {
  return classifyErrorInternal(error, options, 'runtime');
}

export function getApiErrorDisplay(
  error: unknown,
  options?: ClassifyErrorOptions,
): ClassifiedErrorDisplay {
  return classifyErrorInternal(error, options, 'api');
}

const CUSTOM_ICON_CATEGORIES = new Set<ErrorCategory>([
  'offline',
  'network',
  'chunk',
  'unauthorized',
  'unexpected',
]);

export function hasCustomCategoryIcon(category: ErrorCategory): boolean {
  return CUSTOM_ICON_CATEGORIES.has(category);
}
