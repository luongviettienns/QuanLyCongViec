import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcpEndpointUrl,
  buildMcpClientConfigSnippet,
  isMcpTokenActive,
  formatMcpTokenStatus,
} from '../mcp-config.utils.ts';

describe('mcp-config.utils', () => {
  it('buildMcpEndpointUrl resolves absolute API base or browser origin cleanly', () => {
    assert.equal(
      buildMcpEndpointUrl({ apiBaseUrl: 'https://api.taskflow.vn/api', origin: 'https://app.taskflow.vn' }),
      'https://api.taskflow.vn/api/mcp',
    );
    assert.equal(
      buildMcpEndpointUrl({ apiBaseUrl: 'https://api.taskflow.vn/api/', origin: 'https://app.taskflow.vn' }),
      'https://api.taskflow.vn/api/mcp',
    );
    assert.equal(
      buildMcpEndpointUrl({
        apiBaseUrl: 'https://taskflow-backend.onrender.com',
        origin: 'https://app.taskflow.vn',
      }),
      'https://taskflow-backend.onrender.com/api/mcp',
    );
    assert.equal(
      buildMcpEndpointUrl({ apiBaseUrl: '/api', origin: 'http://localhost:3003' }),
      'http://localhost:3003/api/mcp',
    );
    assert.equal(
      buildMcpEndpointUrl({ apiBaseUrl: '', origin: 'http://localhost:3003/' }),
      'http://localhost:3003/api/mcp',
    );
  });

  it('buildMcpClientConfigSnippet outputs valid JSON with Bearer header and placeholder fallback', () => {
    const snippet = buildMcpClientConfigSnippet('http://localhost:3002/api/mcp', 'tfp_secret123');
    const parsed = JSON.parse(snippet) as {
      mcpServers: {
        taskflow: {
          url: string;
          headers: { Authorization: string };
        };
      };
    };
    assert.equal(parsed.mcpServers.taskflow.url, 'http://localhost:3002/api/mcp');
    assert.equal(parsed.mcpServers.taskflow.headers.Authorization, 'Bearer tfp_secret123');

    const placeholderSnippet = buildMcpClientConfigSnippet('http://localhost:3002/api/mcp');
    assert.equal(placeholderSnippet.includes('Bearer <YOUR_TASKFLOW_MCP_TOKEN>'), true);
  });

  it('isMcpTokenActive and formatMcpTokenStatus classify active, expired, and revoked tokens accurately', () => {
    const now = new Date('2026-11-18T10:00:00.000Z');

    const active = {
      revokedAt: null,
      expiresAt: '2026-12-18T10:00:00.000Z',
    };
    assert.equal(isMcpTokenActive(active, now), true);
    assert.deepEqual(formatMcpTokenStatus(active, now), { label: 'Đang hoạt động', color: 'green' });

    const neverExpires = { revokedAt: null, expiresAt: null };
    assert.equal(isMcpTokenActive(neverExpires, now), true);

    const expired = { revokedAt: null, expiresAt: '2026-11-17T10:00:00.000Z' };
    assert.equal(isMcpTokenActive(expired, now), false);
    assert.deepEqual(formatMcpTokenStatus(expired, now), { label: 'Đã hết hạn', color: 'orange' });

    const revoked = {
      revokedAt: '2026-11-18T08:00:00.000Z',
      expiresAt: '2026-12-18T10:00:00.000Z',
    };
    assert.equal(isMcpTokenActive(revoked, now), false);
    assert.deepEqual(formatMcpTokenStatus(revoked, now), { label: 'Đã thu hồi', color: 'default' });
  });
});
