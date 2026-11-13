import { createContext } from 'react';
import type { User, LoginPayload, RegisterPayload } from '../types/auth.types';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: unknown;
  retryAuth: () => Promise<void>;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  updateProfile: (name: string) => Promise<User>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
