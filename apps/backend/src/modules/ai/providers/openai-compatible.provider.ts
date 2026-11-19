import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AiConfig } from './ai-config.utils.js';
import {
  executeProviderFetch,
  parseJsonResponse,
  parseToolArguments,
  readSseEvents,
} from './ai-provider-http.utils.js';
import type {
  AiCompletionInput,
  AiCompletionResult,
  AiProvider,
  AiToolCall,
} from './ai-provider.interface.js';

interface OpenAiRawToolCall {
  id?: unknown;
  type?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

interface OpenAiStreamToolCallDelta {
  index?: unknown;
  id?: unknown;
  type?: unknown;
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      tool_calls?: OpenAiRawToolCall[];
    };
  }>;
}

interface OpenAiChatStreamChunk {
  choices?: Array<{
    finish_reason?: unknown;
    delta?: {
      content?: unknown;
      tool_calls?: OpenAiStreamToolCallDelta[];
    };
  }>;
}

function normalizeToolCalls(rawToolCalls: unknown): AiToolCall[] {
  if (!Array.isArray(rawToolCalls)) {
    return [];
  }

  return rawToolCalls.map((rawCall) => {
    const call = (rawCall ?? {}) as OpenAiRawToolCall;
    const rawArguments =
      typeof call.function?.arguments === 'string' ? call.function.arguments : '';
    const parsed = parseToolArguments(rawArguments);

    return {
      id: typeof call.id === 'string' ? call.id : '',
      name: typeof call.function?.name === 'string' ? call.function.name : '',
      rawArguments,
      arguments: parsed.arguments,
      parseError: parsed.parseError,
    };
  });
}

/**
 * OpenAI-compatible HTTP chat completion provider using native fetch.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(private readonly config: AiConfig) {}

  private buildRequestBody(
    input: AiCompletionInput,
    stream: boolean,
  ): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages: input.messages,
      max_tokens: input.maxTokens ?? this.config.maxTokens,
      temperature: input.temperature ?? 0.2,
    };

    if (stream) {
      requestBody.stream = true;
    }

    if (input.tools && input.tools.length > 0) {
      requestBody.tools = input.tools;
      requestBody.tool_choice = 'auto';
    }

    return requestBody;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  async chatCompletion(input: AiCompletionInput): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const { response, cleanup } = await executeProviderFetch(
      `${this.config.baseUrl}/chat/completions`,
      this.buildHeaders(),
      this.buildRequestBody(input, false),
      this.config.timeoutMs,
      this.logger,
      input.signal,
    );

    let data: OpenAiChatCompletionResponse | null;
    try {
      data = await parseJsonResponse<OpenAiChatCompletionResponse | null>(response);
    } finally {
      cleanup();
    }

    const choice = data?.choices?.[0];
    if (!data || !choice) {
      throw new BadGatewayException('Phản hồi từ nhà cung cấp AI không hợp lệ');
    }

    const message = choice.message;
    if (!message) {
      throw new BadGatewayException('Invalid response shape from AI provider');
    }

    return {
      content: typeof message.content === 'string' ? message.content : null,
      toolCalls: normalizeToolCalls(message.tool_calls),
      finishReason:
        typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    };
  }

  async chatCompletionStream(
    input: AiCompletionInput,
    onDelta: (text: string) => void,
  ): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const { response, signal, cleanup, getAbortSource } =
      await executeProviderFetch(
        `${this.config.baseUrl}/chat/completions`,
        this.buildHeaders(),
        this.buildRequestBody(input, true),
        this.config.timeoutMs,
        this.logger,
        input.signal,
      );

    const contentParts: string[] = [];
    const toolCallMap = new Map<
      number,
      { id: string; name: string; argumentsParts: string[] }
    >();
    let finishReason: string | null = null;
    let streamDone = false;

    try {
      await readSseEvents(
        response,
        (event) => {
          if (streamDone) {
            return;
          }

          const rawData = event.data.trim();
          if (!rawData) {
            return;
          }
          if (rawData === '[DONE]') {
            streamDone = true;
            return;
          }

          let chunk: OpenAiChatStreamChunk;
          try {
            chunk = JSON.parse(rawData) as OpenAiChatStreamChunk;
          } catch {
            throw new BadGatewayException('Invalid JSON stream chunk from AI provider');
          }

          const choice = chunk.choices?.[0];
          if (!choice) {
            return;
          }

          if (typeof choice.finish_reason === 'string') {
            finishReason = choice.finish_reason;
          }

          const delta = choice.delta;
          if (!delta) {
            return;
          }

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            contentParts.push(delta.content);
            onDelta(delta.content);
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const deltaCall of delta.tool_calls) {
              const index =
                typeof deltaCall.index === 'number' ? deltaCall.index : 0;
              let entry = toolCallMap.get(index);
              if (!entry) {
                entry = { id: '', name: '', argumentsParts: [] };
                toolCallMap.set(index, entry);
              }

              if (typeof deltaCall.id === 'string' && deltaCall.id) {
                entry.id = deltaCall.id;
              }
              if (
                typeof deltaCall.function?.name === 'string' &&
                deltaCall.function.name
              ) {
                entry.name = deltaCall.function.name;
              }
              if (typeof deltaCall.function?.arguments === 'string') {
                entry.argumentsParts.push(deltaCall.function.arguments);
              }
            }
          }
        },
        signal,
        {
          callerSignal: input.signal,
          logger: this.logger,
          getAbortSource,
        },
      );
    } finally {
      cleanup();
    }

    const toolCalls: AiToolCall[] = Array.from(toolCallMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, entry]) => {
        const rawArguments = entry.argumentsParts.join('');
        const parsed = parseToolArguments(rawArguments);
        return {
          id: entry.id,
          name: entry.name,
          rawArguments,
          arguments: parsed.arguments,
          parseError: parsed.parseError,
        };
      });

    return {
      content: contentParts.length > 0 ? contentParts.join('') : null,
      toolCalls,
      finishReason,
    };
  }
}
