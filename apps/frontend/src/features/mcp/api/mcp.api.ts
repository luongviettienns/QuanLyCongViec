import {
  getAuthHeaders,
  handleApiResponse,
  safeFetch,
} from '../../../shared/api';
import type {
  CreateMcpTokenPayload,
  CreateMcpTokenResponse,
  McpTokenRecord,
} from '../types/mcp.types.ts';

export async function listMcpTokens(signal?: AbortSignal): Promise<McpTokenRecord[]> {
  const response = await safeFetch('/api/mcp/tokens', {
    method: 'GET',
    headers: getAuthHeaders(),
    signal,
  });
  return handleApiResponse<McpTokenRecord[]>(response, 'Không thể tải danh sách API token MCP');
}

export async function createMcpToken(
  payload: CreateMcpTokenPayload,
): Promise<CreateMcpTokenResponse> {
  const response = await safeFetch('/api/mcp/tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleApiResponse<CreateMcpTokenResponse>(response, 'Không thể tạo API token MCP');
}

export async function revokeMcpToken(tokenId: number): Promise<McpTokenRecord> {
  const response = await safeFetch(`/api/mcp/tokens/${tokenId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleApiResponse<McpTokenRecord>(response, 'Không thể thu hồi API token MCP');
}
