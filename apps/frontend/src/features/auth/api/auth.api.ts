import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../types/auth.types';
import { parseApiError } from '../../../shared/utils/http.utils';

export class UnauthorizedError extends Error {
  constructor(message = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

const TOKEN_KEY = 'taskflow_auth_token';

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

let isNotifyingUnauthorized = false;
let isManualLogout = false;

export function markManualLogout(): void {
  isManualLogout = true;
}

export function resetManualLogout(): void {
  isManualLogout = false;
}

export function notifyUnauthorized(): void {
  const hadToken = Boolean(getAuthToken());
  removeAuthToken();
  if (isManualLogout || !hadToken) {
    return;
  }
  if (isNotifyingUnauthorized) {
    return;
  }
  isNotifyingUnauthorized = true;
  try {
    for (const listener of unauthorizedListeners) {
      listener();
    }
  } finally {
    setTimeout(() => {
      isNotifyingUnauthorized = false;
    }, 1000);
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  resetManualLogout();
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAuthToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getTokenRemainingTime(): number | null {
  const token = getAuthToken();
  if (!token) {
    return null;
  }
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) {
      return null;
    }
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(window.atob(padded));
    if (typeof payload.exp !== 'number' || Number.isNaN(payload.exp)) {
      return null;
    }
    return payload.exp * 1000 - Date.now();
  } catch {
    return null;
  }
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

export async function handleApiResponse<T>(response: Response, defaultMessage: string): Promise<T> {
  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseApiError(response, defaultMessage);
  }

  return response.json() as Promise<T>;
}

export async function handleVoidApiResponse(response: Response, defaultMessage: string): Promise<void> {
  if (response.status === 401) {
    notifyUnauthorized();
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
  }

  if (!response.ok) {
    throw await parseApiError(response, defaultMessage);
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
    throw await parseApiError(response, 'Đăng nhập thất bại');
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
    throw await parseApiError(response, 'Đăng ký thất bại');
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
    throw new UnauthorizedError('Phiên đăng nhập đã hết hạn');
  }

  if (!response.ok) {
    throw await parseApiError(response, 'Phiên đăng nhập đã hết hạn');
  }

  return response.json();
}
