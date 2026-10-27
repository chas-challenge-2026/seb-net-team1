import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { CreateUserRequest, ResetPasswordRequest, UpdateUserRequest, UserAdmin } from './types';

export function fetchUsers(signal?: AbortSignal) {
  return api.get<UserAdmin[]>('/api/users', { signal });
}

export function createUser(body: CreateUserRequest) {
  return api.post<UserAdmin>('/api/users', body);
}

export function updateUser(userId: number, body: UpdateUserRequest) {
  return api.put<UserAdmin>(`/api/users/${userId}`, body);
}

export function resetUserPassword(userId: number, body: ResetPasswordRequest) {
  return api.post<void>(`/api/users/${userId}/reset-password`, body);
}

export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.users.all(),
    queryFn: ({ signal }) => fetchUsers(signal),
    enabled: options.enabled ?? true,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auditLog.all() }),
      ]),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: UpdateUserRequest }) => updateUser(userId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.users.all() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.auditLog.all() }),
      ]),
  });
}

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, body }: { userId: number; body: ResetPasswordRequest }) =>
      resetUserPassword(userId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auditLog.all() }),
  });
}
