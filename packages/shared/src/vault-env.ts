import { readFileSync } from 'node:fs';

export interface LoadVaultEnvOptions {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}

export interface LoadVaultEnvResult {
  loaded: boolean;
  reason?: 'disabled' | 'already_loaded';
  keysCount: number;
}

const DEFAULT_SECRET_PATH = 'secret/data/taskflow/backend';
const DEFAULT_TIMEOUT_MS = 10_000;

function readEnvOrFile(
  env: Record<string, string | undefined>,
  key: string,
  fileKey: string,
): string | undefined {
  const inline = env[key]?.trim();
  if (inline) return inline;

  const filePath = env[fileKey]?.trim();
  if (!filePath) return undefined;

  const content = readFileSync(filePath, 'utf8').trim();
  return content || undefined;
}

async function resolveVaultToken(
  vaultAddr: string,
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch,
): Promise<string> {
  const roleId = readEnvOrFile(env, 'VAULT_ROLE_ID', 'VAULT_ROLE_ID_FILE');
  const secretId = readEnvOrFile(env, 'VAULT_SECRET_ID', 'VAULT_SECRET_ID_FILE');

  if (roleId && secretId) {
    const loginRes = await fetchFn(`${vaultAddr}/v1/auth/approle/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    const loginBody = (await loginRes.json().catch(() => ({}))) as {
      auth?: { client_token?: unknown };
      errors?: unknown[];
    };

    if (!loginRes.ok || typeof loginBody.auth?.client_token !== 'string' || !loginBody.auth.client_token) {
      throw new Error(
        `Vault AppRole login failed (${loginRes.status}): ${JSON.stringify(loginBody.errors ?? [])}`,
      );
    }

    return loginBody.auth.client_token;
  }

  const directToken = readEnvOrFile(env, 'VAULT_TOKEN', 'VAULT_TOKEN_FILE');
  if (directToken) {
    return directToken;
  }

  throw new Error(
    'VAULT_ADDR is set but credentials are missing (provide VAULT_ROLE_ID + VAULT_SECRET_ID or VAULT_TOKEN)',
  );
}

/**
 * Fetches KV v2 secrets from HashiCorp Vault into `env` in memory without writing a .env file.
 * Skips silently when VAULT_ADDR is unset so local unit/E2E tests remain unaffected.
 */
export async function loadVaultEnv(
  options: LoadVaultEnvOptions = {},
): Promise<LoadVaultEnvResult> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchFn ?? fetch;

  const rawAddr = env.VAULT_ADDR?.trim();
  if (!rawAddr) {
    return { loaded: false, reason: 'disabled', keysCount: 0 };
  }

  if (env.VAULT_LOADED === '1') {
    return { loaded: false, reason: 'already_loaded', keysCount: 0 };
  }

  const vaultAddr = rawAddr.replace(/\/+$/, '');
  const secretPath = (env.VAULT_SECRET_PATH?.trim() || DEFAULT_SECRET_PATH).replace(/^\/+/, '');
  const token = await resolveVaultToken(vaultAddr, env, fetchFn);

  const secretRes = await fetchFn(`${vaultAddr}/v1/${secretPath}`, {
    method: 'GET',
    headers: { 'X-Vault-Token': token },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  const secretBody = (await secretRes.json().catch(() => ({}))) as {
    data?: { data?: Record<string, unknown> };
    errors?: unknown[];
  };

  if (!secretRes.ok) {
    throw new Error(
      `Vault secret read failed (${secretRes.status}) at "${secretPath}": ${JSON.stringify(secretBody.errors ?? [])}`,
    );
  }

  const secrets = secretBody.data?.data;
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new Error(`Vault secret payload at "${secretPath}" is missing KV v2 data.data`);
  }

  let keysCount = 0;
  for (const [key, value] of Object.entries(secrets)) {
    if (value === null || value === undefined) continue;
    keysCount += 1;
    // Keep explicitly injected non-empty env vars higher precedence than Vault defaults
    if (env[key] === undefined || env[key] === '') {
      env[key] = String(value);
    }
  }

  env.VAULT_LOADED = '1';
  return { loaded: true, keysCount };
}
