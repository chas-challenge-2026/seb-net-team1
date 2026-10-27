import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { AuthResponse, ChangePasswordRequest, CurrentUser, LoginRequest } from './types';

export function loginRequest(body: LoginRequest) {
  return api.post<AuthResponse>('/api/auth/login', body, { anonymous: true, skipAuthRefresh: true });
}

export function logoutRequest() {
  return api.post<void>('/api/auth/logout', undefined, { skipAuthRefresh: true });
}

export function fetchCurrentUser(signal?: AbortSignal) {
  return api.get<CurrentUser>('/api/auth/me', { signal });
}

export function changePassword(body: ChangePasswordRequest) {
  return api.post<void>('/api/auth/change-password', body);
}

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: ({ signal }) => fetchCurrentUser(signal),
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}
