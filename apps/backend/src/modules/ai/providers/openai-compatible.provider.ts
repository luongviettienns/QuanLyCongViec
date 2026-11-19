import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AiConfig } from './ai-config.utils.js';
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

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      tool_calls?: OpenAiRawToolCall[];
    };
  }>;
}

function parseToolArguments(rawArguments: string): {
  arguments: Record<string, unknown>;
  parseError?: string;
} {
  if (!rawArguments.trim()) {
    return { arguments: {} };
  }

  try {
    const parsed: unknown = JSON.parse(rawArguments);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        arguments: {},
        parseError: 'Tool arguments must be a JSON object',
      };
    }

    return { arguments: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      arguments: {},
      parseError:
        error instanceof Error ? error.message : 'Malformed JSON tool arguments',
    };
  }
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

function mapHttpStatusError(status: number): Error {
  if (status === 401 || status === 403) {
    return new ServiceUnavailableException('AI provider authentication failed');
  }
  if (status === 429) {
    return new ServiceUnavailableException('AI provider rate limit exceeded');
  }
  if (status >= 500) {
    return new BadGatewayException('AI provider upstream error');
  }
  return new BadGatewayException('AI provider rejected the request');
}

/**
 * OpenAI-compatible HTTP chat completion provider using native fetch.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  constructor(private readonly config: AiConfig) {}

  async chatCompletion(input: AiCompletionInput): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages: input.messages,
      max_tokens: input.maxTokens ?? this.config.maxTokens,
      temperature: input.temperature ?? 0.2,
    };

    if (input.tools && input.tools.length > 0) {
      requestBody.tools = input.tools;
      requestBody.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await globalThis.fetch(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.warn('AI provider request timed out');
        throw new ServiceUnavailableException('AI provider request timed out');
      }

      this.logger.warn('AI provider request failed due to network error');
      throw new ServiceUnavailableException('AI provider is unavailable');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.warn(`AI provider returned HTTP status ${response.status}`);
      await response.body?.cancel().catch(() => undefined);
      throw mapHttpStatusError(response.status);
    }

    let data: OpenAiChatCompletionResponse | null;
    try {
      data = (await response.json()) as OpenAiChatCompletionResponse | null;
    } catch {
      throw new BadGatewayException('Invalid JSON response from AI provider');
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
}
