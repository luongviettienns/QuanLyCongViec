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

interface GeminiPart {
  text?: unknown;
  functionCall?: {
    name?: unknown;
    args?: unknown;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<Record<string, unknown>>;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    finishReason?: unknown;
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

const GEMINI_SCHEMA_TYPES = new Set([
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
]);

function normalizeGeminiScalarType(rawType: string): string {
  const upper = rawType.trim().toUpperCase();
  return GEMINI_SCHEMA_TYPES.has(upper) ? upper : 'STRING';
}

/**
 * Recursively converts JSON Schema definitions into Gemini OpenAPI Schema subset.
 */
export function convertToGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!isPlainObject(schema)) {
    return { type: 'OBJECT' };
  }

  const result: Record<string, unknown> = {};

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter(
      (item): item is string => typeof item === 'string',
    );
    const hasNull = types.some((item) => item.toLowerCase() === 'null');
    const primaryType = types.find((item) => item.toLowerCase() !== 'null');
    if (primaryType) {
      result.type = normalizeGeminiScalarType(primaryType);
    }
    if (hasNull) {
      result.nullable = true;
    }
  } else if (typeof schema.type === 'string') {
    result.type = normalizeGeminiScalarType(schema.type);
  }

  if (schema.nullable === true) {
    result.nullable = true;
  }

  if (typeof schema.description === 'string') {
    result.description = schema.description;
  }

  if (typeof schema.format === 'string') {
    result.format = schema.format;
  }

  if (Array.isArray(schema.enum)) {
    result.enum = schema.enum;
  }

  if (isPlainObject(schema.properties)) {
    const convertedProperties: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      convertedProperties[key] = convertToGeminiSchema(propSchema);
    }
    if (Object.keys(convertedProperties).length > 0) {
      result.properties = convertedProperties;
    }
  }

  if (Array.isArray(schema.required)) {
    result.required = schema.required.filter(
      (item): item is string => typeof item === 'string',
    );
  }

  if (schema.items !== undefined) {
    result.items = convertToGeminiSchema(schema.items);
  }

  return result;
}

function parseToolResponseObject(rawContent: string | null): Record<string, unknown> {
  if (!rawContent || !rawContent.trim()) {
    return { result: null };
  }

  try {
    const parsed: unknown = JSON.parse(rawContent);
    if (isPlainObject(parsed)) {
      return parsed;
    }
    return { result: parsed };
  } catch {
    return { result: rawContent };
  }
}

