import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRuntimeError,
  getApiErrorDisplay,
  formatTechnicalErrorDetail,
  extractHttpStatus,
  hasCustomCategoryIcon,
} from '../error-pages.utils.ts';

function withMockNavigatorOnLine(onLine: boolean | undefined, fn: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: onLine === undefined ? undefined : { onLine },
    configurable: true,
    writable: true,
  });

  try {
    fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      delete (globalThis as Record<string, unknown>).navigator;
    }
  }
}

describe('error-pages.utils', () => {
  describe('extractHttpStatus', () => {
    it('extracts status from ApiError-like objects, statusCode, and Axios-style response', () => {
      assert.equal(extractHttpStatus({ status: 500 }), 500);
      assert.equal(extractHttpStatus({ statusCode: 403 }), 403);
      assert.equal(extractHttpStatus({ response: { status: 503 } }), 503);
      assert.equal(extractHttpStatus({ name: 'UnauthorizedError' }), 401);
      assert.equal(extractHttpStatus({ status: 0 }), 0);
      assert.equal(extractHttpStatus(new Error('plain')), undefined);
      assert.equal(extractHttpStatus(null), undefined);
      assert.equal(extractHttpStatus('500'), undefined);
    });
  });

  describe('network and offline classification', () => {
    it('classifies browser fetch TypeErrors and status 0 as retryable network errors', () => {
      const chromeFetchErr = new TypeError('Failed to fetch');
      const firefoxFetchErr = new TypeError('NetworkError when attempting to fetch resource.');
      const safariFetchErr = new TypeError('Load failed');
      const nodeFetchErr = new TypeError('fetch failed');
      const statusZeroErr = { status: 0, message: 'Network Error' };

      for (const err of [chromeFetchErr, firefoxFetchErr, safariFetchErr, nodeFetchErr, statusZeroErr]) {
        const apiDisplay = getApiErrorDisplay(err, { isOnline: true });
        assert.equal(apiDisplay.category, 'network');
        assert.equal(apiDisplay.status, 'error');
        assert.equal(apiDisplay.isRetryable, true);
        assert.ok(apiDisplay.title.length > 0);
        assert.ok(apiDisplay.subTitle.length > 0);

        const runtimeDisplay = classifyRuntimeError(err, { isOnline: true });
        assert.equal(runtimeDisplay.category, 'network');
        assert.equal(runtimeDisplay.isRetryable, true);
      }
    });

    it('classifies offline state from options.isOnline === false or navigator.onLine === false', () => {
      const fetchErr = new TypeError('Failed to fetch');
      const offlineFromOption = getApiErrorDisplay(fetchErr, { isOnline: false });
      assert.equal(offlineFromOption.category, 'offline');
      assert.equal(offlineFromOption.status, 'warning');
      assert.equal(offlineFromOption.isRetryable, true);

      withMockNavigatorOnLine(false, () => {
        const offlineFromNavigator = getApiErrorDisplay(new Error('Request failed'));
        assert.equal(offlineFromNavigator.category, 'offline');
        assert.equal(offlineFromNavigator.status, 'warning');
        assert.equal(offlineFromNavigator.isRetryable, true);

        const runtimeOffline = classifyRuntimeError(fetchErr);
        assert.equal(runtimeOffline.category, 'offline');
        assert.equal(runtimeOffline.status, 'warning');
        assert.equal(runtimeOffline.isRetryable, true);
      });
    });

    it('classifies timeout and node connection error codes as retryable network errors', () => {
      const timeoutErr = new Error('The operation timed out');
      timeoutErr.name = 'TimeoutError';
      const connRefused = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:3000' };

      assert.equal(getApiErrorDisplay(timeoutErr, { isOnline: true }).category, 'network');
      assert.equal(getApiErrorDisplay(connRefused, { isOnline: true }).category, 'network');
      assert.equal(getApiErrorDisplay(timeoutErr, { isOnline: true }).isRetryable, true);
    });
  });

  describe('chunk load classification', () => {
    it('classifies dynamic import and chunk failures before generic Failed to fetch', () => {
      const viteDynamicImportErr = new TypeError(
        'Failed to fetch dynamically imported module: https://example.com/assets/DashboardCharts-abc123.js',
      );
      const webpackChunkErr = new Error('Loading chunk 42 failed.');
      webpackChunkErr.name = 'ChunkLoadError';
      const safariModuleErr = new TypeError('Importing a module script failed.');
      const firefoxModuleErr = new TypeError('error loading dynamically imported module');
      const cssPreloadErr = new Error('Unable to preload CSS for /assets/app.css');

      for (const err of [
        viteDynamicImportErr,
        webpackChunkErr,
        safariModuleErr,
        firefoxModuleErr,
        cssPreloadErr,
      ]) {
        const display = classifyRuntimeError(err, { isOnline: true });
        assert.equal(display.category, 'chunk');
        assert.equal(display.status, 'warning');
        assert.equal(display.isRetryable, true);
      }
    });
  });

  describe('HTTP status classification', () => {
    it('classifies 5xx errors as retryable server errors without leaking raw internal message in subTitle', () => {
      const err500 = { status: 500, message: 'Internal Server Error: SQL syntax near SELECT' };
      const err503 = { response: { status: 503 }, message: 'Service Unavailable' };

      const display500 = getApiErrorDisplay(err500, { isOnline: true });
      assert.equal(display500.category, 'server');
      assert.equal(display500.status, '500');
      assert.equal(display500.isRetryable, true);
      assert.equal(display500.httpStatus, 500);
      assert.equal(display500.subTitle.includes('SQL syntax'), false);
      assert.ok(display500.technicalDetail?.includes('SQL syntax'));

      const display503 = getApiErrorDisplay(err503, { isOnline: true });
      assert.equal(display503.category, 'server');
      assert.equal(display503.status, '500');
      assert.equal(display503.httpStatus, 503);
      assert.equal(display503.isRetryable, true);
    });

    it('classifies 403, 401, and 404 accurately with non-retryable flags', () => {
      const err403 = { status: 403, message: 'Forbidden resource' };
      const display403 = getApiErrorDisplay(err403, { isOnline: true });
      assert.equal(display403.category, 'forbidden');
      assert.equal(display403.status, '403');
      assert.equal(display403.isRetryable, false);
      assert.equal(display403.httpStatus, 403);

      const err401 = { name: 'UnauthorizedError', status: 401, message: 'Unauthorized' };
      const display401 = getApiErrorDisplay(err401, { isOnline: true });
      assert.equal(display401.category, 'unauthorized');
      assert.equal(display401.status, 'warning');
      assert.equal(display401.isRetryable, false);
      assert.equal(display401.httpStatus, 401);

      const err404 = { status: 404, message: 'Not Found' };
      const api404 = getApiErrorDisplay(err404, { isOnline: true });
      assert.equal(api404.category, 'not_found');
      assert.equal(api404.status, '404');
      assert.equal(api404.isRetryable, false);
      assert.equal(api404.httpStatus, 404);

      const runtime404 = classifyRuntimeError(err404, { isOnline: true });
      assert.equal(runtime404.category, 'not_found');
      assert.equal(runtime404.status, '404');
    });

    it('handles 408/429 as retryable and other 4xx as non-retryable client errors', () => {
      const err429 = { status: 429, message: 'Too Many Requests' };
      const display429 = getApiErrorDisplay(err429, { isOnline: true });
      assert.equal(display429.status, 'warning');
      assert.equal(display429.isRetryable, true);
      assert.equal(display429.httpStatus, 429);

      const err400 = { status: 400, message: 'Bad Request' };
      const display400 = getApiErrorDisplay(err400, { isOnline: true });
      assert.equal(display400.status, 'error');
      assert.equal(display400.isRetryable, false);
      assert.equal(display400.httpStatus, 400);
    });
  });

  describe('unexpected render crash & non-Error fallbacks', () => {
    it('classifies JavaScript render crashes as unexpected even if navigator is offline', () => {
      const renderCrash = new TypeError("Cannot read properties of undefined (reading 'title')");
      const refCrash = new ReferenceError('tasks is not defined');

      const display1 = classifyRuntimeError(renderCrash, { isOnline: false });
      assert.equal(display1.category, 'unexpected');
      assert.equal(display1.status, 'error');
      assert.equal(display1.isRetryable, true);

      const display2 = classifyRuntimeError(refCrash, {
        isOnline: true,
        fallbackTitle: 'Lỗi tùy chỉnh',
        fallbackSubTitle: 'Mô tả tùy chỉnh',
      });
      assert.equal(display2.category, 'unexpected');
      assert.equal(display2.title, 'Lỗi tùy chỉnh');
      assert.equal(display2.subTitle, 'Mô tả tùy chỉnh');
    });

    it('never throws on non-Error values in classifyRuntimeError or getApiErrorDisplay', () => {
      const weirdValues: unknown[] = [
        null,
        undefined,
        'unexpected string',
        12345,
        true,
        Symbol('boom'),
        99n,
        Object.create(null),
        { get message() { throw new Error('getter failed'); } },
      ];

      for (const value of weirdValues) {
        const runtime = classifyRuntimeError(value, { isOnline: true });
        assert.ok(['403', '404', '500', 'warning', 'error'].includes(runtime.status));
        assert.ok(runtime.title.length > 0);
        assert.ok(runtime.subTitle.length > 0);

        const api = getApiErrorDisplay(value, { isOnline: true });
        assert.ok(['403', '404', '500', 'warning', 'error'].includes(api.status));
        assert.ok(api.title.length > 0);
        assert.ok(api.subTitle.length > 0);
      }
    });
  });

  describe('formatTechnicalErrorDetail', () => {
    it('returns empty string for null, undefined, or empty strings', () => {
      assert.equal(formatTechnicalErrorDetail(null), '');
      assert.equal(formatTechnicalErrorDetail(undefined), '');
      assert.equal(formatTechnicalErrorDetail('   '), '');
    });

    it('formats Error name, message, status, cause, and stack cleanly', () => {
      const rootCause = new Error('ECONNRESET');
      const err = new Error('Fetch failed at /api/tasks', { cause: rootCause });
      Object.assign(err, { status: 502 });

      const detail = formatTechnicalErrorDetail(err);
      assert.ok(detail.includes('HTTP 502'));
      assert.ok(detail.includes('Fetch failed at /api/tasks'));
      assert.ok(detail.includes('ECONNRESET'));
    });

    it('redacts Bearer tokens from technical output', () => {
      const err = new Error('Auth failed with Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig');
      const detail = formatTechnicalErrorDetail(err);
      assert.equal(detail.includes('eyJhbGciOiJIUzI1NiJ9'), false);
      assert.ok(detail.includes('Bearer [REDACTED]'));
    });

    it('never throws on circular objects, null-prototype objects, symbols, bigints, or throwing getters', () => {
      const circular: Record<string, unknown> = { message: 'Circular error' };
      circular.self = circular;

      const nullProto = Object.assign(Object.create(null), { code: 'ERR_NULL_PROTO', status: 500 });
      const throwingGetter = {
        get name() {
          throw new Error('bad name getter');
        },
        get message() {
          throw new Error('bad message getter');
        },
      };

      assert.ok(formatTechnicalErrorDetail(circular).includes('Circular error'));
      assert.ok(formatTechnicalErrorDetail(nullProto).includes('ERR_NULL_PROTO'));
      assert.equal(formatTechnicalErrorDetail(Symbol('test-sym')), 'Symbol(test-sym)');
      assert.equal(formatTechnicalErrorDetail(123456789n), '123456789');
      assert.equal(formatTechnicalErrorDetail(false), 'false');
      assert.doesNotThrow(() => formatTechnicalErrorDetail(throwingGetter));
    });

    it('truncates long technical details safely to maxLength', () => {
      const longMsg = 'A'.repeat(1000);
      const err = new Error(longMsg);

      const defaultTruncated = formatTechnicalErrorDetail(err);
      assert.ok(defaultTruncated.length <= 600);
      assert.ok(defaultTruncated.endsWith('...'));

      const shortTruncated = formatTechnicalErrorDetail(err, 50);
      assert.ok(shortTruncated.length <= 50);
      assert.ok(shortTruncated.endsWith('...'));

      assert.equal(formatTechnicalErrorDetail(err, 3), 'Err');
      assert.equal(formatTechnicalErrorDetail(err, 0), '');
    });

    it('handles cyclic error.cause chains without infinite recursion', () => {
      const errA = new Error('Outer failure') as Error & { cause?: unknown };
      const errB = new Error('Inner failure') as Error & { cause?: unknown };
      errA.cause = errB;
      errB.cause = errA;

      const detail = formatTechnicalErrorDetail(errA);
      assert.ok(detail.includes('Outer failure'));
      assert.ok(detail.includes('Inner failure'));
    });
  });

  describe('hasCustomCategoryIcon and status precedence', () => {
    it('distinguishes categories with custom icons from built-in Result illustrations', () => {
      assert.equal(hasCustomCategoryIcon('offline'), true);
      assert.equal(hasCustomCategoryIcon('network'), true);
      assert.equal(hasCustomCategoryIcon('chunk'), true);
      assert.equal(hasCustomCategoryIcon('unauthorized'), true);
      assert.equal(hasCustomCategoryIcon('unexpected'), true);
      assert.equal(hasCustomCategoryIcon('forbidden'), false);
      assert.equal(hasCustomCategoryIcon('not_found'), false);
      assert.equal(hasCustomCategoryIcon('server'), false);
      assert.equal(hasCustomCategoryIcon('client'), false);
    });

    it('keeps explicit HTTP status codes ahead of offline flag, while status 0 offline resolves to offline', () => {
      assert.equal(getApiErrorDisplay({ status: 403 }, { isOnline: false }).category, 'forbidden');
      assert.equal(getApiErrorDisplay({ status: 500 }, { isOnline: false }).category, 'server');
      assert.equal(getApiErrorDisplay({ status: 0 }, { isOnline: false }).category, 'offline');
      assert.equal(getApiErrorDisplay(undefined, { isOnline: true }).category, 'unexpected');
    });
  });
});
