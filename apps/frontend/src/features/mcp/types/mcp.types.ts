export type McpTokenScope = 'READ' | 'READ_WRITE';

export interface McpTokenRecord {
  id: number;
  name: string;
  tokenPrefix: string;
  scope: McpTokenScope;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateMcpTokenPayload {
  name: string;
  expiresInDays?: number | null;
  scope?: McpTokenScope;
}

export interface CreateMcpTokenResponse {
  token: string;
  record: McpTokenRecord;
}
