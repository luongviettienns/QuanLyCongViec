import { BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../anthropic.provider.js';
import { loadAiConfig } from '../ai-config.utils.js';
import { AiProviderRegistry } from '../ai-provider.registry.js';
import { GeminiProvider } from '../gemini.provider.js';
import { OpenAiCompatibleProvider } from '../openai-compatible.provider.js';

function createSseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('loadAiConfig multi-provider defaults & normalization', () => {
  it('normalizes provider name with trim and lowercase', () => {
    const config = loadAiConfig({
      LLM_PROVIDER: '  Anthropic  ',
      LLM_API_KEY: 'sk-ant-secret',
      LLM_MODEL: 'claude-3-5-sonnet-latest',
    });

    expect(config.provider).toBe('anthropic');
    expect(config.configured).toBe(true);
    expect(config.baseUrl).toBe('https://api.anthropic.com/v1');
  });

  it('provides default baseUrl for anthropic and gemini when LLM_BASE_URL is blank', () => {
    const anthropic = loadAiConfig({
      LLM_PROVIDER: 'anthropic',
      LLM_BASE_URL: '   ',
      LLM_API_KEY: 'sk-ant-secret',
      LLM_MODEL: 'claude-3-5-sonnet-latest',
    });
    expect(anthropic.baseUrl).toBe('https://api.anthropic.com/v1');
    expect(anthropic.configured).toBe(true);

    const gemini = loadAiConfig({
      LLM_PROVIDER: 'GEMINI',
      LLM_API_KEY: 'AIza-secret',
      LLM_MODEL: 'gemini-2.5-flash',
    });
    expect(gemini.provider).toBe('gemini');
    expect(gemini.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(gemini.configured).toBe(true);
  });

  it('keeps openai-compatible unconfigured when LLM_BASE_URL is blank', () => {
    const config = loadAiConfig({
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: '   ',
      LLM_API_KEY: 'sk-secret',
      LLM_MODEL: 'gpt-4o-mini',
    });

    expect(config.baseUrl).toBe('');
    expect(config.configured).toBe(false);
  });

  it('allows explicit LLM_BASE_URL override for anthropic and gemini and strips trailing slashes', () => {
    const config = loadAiConfig({
      LLM_PROVIDER: 'gemini',
      LLM_BASE_URL: 'https://proxy.internal/gemini/v1beta///',
      LLM_API_KEY: 'AIza-secret',
      LLM_MODEL: 'gemini-2.5-flash',
    });

    expect(config.baseUrl).toBe('https://proxy.internal/gemini/v1beta');
    expect(config.configured).toBe(true);
  });
});

describe('OpenAiCompatibleProvider.chatCompletionStream', () => {
  const config = loadAiConfig({
    LLM_PROVIDER: 'openai-compatible',
    LLM_BASE_URL: 'https://llm.internal.example/v1',
    LLM_API_KEY: 'sk-openai-secret-999',
    LLM_MODEL: 'gpt-4o-mini',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('streams text deltas immediately and stitches multi-chunk tool_calls', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"chào!"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"list_tasks","arguments":"{\\"stat"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"us\\":\\"TODO\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(createSseResponse(sseChunks));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const provider = new OpenAiCompatibleProvider(config);
    const result = await provider.chatCompletionStream(
      {
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'list_tasks',
              description: 'List tasks',
              parameters: { type: 'object', properties: { status: { type: 'string' } } },
            },
          },
        ],
      },
      (text) => deltas.push(text),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://llm.internal.example/v1/chat/completions');
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true });
    expect(deltas).toEqual(['Xin ', 'chào!']);
    expect(result).toEqual({
      content: 'Xin chào!',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call_1',
          name: 'list_tasks',
          rawArguments: '{"status":"TODO"}',
          arguments: { status: 'TODO' },
          parseError: undefined,
        },
      ],
    });
  });

  it('handles SSE frames split across chunks and sets parseError on malformed streamed tool JSON', async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_bad","function":{"name":"bad_fn","arguments":"{\\"a\\":"}}]}}]}\r\n\r\ndata: {"choices":[{"delta":',
      '{"tool_calls":[{"index":0,"function":{"arguments":"broken"}}]},"finish_reason":"tool_calls"}]}\r\n\r\ndata: [DONE]\r\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSseResponse(sseChunks)));

    const provider = new OpenAiCompatibleProvider(config);
    const result = await provider.chatCompletionStream(
      { messages: [{ role: 'user', content: 'Run' }] },
      () => undefined,
    );

    expect(result.content).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      id: 'call_bad',
      name: 'bad_fn',
      rawArguments: '{"a":broken',
      arguments: {},
    });
    expect(result.toolCalls[0].parseError).toBeTruthy();
  });

  it('propagates caller AbortSignal cancellation as AbortError without logging timeout or leaking secrets', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const callerController = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OpenAiCompatibleProvider(config);
    const promise = provider.chatCompletionStream(
      {
        messages: [{ role: 'user', content: 'Cancel me' }],
        signal: callerController.signal,
      },
      () => undefined,
    );
    callerController.abort();

    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).name).toBe('AbortError');
    expect(caught).not.toBeInstanceOf(ServiceUnavailableException);
    expect((caught as Error).message).not.toContain(config.apiKey);
    expect((caught as Error).message).not.toContain(config.baseUrl);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(debugSpy).toHaveBeenCalledWith('AI provider request aborted by caller');
  });

  it('propagates caller AbortSignal mid-SSE-stream as AbortError without logging timeout, while timeouts still throw ServiceUnavailableException', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const callerController = new AbortController();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Xin "}}]}\n\n'));
      },
      pull() {
        return new Promise<void>(() => {
          // Hang until cancelled by caller abort
        });
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      ),
    );

    const deltas: string[] = [];
    const provider = new OpenAiCompatibleProvider(config);
    const promise = provider.chatCompletionStream(
      {
        messages: [{ role: 'user', content: 'Stream cancel' }],
        signal: callerController.signal,
      },
      (text) => {
        deltas.push(text);
        callerController.abort();
      },
    );

    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }

    expect(deltas).toEqual(['Xin ']);
    expect((caught as Error)?.name).toBe('AbortError');
    expect(caught).not.toBeInstanceOf(ServiceUnavailableException);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('timed out'));
    expect(debugSpy).toHaveBeenCalledWith('AI provider request aborted by caller');

    // Verify timeout path during SSE read still throws ServiceUnavailableException and logs timeout warning
    warnSpy.mockClear();
    vi.useFakeTimers();
    try {
      const slowConfig = loadAiConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'https://llm.internal.example/v1',
        LLM_API_KEY: 'sk-openai-secret-999',
        LLM_MODEL: 'gpt-4o-mini',
        LLM_TIMEOUT_MS: '5000',
      });
      const hangingStream = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => {});
        },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(hangingStream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        ),
      );

      const slowProvider = new OpenAiCompatibleProvider(slowConfig);
      const timeoutPromise = slowProvider.chatCompletionStream(
        { messages: [{ role: 'user', content: 'Timeout me' }] },
        () => undefined,
      );
      const assertion = expect(timeoutPromise).rejects.toThrow(ServiceUnavailableException);
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      expect(warnSpy).toHaveBeenCalledWith('AI provider request timed out');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AnthropicProvider', () => {
  const config = loadAiConfig({
    LLM_PROVIDER: 'anthropic',
    LLM_BASE_URL: 'https://anthropic.proxy.internal/v1',
    LLM_API_KEY: 'sk-ant-secret-12345',
    LLM_MODEL: 'claude-3-5-sonnet-latest',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps system, user, assistant tool_calls, and coalesces consecutive tool messages into one user turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Checking tasks now.' },
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'get_task',
              input: { taskId: 42 },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new AnthropicProvider(config);
    expect(provider.name).toBe('anthropic');

    const result = await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'System rule 1' },
        { role: 'system', content: 'System rule 2' },
        { role: 'user', content: 'Inspect tasks 1 and 2' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_a',
              type: 'function',
              function: { name: 'list_tasks', arguments: '{"limit":1}' },
            },
            {
              id: 'call_b',
              type: 'function',
              function: { name: 'list_teams', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_a', content: '{"tasks":[]}' },
        { role: 'tool', tool_call_id: 'call_b', content: '{"teams":[]}' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_task',
            description: 'Get a task',
            parameters: {
              type: 'object',
              properties: { taskId: { type: 'integer' } },
              required: ['taskId'],
            },
          },
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://anthropic.proxy.internal/v1/messages');
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-ant-secret-12345',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    });

    const body = JSON.parse(String(init.body));
    expect(body.system).toBe('System rule 1\n\nSystem rule 2');
    expect(body.tools).toEqual([
      {
        name: 'get_task',
        description: 'Get a task',
        input_schema: {
          type: 'object',
          properties: { taskId: { type: 'integer' } },
          required: ['taskId'],
        },
      },
    ]);
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Inspect tasks 1 and 2' }] },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_a', name: 'list_tasks', input: { limit: 1 } },
          { type: 'tool_use', id: 'call_b', name: 'list_teams', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_a', content: '{"tasks":[]}' },
          { type: 'tool_result', tool_use_id: 'call_b', content: '{"teams":[]}' },
        ],
      },
    ]);

    expect(result).toEqual({
      content: 'Checking tasks now.',
      finishReason: 'tool_use',
      toolCalls: [
        {
          id: 'toolu_1',
          name: 'get_task',
          rawArguments: '{"taskId":42}',
          arguments: { taskId: 42 },
        },
      ],
    });
  });

  it('streams Anthropic SSE events (text_delta and input_json_delta) into content, onDelta, and toolCalls', async () => {
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Đang "}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"tạo task."}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_stream_1","name":"create_task","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"title\\":\\""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"Deploy\\"}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSseResponse(sseChunks)));

    const deltas: string[] = [];
    const provider = new AnthropicProvider(config);
    const result = await provider.chatCompletionStream(
      { messages: [{ role: 'user', content: 'Tạo task Deploy' }] },
      (text) => deltas.push(text),
    );

    expect(deltas).toEqual(['Đang ', 'tạo task.']);
    expect(result).toEqual({
      content: 'Đang tạo task.',
      finishReason: 'tool_use',
      toolCalls: [
        {
          id: 'toolu_stream_1',
          name: 'create_task',
          rawArguments: '{"title":"Deploy"}',
          arguments: { title: 'Deploy' },
          parseError: undefined,
        },
      ],
    });
  });

  it('maps Anthropic HTTP errors without exposing apiKey or baseUrl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(`Auth failed for ${config.baseUrl} key=${config.apiKey}`, { status: 401 }),
      ),
    );

    const provider = new AnthropicProvider(config);
    let caught: unknown;
    try {
      await provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ServiceUnavailableException);
    expect((caught as Error).message).not.toContain(config.apiKey);
    expect((caught as Error).message).not.toContain(config.baseUrl);
  });
});

