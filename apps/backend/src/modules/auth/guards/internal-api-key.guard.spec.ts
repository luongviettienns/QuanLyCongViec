import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InternalApiKeyGuard } from './internal-api-key.guard.js';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

describe('InternalApiKeyGuard', () => {
  let guard: InternalApiKeyGuard;
  const originalEnv = process.env.INTERNAL_API_KEY;

  beforeEach(() => {
    guard = new InternalApiKeyGuard();
    process.env.INTERNAL_API_KEY = 'super_secret_production_key_123';
  });

  afterEach(() => {
    process.env.INTERNAL_API_KEY = originalEnv;
  });

  function createMockContext(headerValue?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: headerValue !== undefined ? { 'x-internal-key': headerValue } : {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows access when provided key matches configured key exactly', () => {
    const context = createMockContext('super_secret_production_key_123');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when header is missing', () => {
    const context = createMockContext();
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when key is incorrect', () => {
    const context = createMockContext('wrong_secret');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for legacy hardcoded secret', () => {
    const context = createMockContext('taskflow-internal-secret');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('fail-closed: throws ForbiddenException when INTERNAL_API_KEY is not configured in env', () => {
    delete process.env.INTERNAL_API_KEY;
    const context = createMockContext('super_secret_production_key_123');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('fail-closed: throws ForbiddenException when INTERNAL_API_KEY is whitespace', () => {
    process.env.INTERNAL_API_KEY = '   ';
    const context = createMockContext('   ');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
