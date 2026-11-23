#!/bin/sh
set -eu

export VAULT_ADDR="${VAULT_ADDR:-http://vault:8200}"
export VAULT_TOKEN="${VAULT_TOKEN:-taskflow-dev-root}"

echo "[vault-init] Waiting for Vault at ${VAULT_ADDR}..."
until vault status >/dev/null 2>&1; do
  sleep 1
done

echo "[vault-init] Enabling AppRole auth method..."
vault auth enable approle >/dev/null 2>&1 || true

echo "[vault-init] Writing read-only policy 'taskflow-backend'..."
vault policy write taskflow-backend - <<'EOF'
path "secret/data/taskflow/backend" {
  capabilities = ["read"]
}
EOF

echo "[vault-init] Seeding backend secrets into secret/taskflow/backend..."
vault kv put secret/taskflow/backend \
  DATABASE_URL="${DATABASE_URL}" \
  REDIS_URL="${REDIS_URL:-redis://redis:6379}" \
  JWT_SECRET="${JWT_SECRET}" \
  JWT_EXPIRATION="${JWT_EXPIRATION:-7d}" \
  INTERNAL_API_KEY="${INTERNAL_API_KEY}" \
  CORS_ORIGINS="${CORS_ORIGINS:-*}" \
  LLM_PROVIDER="${LLM_PROVIDER:-openai-compatible}" \
  LLM_BASE_URL="${LLM_BASE_URL:-}" \
  LLM_API_KEY="${LLM_API_KEY:-}" \
  LLM_MODEL="${LLM_MODEL:-}" \
  LLM_TIMEOUT_MS="${LLM_TIMEOUT_MS:-30000}" \
  LLM_MAX_TOKENS="${LLM_MAX_TOKENS:-2048}" >/dev/null

echo "[vault-init] Configuring AppRole 'taskflow-backend'..."
vault write auth/approle/role/taskflow-backend \
  token_policies="taskflow-backend" \
  token_ttl="1h" \
  token_max_ttl="4h" \
  secret_id_ttl="24h" >/dev/null

mkdir -p /vault-auth
vault read -field=role_id auth/approle/role/taskflow-backend/role-id > /vault-auth/role_id
vault write -f -field=secret_id auth/approle/role/taskflow-backend/secret-id > /vault-auth/secret_id
chmod 0644 /vault-auth/role_id /vault-auth/secret_id

echo "[vault-init] Done. AppRole credentials written to /vault-auth."
