import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AiConfig } from './ai-config.utils.js';
import {
  executeProviderFetch,
  isPlainObject,
  parseJsonResponse,
  parseToolArguments,
  readSseEvents,
} from './ai-provider-http.utils.js';
import type {
  AiChatMessage,
  AiCompletionInput,
  AiCompletionResult,
  AiProvider,
  AiToolCall,
} from './ai-provider.interface.js';

const ANTHROPIC_API_VERSION = '2023-06-01';

interface AnthropicContentBlock {
  type?: unknown;
  text?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<Record<string, unknown>>;
}

interface AnthropicMessagesResponse {
  stop_reason?: unknown;
  content?: AnthropicContentBlock[];
}

interface AnthropicSsePayload {
  type?: unknown;
  index?: unknown;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: unknown;
    text?: unknown;
    partial_json?: unknown;
    stop_reason?: unknown;
  };
}

function mapMessagesToAnthropic(messages: AiChatMessage[]): {
  system?: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const mapped: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
        systemParts.push(msg.content);
      }
      continue;
    }

    if (msg.role === 'user') {
      mapped.push({
        role: 'user',
        content: [{ type: 'text', text: msg.content ?? '' }],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const blocks: Array<Record<string, unknown>> = [];
      if (typeof msg.content === 'string' && msg.content.length > 0) {
        blocks.push({ type: 'text', text: msg.content });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          const parsed = parseToolArguments(call.function.arguments);
          blocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.function.name,
            input: parsed.arguments,
          });
        }
      }
      if (blocks.length > 0) {
        mapped.push({ role: 'assistant', content: blocks });
      }
      continue;
    }

    if (msg.role === 'tool') {
      const toolResultBlock: Record<string, unknown> = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id ?? '',
        content: msg.content ?? '',
      };

      const prev = mapped[mapped.length - 1];
      if (
        prev &&
        prev.role === 'user' &&
        prev.content[0]?.type === 'tool_result'
      ) {
        prev.content.push(toolResultBlock);
      } else {
        mapped.push({
          role: 'user',
          content: [toolResultBlock],
        });
      }
    }
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
    messages: mapped,
  };
}

/**
 * Anthropic Messages API provider using native fetch.
 */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private readonly config: AiConfig) {}

  private buildHeaders(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
  }

  private buildRequestBody(
    input: AiCompletionInput,
    stream: boolean,
  ): Record<string, unknown> {
    const { system, messages } = mapMessagesToAnthropic(input.messages);
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      max_tokens: input.maxTokens ?? this.config.maxTokens,
      temperature: input.temperature ?? 0.2,
    };

    if (system) {
      body.system = system;
    }

    if (stream) {
      body.stream = true;
    }

    if (input.tools && input.tools.length > 0) {
      body.tools = input.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    return body;
  }

  async chatCompletion(input: AiCompletionInput): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const { response, cleanup } = await executeProviderFetch(
      `${this.config.baseUrl}/messages`,
      this.buildHeaders(),
      this.buildRequestBody(input, false),
      this.config.timeoutMs,
      this.logger,
      input.signal,
    );

    let data: AnthropicMessagesResponse | null;
    try {
      data = await parseJsonResponse<AnthropicMessagesResponse | null>(response);
    } finally {
      cleanup();
    }

    if (!data || !Array.isArray(data.content)) {
      throw new BadGatewayException('Invalid response shape from AI provider');
    }

    const textParts: string[] = [];
    const toolCalls: AiToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        const inputObj = isPlainObject(block.input) ? block.input : {};
        toolCalls.push({
          id: typeof block.id === 'string' ? block.id : '',
          name: typeof block.name === 'string' ? block.name : '',
          rawArguments: JSON.stringify(inputObj),
          arguments: inputObj,
        });
      }
    }

    return {
      content: textParts.length > 0 ? textParts.join('') : null,
      toolCalls,
      finishReason:
        typeof data.stop_reason === 'string' ? data.stop_reason : null,
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
        `${this.config.baseUrl}/messages`,
        this.buildHeaders(),
        this.buildRequestBody(input, true),
        this.config.timeoutMs,
        this.logger,
        input.signal,
      );

    const textParts: string[] = [];
    const toolBlocks = new Map<
      number,
      {
        id: string;
        name: string;
        jsonParts: string[];
        initialInput?: Record<string, unknown>;
      }
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

          let payload: AnthropicSsePayload;
          try {
            payload = JSON.parse(rawData) as AnthropicSsePayload;
          } catch {
            throw new BadGatewayException(
              'Invalid JSON stream chunk from AI provider',
            );
          }

          const eventType =
            typeof payload.type === 'string' ? payload.type : event.event;

          if (eventType === 'error') {
            throw new BadGatewayException('AI provider stream error');
          }

          if (eventType === 'message_stop') {
            streamDone = true;
            return;
          }

          if (eventType === 'content_block_start') {
            const index = typeof payload.index === 'number' ? payload.index : 0;
            const block = payload.content_block;
            if (
              block?.type === 'text' &&
              typeof block.text === 'string' &&
              block.text.length > 0
            ) {
              textParts.push(block.text);
              onDelta(block.text);
            } else if (block?.type === 'tool_use') {
              toolBlocks.set(index, {
                id: typeof block.id === 'string' ? block.id : '',
                name: typeof block.name === 'string' ? block.name : '',
                jsonParts: [],
                initialInput: isPlainObject(block.input)
                  ? block.input
                  : undefined,
              });
            }
            return;
          }

          if (eventType === 'content_block_delta') {
            const index = typeof payload.index === 'number' ? payload.index : 0;
            const delta = payload.delta;
            if (
              delta?.type === 'text_delta' &&
              typeof delta.text === 'string' &&
              delta.text.length > 0
            ) {
              textParts.push(delta.text);
              onDelta(delta.text);
            } else if (
              delta?.type === 'input_json_delta' &&
              typeof delta.partial_json === 'string'
            ) {
              const entry = toolBlocks.get(index);
              if (entry) {
                entry.jsonParts.push(delta.partial_json);
              }
            }
            return;
          }

          if (eventType === 'message_delta') {
            if (typeof payload.delta?.stop_reason === 'string') {
              finishReason = payload.delta.stop_reason;
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

    const toolCalls: AiToolCall[] = Array.from(toolBlocks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, entry]) => {
        const rawDelta = entry.jsonParts.join('');
        if (!rawDelta.trim() && entry.initialInput) {
          return {
            id: entry.id,
            name: entry.name,
            rawArguments: JSON.stringify(entry.initialInput),
            arguments: entry.initialInput,
          };
        }

        const parsed = parseToolArguments(rawDelta);
        return {
          id: entry.id,
          name: entry.name,
          rawArguments: rawDelta,
          arguments: parsed.arguments,
          parseError: parsed.parseError,
        };
      });

    return {
      content: textParts.length > 0 ? textParts.join('') : null,
      toolCalls,
      finishReason,
    };
  }
}
