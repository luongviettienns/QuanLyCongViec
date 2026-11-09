const TOKEN_KEY = 'taskflow_auth_token';

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

let isNotifyingUnauthorized = false;
let isManualLogout = false;

export function markManualLogout(): void {
  isManualLogout = true;
}

export function resetManualLogout(): void {
  isManualLogout = false;
}

export function subscribeUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
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

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}
