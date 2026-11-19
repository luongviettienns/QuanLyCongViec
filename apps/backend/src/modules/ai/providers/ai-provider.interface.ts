export type AiMessageRoleType = 'system' | 'user' | 'assistant' | 'tool';

export interface AiAssistantToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiChatMessage {
  role: AiMessageRoleType;
  content: string | null;
  tool_calls?: AiAssistantToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AiToolCall {
  id: string;
  name: string;
  rawArguments: string;
  arguments: Record<string, unknown>;
  parseError?: string;
}

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AiCompletionInput {
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface AiCompletionResult {
  content: string | null;
  toolCalls: AiToolCall[];
  finishReason?: string | null;
}

export interface AiProviderStatus {
  configured: boolean;
  provider: string;
  model: string | null;
}

export interface AiProvider {
  readonly name: string;
  chatCompletion(input: AiCompletionInput): Promise<AiCompletionResult>;
  chatCompletionStream(
    input: AiCompletionInput,
    onDelta: (text: string) => void,
  ): Promise<AiCompletionResult>;
}