describe('GeminiProvider', () => {
  const config = loadAiConfig({
    LLM_PROVIDER: 'gemini',
    LLM_BASE_URL: 'https://gemini.proxy.internal/v1beta',
    LLM_API_KEY: 'AIza-super-secret-key',
    LLM_MODEL: 'gemini-2.5-flash',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('passes x-goog-api-key header (never in URL), converts schema types/nullable, and maps tool results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                role: 'model',
                parts: [
                  { text: 'Mình sẽ cập nhật task.' },
                  {
                    functionCall: {
                      name: 'update_task',
                      args: { taskId: 7, dueDate: null },
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

    const provider = new GeminiProvider(config);
    expect(provider.name).toBe('gemini');

    const result = await provider.chatCompletion({
      messages: [
        { role: 'system', content: 'Be helpful.' },
        { role: 'user', content: 'List then update' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'list_tasks', arguments: '{"limit":5}' },
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'list_teams', arguments: '{}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_1', content: '{"tasks":[{"id":7}]}' },
        { role: 'tool', tool_call_id: 'call_2', content: 'plain text output' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'update_task',
            description: 'Update task',
            parameters: {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              additionalProperties: false,
              properties: {
                taskId: { type: 'integer', minimum: 1 },
                dueDate: { type: ['string', 'null'], description: 'ISO date' },
                tags: {
                  type: 'array',
                  minItems: 0,
                  items: { type: 'string', minLength: 1 },
                },
              },
              required: ['taskId'],
            },
          },
        },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gemini.proxy.internal/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(url).not.toContain(config.apiKey);
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'AIza-super-secret-key',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be helpful.' }] });
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'update_task',
            description: 'Update task',
            parameters: {
              type: 'OBJECT',
              properties: {
                taskId: { type: 'INTEGER' },
                dueDate: { type: 'STRING', nullable: true, description: 'ISO date' },
                tags: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                },
              },
              required: ['taskId'],
            },
          },
        ],
      },
    ]);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'List then update' }] },
      {
        role: 'model',
        parts: [
          { functionCall: { name: 'list_tasks', args: { limit: 5 } } },
          { functionCall: { name: 'list_teams', args: {} } },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'list_tasks',
              response: { tasks: [{ id: 7 }] },
            },
          },
          {
            functionResponse: {
              name: 'list_teams',
              response: { result: 'plain text output' },
            },
          },
        ],
      },
    ]);

    expect(result).toEqual({
      content: 'Mình sẽ cập nhật task.',
      finishReason: 'STOP',
      toolCalls: [
        {
          id: 'gemini_call_1',
          name: 'update_task',
          rawArguments: '{"taskId":7,"dueDate":null}',
          arguments: { taskId: 7, dueDate: null },
        },
      ],
    });
  });

  it('omits parameters in functionDeclarations for zero-arg object tools like list_teams', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                role: 'model',
                parts: [{ text: 'Danh sách nhóm của bạn.' }],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new GeminiProvider(config);
    await provider.chatCompletion({
      messages: [{ role: 'user', content: 'Liệt kê nhóm' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_teams',
            description: 'Lấy danh sách các nhóm làm việc',
            parameters: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_team_detail',
            description: 'Xem chi tiết nhóm',
            parameters: {
              type: 'object',
              properties: {
                teamId: { type: 'integer', minimum: 1 },
              },
              required: ['teamId'],
              additionalProperties: false,
            },
          },
        },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    const declarations = body.tools[0].functionDeclarations as Array<Record<string, unknown>>;

    expect(declarations[0]).toEqual({
      name: 'list_teams',
      description: 'Lấy danh sách các nhóm làm việc',
    });
    expect('parameters' in declarations[0]).toBe(false);

    expect(declarations[1]).toEqual({
      name: 'get_team_detail',
      description: 'Xem chi tiết nhóm',
      parameters: {
        type: 'OBJECT',
        properties: {
          teamId: { type: 'INTEGER' },
        },
        required: ['teamId'],
      },
    });
  });

  it('streams Gemini SSE chunks from :streamGenerateContent?alt=sse with deterministic tool call IDs', async () => {
    const sseChunks = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Xin "}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"chào!"},{"functionCall":{"name":"list_tasks","args":{"status":"TODO"}}}]},"finishReason":"STOP"}]}\n\n',
    ];
    const fetchMock = vi.fn().mockResolvedValue(createSseResponse(sseChunks));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    const provider = new GeminiProvider(config);
    const result = await provider.chatCompletionStream(
      { messages: [{ role: 'user', content: 'Hi' }] },
      (text) => deltas.push(text),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gemini.proxy.internal/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
    );
    expect(url).not.toContain(config.apiKey);
    expect(init.headers).toMatchObject({
      'x-goog-api-key': 'AIza-super-secret-key',
    });

    expect(deltas).toEqual(['Xin ', 'chào!']);
    expect(result).toEqual({
      content: 'Xin chào!',
      finishReason: 'STOP',
      toolCalls: [
        {
          id: 'gemini_call_1',
          name: 'list_tasks',
          rawArguments: '{"status":"TODO"}',
          arguments: { status: 'TODO' },
        },
      ],
    });
  });

  it('maps Gemini 500 error to BadGatewayException without exposing apiKey or baseUrl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(`Upstream error ${config.baseUrl} ${config.apiKey}`, { status: 500 }),
      ),
    );

    const provider = new GeminiProvider(config);
    let caught: unknown;
    try {
      await provider.chatCompletion({ messages: [{ role: 'user', content: 'Hi' }] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BadGatewayException);
    expect((caught as Error).message).not.toContain(config.apiKey);
    expect((caught as Error).message).not.toContain(config.baseUrl);
  });
});

