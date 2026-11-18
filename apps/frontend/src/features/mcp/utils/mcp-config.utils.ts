export function buildMcpEndpointUrl(options: {
  apiBaseUrl?: string;
  origin?: string;
}): string {
  const base = (options.apiBaseUrl ?? '').trim().replace(/\/+$/, '');
  const origin = (options.origin ?? '').trim().replace(/\/+$/, '');

  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base.endsWith('/api') ? `${base}/mcp` : `${base}/api/mcp`;
  }

  const normalizedPath = base
    ? base.startsWith('/')
      ? base
      : `/${base}`
    : '/api';

  return origin ? `${origin}${normalizedPath}/mcp` : `${normalizedPath}/mcp`;
}

export function buildMcpClientConfigSnippet(endpointUrl: string, rawToken?: string): string {
  const tokenValue = rawToken && rawToken.trim().length > 0 ? rawToken.trim() : '<YOUR_TASKFLOW_MCP_TOKEN>';
  return JSON.stringify(
    {
      mcpServers: {
        taskflow: {
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${tokenValue}`,
          },
        },
      },
    },
    null,
    2,
  );
}

export function isMcpTokenActive(
  token: { revokedAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): boolean {
  if (token.revokedAt) return false;
  if (token.expiresAt) {
    const expMs = Date.parse(token.expiresAt);
    if (!Number.isNaN(expMs) && expMs <= now.getTime()) {
      return false;
    }
  }
  return true;
}

export function formatMcpTokenStatus(
  token: { revokedAt: string | null; expiresAt: string | null },
  now: Date = new Date(),
): { label: string; color: 'green' | 'orange' | 'default' } {
  if (token.revokedAt) {
    return { label: 'Đã thu hồi', color: 'default' };
  }
  if (token.expiresAt) {
    const expMs = Date.parse(token.expiresAt);
    if (!Number.isNaN(expMs) && expMs <= now.getTime()) {
      return { label: 'Đã hết hạn', color: 'orange' };
    }
  }
  return { label: 'Đang hoạt động', color: 'green' };
}