function mapMessagesToGemini(messages: AiChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
} {
  const systemParts: string[] = [];
  const contents: GeminiContent[] = [];
  const toolCallIdToName = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
        systemParts.push(msg.content);
      }
      continue;
    }

    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content ?? '' }],
      });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = [];
      if (typeof msg.content === 'string' && msg.content.length > 0) {
        parts.push({ text: msg.content });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (call.id && call.function.name) {
            toolCallIdToName.set(call.id, call.function.name);
          }
          const parsedArgs = parseToolArguments(call.function.arguments);
          parts.push({
            functionCall: {
              name: call.function.name,
              args: parsedArgs.arguments,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    if (msg.role === 'tool') {
      const toolName =
        (msg.tool_call_id ? toolCallIdToName.get(msg.tool_call_id) : undefined) ??
        msg.name ??
        'unknown_tool';
      const functionResponsePart: Record<string, unknown> = {
        functionResponse: {
          name: toolName,
          response: parseToolResponseObject(msg.content),
        },
      };

      const prev = contents[contents.length - 1];
      if (
        prev &&
        prev.role === 'user' &&
        prev.parts[0]?.functionResponse !== undefined
      ) {
        prev.parts.push(functionResponsePart);
      } else {
        contents.push({
          role: 'user',
          parts: [functionResponsePart],
        });
      }
    }
  }

  return {
    ...(systemParts.length > 0
      ? { systemInstruction: { parts: [{ text: systemParts.join('\n\n') }] } }
      : {}),
    contents,
  };
}

/**
 * Google Gemini generateContent HTTP provider using native fetch and x-goog-api-key header.
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly config: AiConfig) {}

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.config.apiKey,
    };
  }

  private buildRequestBody(input: AiCompletionInput): Record<string, unknown> {
    const { systemInstruction, contents } = mapMessagesToGemini(input.messages);
    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? this.config.maxTokens,
        temperature: input.temperature ?? 0.2,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (input.tools && input.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: input.tools.map((tool) => {
            const parameters = convertToGeminiSchema(tool.function.parameters);
            const hasProperties =
              isPlainObject(parameters.properties) &&
              Object.keys(parameters.properties).length > 0;
            const omitParameters = parameters.type === 'OBJECT' && !hasProperties;

            return {
              name: tool.function.name,
              description: tool.function.description,
              ...(omitParameters ? {} : { parameters }),
            };
          }),
        },
      ];
    }

    return body;
  }

  private extractParts(
    parts: GeminiPart[] | undefined,
    textAccumulator: string[],
    toolCalls: AiToolCall[],
    nextToolCounter: () => number,
    onDelta?: (text: string) => void,
  ): void {
    if (!Array.isArray(parts)) {
      return;
    }

    for (const part of parts) {
      if (typeof part.text === 'string' && part.text.length > 0) {
        textAccumulator.push(part.text);
        onDelta?.(part.text);
      }

      if (part.functionCall && typeof part.functionCall.name === 'string') {
        const args = isPlainObject(part.functionCall.args)
          ? part.functionCall.args
          : {};
        toolCalls.push({
          id: `gemini_call_${nextToolCounter()}`,
          name: part.functionCall.name,
          rawArguments: JSON.stringify(args),
          arguments: args,
        });
      }
    }
  }

  async chatCompletion(input: AiCompletionInput): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const endpoint = `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent`;
    const { response, cleanup } = await executeProviderFetch(
      endpoint,
      this.buildHeaders(),
      this.buildRequestBody(input),
      this.config.timeoutMs,
      this.logger,
      input.signal,
    );

    let data: GeminiGenerateContentResponse | null;
    try {
      data = await parseJsonResponse<GeminiGenerateContentResponse | null>(
        response,
      );
    } finally {
      cleanup();
    }

    const candidate = data?.candidates?.[0];
    if (!data || !candidate || !candidate.content) {
      throw new BadGatewayException('Invalid response shape from AI provider');
    }

    const textParts: string[] = [];
    const toolCalls: AiToolCall[] = [];
    let counter = 0;

    this.extractParts(
      candidate.content.parts,
      textParts,
      toolCalls,
      () => ++counter,
    );

    return {
      content: textParts.length > 0 ? textParts.join('') : null,
      toolCalls,
      finishReason:
        typeof candidate.finishReason === 'string'
          ? candidate.finishReason
          : null,
    };
  }

  async chatCompletionStream(
    input: AiCompletionInput,
    onDelta: (text: string) => void,
  ): Promise<AiCompletionResult> {
    if (!this.config.configured) {
      throw new ServiceUnavailableException('AI assistant is not configured');
    }

    const endpoint = `${this.config.baseUrl}/models/${encodeURIComponent(this.config.model)}:streamGenerateContent?alt=sse`;
    const { response, signal, cleanup, getAbortSource } =
      await executeProviderFetch(
        endpoint,
        this.buildHeaders(),
        this.buildRequestBody(input),
        this.config.timeoutMs,
        this.logger,
        input.signal,
      );

    const textParts: string[] = [];
    const toolCalls: AiToolCall[] = [];
    let counter = 0;
    let finishReason: string | null = null;

    try {
      await readSseEvents(
        response,
        (event) => {
          const rawData = event.data.trim();
          if (!rawData || rawData === '[DONE]') {
            return;
          }

          let chunk: GeminiGenerateContentResponse;
          try {
            chunk = JSON.parse(rawData) as GeminiGenerateContentResponse;
          } catch {
            throw new BadGatewayException(
              'Invalid JSON stream chunk from AI provider',
            );
          }

          const candidate = chunk.candidates?.[0];
          if (!candidate) {
            return;
          }

          if (typeof candidate.finishReason === 'string') {
            finishReason = candidate.finishReason;
          }

          this.extractParts(
            candidate.content?.parts,
            textParts,
            toolCalls,
            () => ++counter,
            onDelta,
          );
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

    return {
      content: textParts.length > 0 ? textParts.join('') : null,
      toolCalls,
      finishReason,
    };
  }
}
