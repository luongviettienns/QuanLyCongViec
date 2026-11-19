import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAiConfig } from '../ai-config.utils.js';
import { AiProviderRegistry } from '../ai-provider.registry.js';
import { OpenAiCompatibleProvider } from '../openai-compatible.provider.js';

describe('loadAiConfig', () => {
  it('returns configured: false when LLM_BASE_URL, LLM_API_KEY, or LLM_MODEL is missing', () => {
    expect(
      loadAiConfig({
        LLM_API_KEY: 'sk-secret',
        LLM_MODEL: 'gpt-4o-mini',
      }).configured,
    ).toBe(false);

    expect(
      loadAiConfig({
        LLM_BASE_URL: 'https://api.example.com/v1',
        LLM_MODEL: 'gpt-4o-mini',
      }).configured,
    ).toBe(false);

    expect(
      loadAiConfig({
        LLM_BASE_URL: 'https://api.example.com/v1',
        LLM_API_KEY: 'sk-secret',
      }).configured,
    ).toBe(false);

    expect(loadAiConfig({}).configured).toBe(false);
  });

  it('defaults provider to openai-compatible and strips trailing slashes from baseUrl', () => {
    const config = loadAiConfig({
      LLM_BASE_URL: 'https://api.example.com/v1///',
      LLM_API_KEY: '  sk-secret-key  ',
      LLM_MODEL: '  gpt-4o-mini  ',
    });

    expect(config).toEqual({
      configured: true,
      provider: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-key',
      model: 'gpt-4o-mini',
      timeoutMs: 30000,
      maxTokens: 2048,
    });
  });

  it('clamps timeoutMs (5000..120000, default 30000) and maxTokens (256..8192, default 2048)', () => {
    expect(
      loadAiConfig({
        LLM_TIMEOUT_MS: '1000',
        LLM_MAX_TOKENS: '64',
      }),
    ).toMatchObject({
      timeoutMs: 5000,
      maxTokens: 256,
    });

    expect(
      loadAiConfig({
        LLM_TIMEOUT_MS: '999999',
        LLM_MAX_TOKENS: '50000',
      }),
    ).toMatchObject({
      timeoutMs: 120000,
      maxTokens: 8192,
    });

    expect(
      loadAiConfig({
        LLM_TIMEOUT_MS: 'not-a-number',
        LLM_MAX_TOKENS: '',
      }),
    ).toMatchObject({
      timeoutMs: 30000,
      maxTokens: 2048,
    });
  });
});

