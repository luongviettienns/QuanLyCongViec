import { getAuthHeaders, notifyUnauthorized } from './auth-session.ts';
import {
  isAbortError,
  NetworkError,
  parseApiError,
  UnauthorizedError,
} from './api-error.ts';

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  defaultErrorMessage?: string;
}

export async function safeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (isAbortError(error) || init?.signal?.aborted) {
      throw error;
    }
    throw new NetworkError(undefined, { cause: error });
  }
}

export async function handleApiResponse<T>(
  response: Response,
  defaultMessage = 'Yêu cầu thất bại',
): Promise<T> {
  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseApiError(response, defaultMessage);
  }

  return response.json() as Promise<T>;
}

export async function handleVoidApiResponse(
  response: Response,
  defaultMessage = 'Yêu cầu thất bại',
): Promise<void> {
  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseApiError(response, defaultMessage);
  }
}

export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL as string | undefined) || '/api';

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/api/') || cleanPath === '/api') {
    return cleanPath;
  }
  return `${API_BASE_URL}${cleanPath}`;
}

function buildRequestConfig(url: string, options: HttpRequestOptions = {}): {
  resolvedUrl: string;
  defaultErrorMessage: string;
  init: RequestInit;
} {
  const {
    body,
    defaultErrorMessage = 'Yêu cầu thất bại',
    headers: customHeaders,
    ...rest
  } = options;

  const authHeaders = getAuthHeaders();
  const headers: Record<string, string> = {
    ...authHeaders,
    ...(customHeaders as Record<string, string>),
  };

  let serializedBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
      serializedBody = body as BodyInit;
    } else {
      headers['Content-Type'] = 'application/json';
      serializedBody = JSON.stringify(body);
    }
  }

  return {
    resolvedUrl: apiUrl(url),
    defaultErrorMessage,
    init: {
      ...rest,
      headers,
      body: serializedBody,
    },
  };
}

async function executeRequest<T>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const { resolvedUrl, defaultErrorMessage, init } = buildRequestConfig(url, options);
  const response = await safeFetch(resolvedUrl, init);
  return handleApiResponse<T>(response, defaultErrorMessage);
}

export const httpClient = {
  get<T>(url: string, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> {
    return executeRequest<T>(url, { ...options, method: 'GET' });
  },

  post<T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> {
    return executeRequest<T>(url, { ...options, method: 'POST', body });
  },

  put<T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> {
    return executeRequest<T>(url, { ...options, method: 'PUT', body });
  },

  patch<T>(url: string, body?: unknown, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> {
    return executeRequest<T>(url, { ...options, method: 'PATCH', body });
  },

  delete<T>(url: string, options?: Omit<HttpRequestOptions, 'method' | 'body'>): Promise<T> {
    return executeRequest<T>(url, { ...options, method: 'DELETE' });
  },

  async void(url: string, options?: HttpRequestOptions): Promise<void> {
    const { resolvedUrl, defaultErrorMessage, init } = buildRequestConfig(url, options);
    const response = await safeFetch(resolvedUrl, init);
    return handleVoidApiResponse(response, defaultErrorMessage);
  },
};
