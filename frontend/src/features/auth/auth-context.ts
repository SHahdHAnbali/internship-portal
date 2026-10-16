import {
  createContext,
  useContext,
} from 'react';

import type {
  Session,
  User,
} from '@supabase/supabase-js';

export type UserRole =
  | 'APPLICANT'
  | 'INTERN'
  | 'MENTOR'
  | 'HR'
  | 'ADMIN';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  fullName: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  // Reloads the role from profiles (e.g. after HR activated a placement).
  refreshProfile: () => Promise<void>;
}

export const AuthContext =
  createContext<AuthContextValue | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
