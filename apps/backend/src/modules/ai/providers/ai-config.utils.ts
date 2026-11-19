export const DEFAULT_AI_PROVIDER = 'openai-compatible';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MIN_TIMEOUT_MS = 5_000;
export const MAX_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_TOKENS = 2_048;
export const MIN_MAX_TOKENS = 256;
export const MAX_MAX_TOKENS = 8_192;

const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  'openai-compatible': '',
};

export interface AiConfig {
  configured: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxTokens: number;
}

function clampInt(
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const trimmed = rawValue?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

/**
 * Loads and normalizes LLM provider configuration from environment variables.
 * Fails closed when any required credential or endpoint field is missing.
 */
export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = env.LLM_PROVIDER?.trim().toLowerCase() || DEFAULT_AI_PROVIDER;
  const rawBaseUrl = (env.LLM_BASE_URL?.trim() ?? '').replace(/\/+$/, '');
  const baseUrl = rawBaseUrl || (DEFAULT_PROVIDER_BASE_URLS[provider] ?? '');
  const apiKey = env.LLM_API_KEY?.trim() ?? '';
  const model = env.LLM_MODEL?.trim() ?? '';

  return {
    configured: Boolean(baseUrl && apiKey && model),
    provider,
    baseUrl,
    apiKey,
    model,
    timeoutMs: clampInt(
      env.LLM_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    ),
    maxTokens: clampInt(
      env.LLM_MAX_TOKENS,
      DEFAULT_MAX_TOKENS,
      MIN_MAX_TOKENS,
      MAX_MAX_TOKENS,
    ),
  };
}
