import { createContext, useContext } from 'react';
import type { CurrentUser, LoginRequest } from '../api/types';

export type AuthStatus = 'bootstrapping' | 'ready';

export interface AuthContextValue {
  /** 'bootstrapping' while the app restores the session from the refresh cookie. */
  status: AuthStatus;
  user: CurrentUser | null;
  login: (credentials: LoginRequest) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  /** initiator or admin */
  canCreatePayments: boolean;
  /** attestant or admin */
  canApprove: boolean;
  isAdmin: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** The signed-in user. Only use inside the authenticated part of the app. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser was called without a signed-in user.');
  return user;
}
