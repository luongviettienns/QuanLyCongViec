import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../types/auth.types';

const TOKEN_KEY = 'taskflow_auth_token';

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function notifyUnauthorized(): void {
  removeAuthToken();
  for (const listener of unauthorizedListeners) {
    listener();
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}

async function parseError(response: Response, defaultMessage: string): Promise<Error> {
  try {
    const errorData = await response.json();
    const errorMsg =
      errorData && typeof errorData.message === 'string'
        ? errorData.message
        : Array.isArray(errorData?.message)
          ? errorData.message.join(', ')
          : defaultMessage;
    return new Error(errorMsg);
  } catch {
    return new Error(defaultMessage);
  }
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await fetch('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Đăng nhập thất bại');
  }

  const data: AuthResponse = await response.json();
  setAuthToken(data.accessToken);
  return data;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await fetch('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseError(response, 'Đăng ký thất bại');
  }

  const data: AuthResponse = await response.json();
  setAuthToken(data.accessToken);
  return data;
}

export async function getProfile(signal?: AbortSignal): Promise<User> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Chưa đăng nhập');
  }

  const response = await fetch('/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  });

  if (response.status === 401) {
    notifyUnauthorized();
    throw new Error('Phiên đăng nhập đã hết hạn');
  }

  if (!response.ok) {
    throw await parseError(response, 'Phiên đăng nhập đã hết hạn');
  }

  return response.json();
}
