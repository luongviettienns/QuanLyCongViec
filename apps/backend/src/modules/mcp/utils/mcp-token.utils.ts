import { createHash, randomBytes } from 'node:crypto';

export const MCP_TOKEN_PREFIX = 'tfp_';
export const MAX_ACTIVE_MCP_TOKENS_PER_USER = 10;

export interface GeneratedPersonalAccessToken {
  rawToken: string;
  tokenPrefix: string;
  tokenHash: string;
}

export function hashPersonalAccessToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generatePersonalAccessToken(): GeneratedPersonalAccessToken {
  const randomHex = randomBytes(24).toString('hex');
  const rawToken = `${MCP_TOKEN_PREFIX}${randomHex}`;
  return {
    rawToken,
    tokenPrefix: rawToken.slice(0, 12),
    tokenHash: hashPersonalAccessToken(rawToken),
  };
}

export function isPersonalAccessTokenFormat(token: string): boolean {
  return token.startsWith(MCP_TOKEN_PREFIX) && token.length >= MCP_TOKEN_PREFIX.length + 16;
}

export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export function computeTokenExpiresAt(
  expiresInDays: number | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!expiresInDays || expiresInDays <= 0) {
    return null;
  }
  return new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
}
