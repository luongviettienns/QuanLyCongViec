import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import { message } from 'antd';
import type { User, LoginPayload, RegisterPayload } from '../types/auth.types';
import {
  getProfile,
  login as apiLogin,
  register as apiRegister,
  updateProfile as apiUpdateProfile,
  removeAuthToken,
  getAuthToken,
  subscribeUnauthorized,
  getTokenRemainingTime,
  notifyUnauthorized,
  markManualLogout,
} from '../api/auth.api';
import { isAbortError, isUnauthorizedError } from '../../../shared/api';
import { AuthContext } from './auth-context.base';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<unknown>(null);

  const isMountedRef = useRef(true);
  const authAbortRef = useRef<AbortController | null>(null);
  const authRequestIdRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => {
      setUser(null);
      setAuthError(null);
      void message.error({
        content: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
        key: 'session-expired',
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    function checkExpiration() {
      const remaining = getTokenRemainingTime();
      if (remaining !== null && remaining <= 0) {
        notifyUnauthorized();
      }
    }

    checkExpiration();

    const remaining = getTokenRemainingTime();
    if (remaining === null) {
      return;
    }

    const maxDelay = 2147483647;
    const delay = Math.min(Math.max(remaining, 0), maxDelay);

    const timer = setTimeout(() => {
      checkExpiration();
    }, delay);

    const interval = setInterval(checkExpiration, 30000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [user]);

  const initAuth = useCallback(async () => {
    authAbortRef.current?.abort();
    const controller = new AbortController();
    authAbortRef.current = controller;
    const requestId = ++authRequestIdRef.current;

    const token = getAuthToken();
    const remaining = getTokenRemainingTime();
    if (!token || !token.trim() || (remaining !== null && remaining <= 0)) {
      if (token) {
        removeAuthToken();
      }
      await Promise.resolve();
      if (
        isMountedRef.current &&
        authRequestIdRef.current === requestId &&
        !controller.signal.aborted
      ) {
        setUser(null);
        setAuthError(null);
        setLoading(false);
      }
      return;
    }

    try {
      const profile = await getProfile(controller.signal);
      if (!isMountedRef.current || authRequestIdRef.current !== requestId) {
        return;
      }
      setUser(profile);
      setAuthError(null);
    } catch (error) {
      if (
        !isMountedRef.current ||
        authRequestIdRef.current !== requestId ||
        isAbortError(error) ||
        controller.signal.aborted
      ) {
        return;
      }

      if (isUnauthorizedError(error)) {
        removeAuthToken();
        setUser(null);
        setAuthError(null);
      } else {
        // Keep token intact on network/5xx errors so the user can retry without losing session
        setUser(null);
        setAuthError(error);
      }
    } finally {
      if (
        isMountedRef.current &&
        authRequestIdRef.current === requestId &&
        !controller.signal.aborted
      ) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;
    void Promise.resolve().then(() => {
      if (!cancelled && isMountedRef.current) {
        void initAuth();
      }
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      authAbortRef.current?.abort();
    };
  }, [initAuth]);

  const retryAuth = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    await initAuth();
  }, [initAuth]);

  const login = useCallback(async (payload: LoginPayload) => {
    authAbortRef.current?.abort();
    authRequestIdRef.current += 1;
    const res = await apiLogin(payload);
    if (isMountedRef.current) {
      setAuthError(null);
      setUser(res.user);
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    authAbortRef.current?.abort();
    authRequestIdRef.current += 1;
    const res = await apiRegister(payload);
    if (isMountedRef.current) {
      setAuthError(null);
      setUser(res.user);
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (name: string): Promise<User> => {
    const updatedUser = await apiUpdateProfile({ name });
    setUser(updatedUser);
    return updatedUser;
  }, []);

  const logout = useCallback(() => {
    authAbortRef.current?.abort();
    authRequestIdRef.current += 1;
    markManualLogout();
    removeAuthToken();
    setAuthError(null);
    setUser(null);
    setLoading(false);
    void message.destroy('session-expired');
    message.success('Đăng xuất thành công');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        retryAuth,
        login,
        register,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
