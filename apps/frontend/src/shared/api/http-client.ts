import { getAuthHeaders, notifyUnauthorized } from './auth-session';
import { parseApiError, UnauthorizedError } from './api-error';

export interface HttpRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  defaultErrorMessage?: string;
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

async function executeRequest<T>(
  url: string,
  options: HttpRequestOptions = {},
): Promise<T> {
  const { body, defaultErrorMessage = 'Yêu cầu thất bại', headers: customHeaders, ...rest } = options;

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

  const response = await fetch(url, {
    ...rest,
    headers,
    body: serializedBody,
  });

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

  void(url: string, options?: HttpRequestOptions): Promise<void> {
    const { body, defaultErrorMessage = 'Yêu cầu thất bại', headers: customHeaders, ...rest } = options ?? {};
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

    return fetch(url, {
      ...rest,
      headers,
      body: serializedBody,
    }).then((res) => handleVoidApiResponse(res, defaultErrorMessage));
  },
};
