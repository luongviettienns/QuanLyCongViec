import type { AuthResponse, LoginPayload, RegisterPayload, User } from '../types/auth.types';
import {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getTokenRemainingTime,
  getAuthHeaders,
  subscribeUnauthorized,
  notifyUnauthorized,
  markManualLogout,
  resetManualLogout,
  UnauthorizedError,
  parseApiError,
  handleApiResponse,
  handleVoidApiResponse,
} from '../../../shared/api';

export {
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getTokenRemainingTime,
  getAuthHeaders,
  subscribeUnauthorized,
  notifyUnauthorized,
  markManualLogout,
  resetManualLogout,
  UnauthorizedError,
  handleApiResponse,
  handleVoidApiResponse,
};

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
