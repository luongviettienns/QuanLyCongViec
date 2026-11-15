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
  safeFetch,
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
  const response = await safeFetch('/api/auth/login', {
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
  const response = await safeFetch('/api/auth/register', {
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
  if (!token || !token.trim()) {
    throw new UnauthorizedError('Chưa đăng nhập');
  }

  const response = await safeFetch('/api/auth/me', {
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
    throw await parseApiError(response, 'Không thể xác thực phiên đăng nhập');
  }

  return response.json();
}

export async function updateProfile(payload: { name: string }): Promise<User> {
  const response = await safeFetch('/api/auth/profile', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<User>(response, 'Không thể cập nhật thông tin cá nhân');
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const response = await safeFetch('/api/auth/password', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  return handleApiResponse<{ message: string }>(response, 'Không thể đổi mật khẩu');
}
