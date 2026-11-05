import { useState, useEffect, type ReactNode } from 'react';
import { message } from 'antd';
import type { User, LoginPayload, RegisterPayload } from '../types/auth.types';
import {
  getProfile,
  login as apiLogin,
  register as apiRegister,
  removeAuthToken,
  getAuthToken,
  subscribeUnauthorized,
  getTokenRemainingTime,
  notifyUnauthorized,
} from '../api/auth.api';
import { AuthContext } from './auth-context.base';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = subscribeUnauthorized(() => {
      setUser(null);
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

  useEffect(() => {
    async function initAuth() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const profile = await getProfile();
        setUser(profile);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void initAuth();
  }, []);

  async function login(payload: LoginPayload) {
    const res = await apiLogin(payload);
    setUser(res.user);
  }

  async function register(payload: RegisterPayload) {
    const res = await apiRegister(payload);
    setUser(res.user);
  }

  function logout() {
    removeAuthToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
