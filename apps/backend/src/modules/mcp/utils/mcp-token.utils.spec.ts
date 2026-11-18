import { describe, it, expect } from 'vitest';
import {
  MCP_TOKEN_PREFIX,
  generatePersonalAccessToken,
  hashPersonalAccessToken,
  isPersonalAccessTokenFormat,
  extractBearerToken,
  computeTokenExpiresAt,
} from './mcp-token.utils.js';

describe('mcp-token.utils', () => {
  it('generates prefixed token, safe prefix, and deterministic SHA-256 hash', () => {
    const generated = generatePersonalAccessToken();
    expect(generated.rawToken.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(generated.rawToken.length).toBe(MCP_TOKEN_PREFIX.length + 48);
    expect(generated.tokenPrefix).toBe(generated.rawToken.slice(0, 12));
    expect(generated.tokenHash).toBe(hashPersonalAccessToken(generated.rawToken));
    expect(generated.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(isPersonalAccessTokenFormat(generated.rawToken)).toBe(true);
    expect(isPersonalAccessTokenFormat('eyJhbGciOiJIUzI1NiJ9.foo.bar')).toBe(false);
  });

  it('extracts Bearer token cleanly and rejects malformed headers', () => {
    expect(extractBearerToken('Bearer tfp_abc123')).toBe('tfp_abc123');
    expect(extractBearerToken('bearer   jwt.token.here  ')).toBe('jwt.token.here');
    expect(extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('computes expiresAt cleanly for positive day counts and returns null otherwise', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');
    expect(computeTokenExpiresAt(null, now)).toBeNull();
    expect(computeTokenExpiresAt(undefined, now)).toBeNull();
    const exp = computeTokenExpiresAt(30, now);
    expect(exp?.toISOString()).toBe('2026-12-18T10:00:00.000Z');
  });
});
