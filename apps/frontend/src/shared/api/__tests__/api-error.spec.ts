import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  UnauthorizedError,
  NetworkError,
  DEFAULT_NETWORK_ERROR_MESSAGE,
  DEFAULT_SERVER_ERROR_MESSAGE,
  parseApiError,
  getApiErrorStatus,
  isAbortError,
  isUnauthorizedError,
  isNetworkError,
  isForbiddenError,
  isNotFoundError,
  isServerError,
  getFriendlyErrorMessage,
  safeFetch,
  httpClient,
  subscribeUnauthorized,
} from '../index.ts';

const originalFetch = globalThis.fetch;
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator',
);

function installMockLocalStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  (globalThis as { localStorage?: Partial<Storage> }).localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

function mockNavigatorOnline(onLine: boolean) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage === undefined) {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  } else {
    (globalThis as { localStorage?: Storage }).localStorage = originalLocalStorage;
  }
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  }
});

describe('shared/api error classes and helpers', () => {
  it('constructs NetworkError with status 0 and default Vietnamese message', () => {
    const err = new NetworkError();
    assert.equal(err instanceof Error, true);
    assert.equal(err instanceof ApiError, true);
    assert.equal(err instanceof NetworkError, true);
    assert.equal(err.name, 'NetworkError');
    assert.equal(err.status, 0);
    assert.equal(
      err.message,
      'Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    );
    assert.equal(err.message, DEFAULT_NETWORK_ERROR_MESSAGE);

    const cause = new TypeError('Failed to fetch');
    const custom = new NetworkError('Mất kết nối tạm thời', { cause, data: { retryable: true } });
    assert.equal(custom.status, 0);
    assert.equal(custom.message, 'Mất kết nối tạm thời');
    assert.equal(custom.cause, cause);
    assert.deepEqual(custom.data, { retryable: true });
  });

  it('parseApiError extracts string/array JSON messages and falls back safely on non-JSON', async () => {
    const singleMsgRes = new Response(
      JSON.stringify({ message: '  Email đã tồn tại  ' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    const err409 = await parseApiError(singleMsgRes, 'Mặc định');
    assert.equal(err409 instanceof ApiError, true);
    assert.equal(err409.status, 409);
    assert.equal(err409.message, 'Email đã tồn tại');

    const arrayMsgRes = new Response(
      JSON.stringify({ message: ['Tiêu đề bắt buộc', '  ', 'Độ dài tối thiểu 3 ký tự'] }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
    const err400 = await parseApiError(arrayMsgRes, 'Mặc định');
    assert.equal(err400.status, 400);
    assert.equal(err400.message, 'Tiêu đề bắt buộc, Độ dài tối thiểu 3 ký tự');

    const emptyMsgRes = new Response(JSON.stringify({ message: '   ' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });
    const err422 = await parseApiError(emptyMsgRes, 'Dữ liệu không hợp lệ');
    assert.equal(err422.status, 422);
    assert.equal(err422.message, 'Dữ liệu không hợp lệ');

    const htmlRes = new Response('<html>502 Bad Gateway</html>', { status: 502 });
    const err502 = await parseApiError(htmlRes, 'Yêu cầu thất bại');
    assert.equal(err502.status, 502);
    assert.equal(err502.message, 'Yêu cầu thất bại');
    assert.equal(err502.data, undefined);
  });

  it('getApiErrorStatus reads numeric status from ApiError and duck-typed errors', () => {
    assert.equal(getApiErrorStatus(new ApiError('x', 403)), 403);
    assert.equal(getApiErrorStatus(new UnauthorizedError()), 401);
    assert.equal(getApiErrorStatus(new NetworkError()), 0);
    assert.equal(getApiErrorStatus({ status: 503 }), 503);
    assert.equal(getApiErrorStatus(new Error('plain')), undefined);
    assert.equal(getApiErrorStatus({ status: '500' }), undefined);
    assert.equal(getApiErrorStatus({ status: Number.NaN }), undefined);
    assert.equal(getApiErrorStatus(null), undefined);
  });

  it('predicates classify abort, unauthorized, network, forbidden, not-found, and 5xx errors', () => {
    const abortDom = new DOMException('The operation was aborted.', 'AbortError');
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    assert.equal(isAbortError(abortDom), true);
    assert.equal(isAbortError(abortErr), true);
    assert.equal(isAbortError(new NetworkError()), false);
    assert.equal(isAbortError(null), false);

    assert.equal(isUnauthorizedError(new UnauthorizedError()), true);
    assert.equal(isUnauthorizedError(new ApiError('Sai mật khẩu', 401)), true);
    assert.equal(isUnauthorizedError({ name: 'UnauthorizedError' }), true);
    assert.equal(isUnauthorizedError(new ApiError('Forbidden', 403)), false);

    assert.equal(isNetworkError(new NetworkError()), true);
    assert.equal(isNetworkError({ name: 'NetworkError' }), true);
    assert.equal(isNetworkError(new ApiError('raw', 0)), true);
    assert.equal(isNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(isNetworkError(new TypeError('fetch failed')), true);
    assert.equal(
      isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')),
      true,
    );
    assert.equal(isNetworkError(new TypeError('Load failed')), true);
    mockNavigatorOnline(true);
    assert.equal(
      isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')")),
      false,
    );
    mockNavigatorOnline(false);
    assert.equal(isNetworkError(new TypeError('Browser offline')), true);
    assert.equal(isNetworkError(new ApiError('Server error', 500)), false);

    assert.equal(isForbiddenError(new ApiError('Forbidden', 403)), true);
    assert.equal(isForbiddenError(new ApiError('Not found', 404)), false);

    assert.equal(isNotFoundError(new ApiError('Not found', 404)), true);
    assert.equal(isNotFoundError(new ApiError('Bad request', 400)), false);

    assert.equal(isServerError(new ApiError('ISE', 500)), true);
    assert.equal(isServerError(new ApiError('Bad Gateway', 502)), true);
    assert.equal(isServerError(new ApiError('Unavailable', 503)), true);
    assert.equal(isServerError(new ApiError('Timeout', 504)), true);
    assert.equal(isServerError(new ApiError('Not found', 404)), false);
    assert.equal(isServerError(new NetworkError()), false);
  });

  it('getFriendlyErrorMessage maps raw network & generic 5xx cleanly while preserving validation messages', () => {
    assert.equal(
      getFriendlyErrorMessage(new TypeError('Failed to fetch'), 'Fallback'),
      DEFAULT_NETWORK_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new TypeError('fetch failed'), 'Fallback'),
      DEFAULT_NETWORK_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new NetworkError(), 'Fallback'),
      DEFAULT_NETWORK_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new NetworkError('Mạng đang chập chờn'), 'Fallback'),
      'Mạng đang chập chờn',
    );

    assert.equal(
      getFriendlyErrorMessage(new ApiError('Internal server error', 500), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Bad Gateway', 502), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Service Unavailable', 503), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Gateway Timeout', 504), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Lỗi cơ sở dữ liệu nội bộ', 500), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Request failed with status code 500', 500), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('', 500), 'Fallback'),
      DEFAULT_SERVER_ERROR_MESSAGE,
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Hệ thống đang bảo trì đến 22:00', 503), 'Fallback'),
      'Hệ thống đang bảo trì đến 22:00',
    );

    // Informative 4xx / backend validation messages must be preserved
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Tiêu đề công việc không được để trống', 400), 'Fallback'),
      'Tiêu đề công việc không được để trống',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Email này đã được sử dụng', 409), 'Fallback'),
      'Email này đã được sử dụng',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Trạng thái chuyển đổi không hợp lệ', 422), 'Fallback'),
      'Trạng thái chuyển đổi không hợp lệ',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Email hoặc mật khẩu không chính xác', 401), 'Fallback'),
      'Email hoặc mật khẩu không chính xác',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Chỉ trưởng nhóm mới được giải tán nhóm', 403), 'Fallback'),
      'Chỉ trưởng nhóm mới được giải tán nhóm',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Không tìm thấy công việc #12', 404), 'Fallback'),
      'Không tìm thấy công việc #12',
    );

    // Generic English 401/403/404/429 fall back to friendly Vietnamese
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Unauthorized', 401), 'Fallback'),
      'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Forbidden', 403), 'Fallback'),
      'Bạn không có quyền thực hiện thao tác này.',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('Not Found', 404), 'Fallback'),
      'Không tìm thấy dữ liệu yêu cầu.',
    );
    assert.equal(
      getFriendlyErrorMessage(new ApiError('ThrottlerException: Too Many Requests', 429), 'Fallback'),
      'Bạn thao tác quá nhanh, vui lòng thử lại sau.',
    );

    // Runtime TypeError/SyntaxError and AbortError fall back safely
    mockNavigatorOnline(true);
    assert.equal(
      getFriendlyErrorMessage(new TypeError('Cannot read properties of null'), 'Lỗi xử lý'),
      'Lỗi xử lý',
    );
    assert.equal(
      getFriendlyErrorMessage(new SyntaxError('Unexpected token < in JSON'), 'Lỗi xử lý dữ liệu'),
      'Lỗi xử lý dữ liệu',
    );
    assert.equal(
      getFriendlyErrorMessage(new DOMException('Aborted', 'AbortError'), 'Đã huỷ'),
      'Đã huỷ',
    );
    assert.equal(getFriendlyErrorMessage(null, 'Lỗi mặc định'), 'Lỗi mặc định');
    assert.equal(getFriendlyErrorMessage('Thông báo lỗi chuỗi', 'Lỗi mặc định'), 'Thông báo lỗi chuỗi');
  });

  it('safeFetch forwards responses, preserves AbortError, and maps rejections to NetworkError', async () => {
    const okResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
    let capturedUrl: RequestInfo | URL | undefined;
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input;
      capturedInit = init;
      return okResponse;
    };

    const res = await safeFetch('/api/tasks', { method: 'GET' });
    assert.equal(res, okResponse);
    assert.equal(capturedUrl, '/api/tasks');
    assert.equal(capturedInit?.method, 'GET');

    const rawFetchError = new TypeError('Failed to fetch');
    globalThis.fetch = async () => {
      throw rawFetchError;
    };

    await assert.rejects(
      () => safeFetch('/api/tasks'),
      (err: unknown) => {
        assert.equal(err instanceof NetworkError, true);
        assert.equal(isNetworkError(err), true);
        assert.equal((err as NetworkError).status, 0);
        assert.equal((err as NetworkError).cause, rawFetchError);
        return true;
      },
    );

    globalThis.fetch = async () => {
      throw 'network down';
    };

    await assert.rejects(
      () => safeFetch('/api/tasks'),
      (err: unknown) => {
        assert.equal(err instanceof NetworkError, true);
        assert.equal((err as NetworkError).cause, 'network down');
        return true;
      },
    );

    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    globalThis.fetch = async () => {
      throw abortError;
    };

    await assert.rejects(
      () => safeFetch('/api/tasks'),
      (err: unknown) => {
        assert.equal(err, abortError);
        assert.equal(isAbortError(err), true);
        assert.equal(err instanceof NetworkError, false);
        return true;
      },
    );

    const controller = new AbortController();
    controller.abort('user-cancelled');
    globalThis.fetch = async (_input, init) => {
      throw init?.signal?.reason;
    };

    await assert.rejects(
      () => safeFetch('/api/tasks', { signal: controller.signal }),
      (err: unknown) => {
        assert.equal(err, 'user-cancelled');
        assert.equal(err instanceof NetworkError, false);
        return true;
      },
    );
  });

  it('httpClient propagates NetworkError, UnauthorizedError, and backend validation errors properly', async () => {
    installMockLocalStorage({ taskflow_auth_token: 'test-token' });
    globalThis.fetch = async () => {
      throw new TypeError('fetch failed');
    };

    await assert.rejects(
      () => httpClient.get('/tasks'),
      (err: unknown) => err instanceof NetworkError && isNetworkError(err),
    );

    await assert.rejects(
      () => httpClient.void('/tasks/1', { method: 'DELETE' }),
      (err: unknown) => err instanceof NetworkError && isNetworkError(err),
    );

    // 400 preserves backend validation message
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: ['Tên nhóm không hợp lệ'] }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      () => httpClient.post('/teams', { name: '' }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 400 &&
        err.message === 'Tên nhóm không hợp lệ',
    );

    // 401 notifies unauthorized listeners and throws UnauthorizedError
    let notified = 0;
    const unsubscribe = subscribeUnauthorized(() => {
      notified += 1;
    });
    try {
      globalThis.fetch = async () => new Response(null, { status: 401 });
      await assert.rejects(
        () => httpClient.get('/tasks'),
        (err: unknown) =>
          err instanceof UnauthorizedError && isUnauthorizedError(err),
      );
      assert.equal(notified, 1);
    } finally {
      unsubscribe();
    }
  });
});
