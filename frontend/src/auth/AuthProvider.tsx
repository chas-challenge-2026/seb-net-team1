import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { loginRequest, logoutRequest } from '../api/auth';
import { refreshSession, setAuthFailureHandler } from '../api/client';
import type { LoginRequest } from '../api/types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';
import { hasPermission } from './roles';
import { sessionHint, sessionStore } from './session';

/** Read once at startup: only try to restore a session this browser may still have. */
const restoreOnStart = sessionHint.mayExist();

interface AuthProviderProps {
  children: ReactNode;
  /** Called after an explicit logout. */
  onSignedOut: () => void;
  /** Called when the session expired and could not be refreshed. */
  onSessionExpired: () => void;
}

export function AuthProvider({ children, onSignedOut, onSessionExpired }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const [status, setStatus] = useState<AuthStatus>(restoreOnStart ? 'bootstrapping' : 'ready');

  // Restore the session from the httpOnly refresh cookie. refreshSession() is
  // single-flight, so StrictMode's double effect still sends one request.
  useEffect(() => {
    if (!restoreOnStart) return;
    let active = true;
    void refreshSession().finally(() => {
      if (active) setStatus('ready');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      queryClient.clear();
      onSessionExpired();
    });
    return () => setAuthFailureHandler(null);
  }, [queryClient, onSessionExpired]);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const auth = await loginRequest(credentials);
      // Never show data cached for a previous user.
      queryClient.clear();
      sessionStore.setFromAuth(auth);
      return auth.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch {
      // The local session is cleared regardless; the refresh token expires on its own.
    }
    sessionStore.clear();
    queryClient.clear();
    onSignedOut();
  }, [queryClient, onSignedOut]);

  const user = session?.user ?? null;
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      canCreatePayments: hasPermission(user?.role, 'createPayments'),
      canApprove: hasPermission(user?.role, 'approve'),
      isAdmin: hasPermission(user?.role, 'admin'),
    }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