describe('OpenAiCompatibleProvider', () => {
  const baseConfig = loadAiConfig({
    LLM_PROVIDER: 'openai-compatible',
    LLM_BASE_URL: 'https://llm.internal.example/v1/',
    LLM_API_KEY: 'sk-super-secret-token-12345',
    LLM_MODEL: 'gpt-4o-mini',
    LLM_TIMEOUT_MS: '15000',
    LLM_MAX_TOKENS: '1024',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs to ${baseUrl}/chat/completions with expected headers and payload and parses content + toolCalls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: 'Đang kiểm tra công việc của bạn.',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'list_tasks',
                      arguments: '{"status":"TODO","limit":5}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(baseConfig);
    const result = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Xem các task TODO' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_tasks',
            description: 'List user tasks',
            parameters: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.internal.example/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer sk-super-secret-token-12345',
    });

    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Xem các task TODO' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_tasks',
            description: 'List user tasks',
            parameters: {
              type: 'object',
              properties: { status: { type: 'string' } },
            },
          },
        },
      ],
      tool_choice: 'auto',
      max_tokens: 1024,
      temperature: 0.2,
    });

    expect(result).toEqual({
      content: 'Đang kiểm tra công việc của bạn.',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call_1',
          name: 'list_tasks',
          rawArguments: '{"status":"TODO","limit":5}',
          arguments: { status: 'TODO', limit: 5 },
          parseError: undefined,
        },
      ],
    });
  });

  it('sets parseError when tool function.arguments is malformed JSON without throwing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_bad',
                    type: 'function',
                    function: {
                      name: 'create_task_proposal',
                      arguments: '{"title": "Broken JSON',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(baseConfig);
    const result = await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Tạo task' }],
    });

    expect(result.content).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      id: 'call_bad',
      name: 'create_task_proposal',
      rawArguments: '{"title": "Broken JSON',
      arguments: {},
    });
    expect(result.toolCalls[0].parseError).toBeTruthy();
  });

  it.each([
    { status: 401, expectedError: ServiceUnavailableException },
    { status: 429, expectedError: ServiceUnavailableException },
    { status: 500, expectedError: BadGatewayException },
  ])(
    'maps HTTP $status without exposing apiKey or baseUrl',
    async ({ status, expectedError }) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          `error for ${baseConfig.baseUrl} with key ${baseConfig.apiKey}`,
          { status },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      const provider = new OpenAiCompatibleProvider(baseConfig);

      let caught: unknown;
      try {
        await provider.chatCompletion({
          messages: [{ role: 'user', content: 'Hi' }],
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(expectedError);
      const message = (caught as Error).message;
      expect(message).not.toContain(baseConfig.apiKey);
      expect(message).not.toContain(baseConfig.baseUrl);
    },
  );

  it('maps AbortError timeout to ServiceUnavailableException without exposing apiKey or baseUrl', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(baseConfig);

    let caught: unknown;
    try {
      await provider.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    const message = (caught as Error).message;
    expect(message).not.toContain(baseConfig.apiKey);
    expect(message).not.toContain(baseConfig.baseUrl);
  });

  it('throws ServiceUnavailableException when provider itself is unconfigured', async () => {
    const unconfigured = loadAiConfig({});
    const provider = new OpenAiCompatibleProvider(unconfigured);

    await expect(
      provider.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws BadGatewayException when 200 OK response JSON is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(baseConfig);

    await expect(
      provider.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow(
      new BadGatewayException('Phản hồi từ nhà cung cấp AI không hợp lệ'),
    );
  });

  it('cancels unread response.body stream when !response.ok', async () => {
    const cancelMock = vi.fn().mockResolvedValue(undefined);
    const mockResponse = {
      ok: false,
      status: 502,
      body: { cancel: cancelMock },
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(baseConfig);

    await expect(
      provider.chatCompletion({
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow(BadGatewayException);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });
});

describe('AiProviderRegistry', () => {
  it('reports unconfigured status and throws ServiceUnavailableException from getProvider()', () => {
    const registry = new AiProviderRegistry({});

    expect(registry.isConfigured()).toBe(false);
    expect(registry.getStatus()).toEqual({
      configured: false,
      provider: 'openai-compatible',
      model: null,
    });
    expect(() => registry.getProvider()).toThrow(ServiceUnavailableException);
  });

  it('masks model as null when LLM_API_KEY is missing even if LLM_MODEL is set', () => {
    const registry = new AiProviderRegistry({
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'https://api.example.com/v1',
      LLM_MODEL: 'gpt-4o-mini',
    });

    expect(registry.isConfigured()).toBe(false);
    expect(registry.getStatus()).toEqual({
      configured: false,
      provider: 'openai-compatible',
      model: null,
    });
  });

  it('returns configured status and OpenAiCompatibleProvider instance when configured', () => {
    const registry = new AiProviderRegistry({
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'https://api.example.com/v1',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'gpt-4o-mini',
    });

    expect(registry.isConfigured()).toBe(true);
    expect(registry.getStatus()).toEqual({
      configured: true,
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
    });
    expect(registry.getProvider()).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('returns isConfigured() === false, masks model: null, and throws ServiceUnavailableException when provider is unsupported', () => {
    const registry = new AiProviderRegistry({
      LLM_PROVIDER: 'unsupported-provider',
      LLM_BASE_URL: 'https://api.example.com/v1',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'claude-3-5-sonnet',
    });

    expect(registry.isConfigured()).toBe(false);
    expect(registry.getStatus()).toEqual({
      configured: false,
      provider: 'unsupported-provider',
      model: null,
    });
    expect(() => registry.getProvider()).toThrow(ServiceUnavailableException);
  });
});
