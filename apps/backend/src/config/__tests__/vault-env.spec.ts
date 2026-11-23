import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadVaultEnv } from '../vault-env.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('loadVaultEnv', () => {
  it('skips loading when VAULT_ADDR is not configured', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const env: Record<string, string | undefined> = {};

    const result = await loadVaultEnv({ env, fetchFn: fetchMock });

    expect(result).toEqual({ loaded: false, reason: 'disabled', keysCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips loading when VAULT_LOADED=1 is already set', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const env: Record<string, string | undefined> = {
      VAULT_ADDR: 'http://vault:8200',
      VAULT_LOADED: '1',
    };

    const result = await loadVaultEnv({ env, fetchFn: fetchMock });

    expect(result).toEqual({ loaded: false, reason: 'already_loaded', keysCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in via AppRole, loads KV v2 secrets into env, and preserves existing non-empty keys', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ auth: { client_token: 'hvs.short-lived-token' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            data: {
              DATABASE_URL: 'postgresql://user:pass@postgres:5432/taskflow',
              JWT_SECRET: 'vault_jwt_secret_12345678901234567890',
              LLM_API_KEY: 'sk-vault-key',
              EMPTY_ALLOWED: '',
            },
          },
        }),
      );

    const env: Record<string, string | undefined> = {
      VAULT_ADDR: 'http://vault:8200/',
      VAULT_SECRET_PATH: 'secret/data/taskflow/backend',
      VAULT_ROLE_ID: 'role-123',
      VAULT_SECRET_ID: 'secret-456',
      JWT_SECRET: 'explicit_override_secret',
    };

    const result = await loadVaultEnv({ env, fetchFn: fetchMock });

    expect(result).toEqual({ loaded: true, keysCount: 4 });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://vault:8200/v1/auth/approle/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ role_id: 'role-123', secret_id: 'secret-456' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://vault:8200/v1/secret/data/taskflow/backend',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Vault-Token': 'hvs.short-lived-token' },
      }),
    );
    expect(env.DATABASE_URL).toBe('postgresql://user:pass@postgres:5432/taskflow');
    expect(env.LLM_API_KEY).toBe('sk-vault-key');
    expect(env.JWT_SECRET).toBe('explicit_override_secret');
    expect(env.VAULT_LOADED).toBe('1');
  });

  it('reads role_id and secret_id from *_FILE paths when inline env vars are absent', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vault-env-test-'));
    try {
      const roleFile = path.join(dir, 'role_id');
      const secretFile = path.join(dir, 'secret_id');
      writeFileSync(roleFile, 'file-role-id\n', 'utf8');
      writeFileSync(secretFile, 'file-secret-id\r\n', 'utf8');

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ auth: { client_token: 'hvs.file-token' } }))
        .mockResolvedValueOnce(
          jsonResponse({ data: { data: { INTERNAL_API_KEY: 'vault-internal-key' } } }),
        );

      const env: Record<string, string | undefined> = {
        VAULT_ADDR: 'http://127.0.0.1:8200',
        VAULT_ROLE_ID_FILE: roleFile,
        VAULT_SECRET_ID_FILE: secretFile,
      };

      const result = await loadVaultEnv({ env, fetchFn: fetchMock });

      expect(result).toEqual({ loaded: true, keysCount: 1 });
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'http://127.0.0.1:8200/v1/auth/approle/login',
        expect.objectContaining({
          body: JSON.stringify({ role_id: 'file-role-id', secret_id: 'file-secret-id' }),
        }),
      );
      expect(env.INTERNAL_API_KEY).toBe('vault-internal-key');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('supports direct VAULT_TOKEN when AppRole is not configured', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ data: { data: { JWT_SECRET: 'direct-token-secret' } } }),
    );

    const env: Record<string, string | undefined> = {
      VAULT_ADDR: 'http://127.0.0.1:8200',
      VAULT_TOKEN: 'hvs.direct',
    };

    const result = await loadVaultEnv({ env, fetchFn: fetchMock });

    expect(result).toEqual({ loaded: true, keysCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(env.JWT_SECRET).toBe('direct-token-secret');
  });

  it('fails closed when VAULT_ADDR is set without credentials or when Vault returns an error', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      loadVaultEnv({ env: { VAULT_ADDR: 'http://vault:8200' }, fetchFn: fetchMock }),
    ).rejects.toThrow(/VAULT_ROLE_ID|VAULT_TOKEN/);

    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: ['invalid role or secret id'] }, 400));
    await expect(
      loadVaultEnv({
        env: {
          VAULT_ADDR: 'http://vault:8200',
          VAULT_ROLE_ID: 'bad',
          VAULT_SECRET_ID: 'bad',
        },
        fetchFn: fetchMock,
      }),
    ).rejects.toThrow(/AppRole login failed \(400\)/);

    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: ['permission denied'] }, 403));
    await expect(
      loadVaultEnv({
        env: { VAULT_ADDR: 'http://vault:8200', VAULT_TOKEN: 'hvs.bad' },
        fetchFn: fetchMock,
      }),
    ).rejects.toThrow(/Vault secret read failed \(403\)/);
  });
});