describe('AiProviderRegistry multi-provider registration', () => {
  it('registers and returns AnthropicProvider and GeminiProvider with default baseUrls', () => {
    const anthropicRegistry = new AiProviderRegistry({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'sk-ant-test',
      LLM_MODEL: 'claude-3-5-sonnet-latest',
    });

    expect(anthropicRegistry.isConfigured()).toBe(true);
    expect(anthropicRegistry.getStatus()).toEqual({
      configured: true,
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
    });
    expect(anthropicRegistry.getProvider()).toBeInstanceOf(AnthropicProvider);

    const geminiRegistry = new AiProviderRegistry({
      LLM_PROVIDER: 'gemini',
      LLM_API_KEY: 'AIza-test',
      LLM_MODEL: 'gemini-2.5-flash',
    });

    expect(geminiRegistry.isConfigured()).toBe(true);
    expect(geminiRegistry.getStatus()).toEqual({
      configured: true,
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(geminiRegistry.getProvider()).toBeInstanceOf(GeminiProvider);
  });

  it('rejects unknown provider cleanly', () => {
    const unknownRegistry = new AiProviderRegistry({
      LLM_PROVIDER: 'unknown-llm',
      LLM_BASE_URL: 'https://api.example.com/v1',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'model-1',
    });

    expect(unknownRegistry.isConfigured()).toBe(false);
    expect(unknownRegistry.getStatus()).toEqual({
      configured: false,
      provider: 'unknown-llm',
      model: null,
    });
    expect(() => unknownRegistry.getProvider()).toThrow(ServiceUnavailableException);
  });
});
