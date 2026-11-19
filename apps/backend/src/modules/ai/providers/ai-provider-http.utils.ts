import {
  BadGatewayException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface ParsedToolArguments {
  arguments: Record<string, unknown>;
  parseError?: string;
}

export interface SseEvent {
  event?: string;
  data: string;
}

export type AbortSource = 'timeout' | 'caller' | null;

export interface ProviderFetchResult {
  response: Response;
  signal: AbortSignal;
  cleanup: () => void;
  getAbortSource: () => AbortSource;
}

export interface ReadSseOptions {
  callerSignal?: AbortSignal;
  logger?: Logger;
  getAbortSource?: () => AbortSource;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely parses JSON tool-call arguments into an object without throwing.
 */
export function parseToolArguments(rawArguments: string): ParsedToolArguments {
  if (!rawArguments.trim()) {
    return { arguments: {} };
  }

  try {
    const parsed: unknown = JSON.parse(rawArguments);
    if (!isPlainObject(parsed)) {
      return {
        arguments: {},
        parseError: 'Tool arguments must be a JSON object',
      };
    }

    return { arguments: parsed };
  } catch (error) {
    return {
      arguments: {},
      parseError:
        error instanceof Error ? error.message : 'Malformed JSON tool arguments',
    };
  }
}

/**
 * Maps upstream HTTP error status codes without exposing provider secrets or URLs.
 */
export function mapHttpStatusError(status: number): Error {
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

function isCallerAbortTriggered(
  abortSource: AbortSource,
  callerSignal?: AbortSignal,
): boolean {
  return (
    abortSource === 'caller' ||
    (Boolean(callerSignal?.aborted) && abortSource !== 'timeout')
  );
}

function throwCallerAbort(logger?: Logger): never {
  logger?.debug('AI provider request aborted by caller');
  throw new DOMException('AI provider request aborted', 'AbortError');
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    Boolean(signal?.aborted) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

/**
 * Combines a timeout timer with an optional caller AbortSignal.
 */
export function createCombinedAbortSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void; getAbortSource: () => AbortSource } {
  const controller = new AbortController();
  let abortSource: AbortSource = null;

  const timer = setTimeout(() => {
    if (!abortSource) {
      abortSource = 'timeout';
    }
    controller.abort();
  }, timeoutMs);

  let onCallerAbort: (() => void) | undefined;
  if (callerSignal) {
    if (callerSignal.aborted) {
      abortSource = 'caller';
      controller.abort(callerSignal.reason);
    } else {
      onCallerAbort = () => {
        if (!abortSource) {
          abortSource = 'caller';
        }
        controller.abort(callerSignal.reason);
      };
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (callerSignal && onCallerAbort) {
        callerSignal.removeEventListener('abort', onCallerAbort);
      }
    },
    getAbortSource: () => abortSource,
  };
}

/**
 * Executes a JSON POST request against an AI provider with secret-safe error mapping.
 * The caller must invoke `cleanup()` in a `finally` block after consuming the response body.
 */
export async function executeProviderFetch(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  logger: Logger,
  callerSignal?: AbortSignal,
): Promise<ProviderFetchResult> {
  if (callerSignal?.aborted) {
    throwCallerAbort(logger);
  }

  const { signal, cleanup, getAbortSource } = createCombinedAbortSignal(
    timeoutMs,
    callerSignal,
  );

  let response: Response;
  try {
    response = await globalThis.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    cleanup();
    if (isCallerAbortTriggered(getAbortSource(), callerSignal)) {
      throwCallerAbort(logger);
    }
    if (isAbortError(error, signal)) {
      logger.warn('AI provider request timed out');
      throw new ServiceUnavailableException('AI provider request timed out');
    }

    logger.warn('AI provider request failed due to network error');
    throw new ServiceUnavailableException('AI provider is unavailable');
  }

  if (!response.ok) {
    cleanup();
    logger.warn(`AI provider returned HTTP status ${response.status}`);
    await response.body?.cancel().catch(() => undefined);
    throw mapHttpStatusError(response.status);
  }

  return { response, signal, cleanup, getAbortSource };
}

/**
 * Parses a JSON response body from an AI provider, translating parse errors to BadGatewayException.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new BadGatewayException('Invalid JSON response from AI provider');
  }
}

/**
 * Streams and parses Server-Sent Events (SSE) frames from a Fetch Response body.
 */
export async function readSseEvents(
  response: Response,
  onEvent: (event: SseEvent) => void | Promise<void>,
  signal?: AbortSignal,
  options?: ReadSseOptions,
): Promise<void> {
  if (!response.body) {
    throw new BadGatewayException('Empty response stream from AI provider');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;
  let dataLines: string[] = [];

  const onSignalAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  if (signal) {
    signal.addEventListener('abort', onSignalAbort, { once: true });
  }

  const flushEvent = async () => {
    if (dataLines.length === 0 && currentEvent === undefined) {
      return;
    }

    const event: SseEvent = {
      event: currentEvent,
      data: dataLines.join('\n'),
    };
    currentEvent = undefined;
    dataLines = [];

    await onEvent(event);
  };

  const processLine = async (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      await flushEvent();
      return;
    }

    if (line.startsWith(':')) {
      return;
    }

    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
      return;
    }

    if (line.startsWith('data:')) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
  };

  try {
    while (true) {
      if (signal?.aborted || options?.callerSignal?.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }

      const { value, done } = await reader.read();
      if (signal?.aborted || options?.callerSignal?.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIdx = buffer.indexOf('\n');
      while (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        await processLine(line);
        newlineIdx = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.length > 0) {
      await processLine(buffer);
    }
    await flushEvent();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    const abortSource = options?.getAbortSource?.() ?? null;
    if (isCallerAbortTriggered(abortSource, options?.callerSignal)) {
      throwCallerAbort(options?.logger);
    }
    if (isAbortError(error, signal) || options?.callerSignal?.aborted) {
      options?.logger?.warn('AI provider request timed out');
      throw new ServiceUnavailableException('AI provider request timed out');
    }
    throw error;
  } finally {
    if (signal) {
      signal.removeEventListener('abort', onSignalAbort);
    }
    reader.releaseLock();
  }
}
