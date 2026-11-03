import { useState, useEffect, type ReactNode } from 'react';
import type { User, LoginPayload, RegisterPayload } from '../types/auth.types';
import {
  getProfile,
  login as apiLogin,
  register as apiRegister,
  removeAuthToken,
  getAuthToken,
} from '../api/auth.api';
import { AuthContext } from './auth-context.base';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
