import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { NotificationList } from './types';

export function fetchNotifications(limit: number, signal?: AbortSignal) {
  return api.get<NotificationList>('/api/notifications', { query: { limit }, signal });
}

export function markNotificationRead(notificationId: number) {
  return api.post<void>(`/api/notifications/${notificationId}/read`);
}

export function markAllNotificationsRead() {
  return api.post<void>('/api/notifications/read-all');
}

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: queryKeys.notifications.list(limit),
    queryFn: ({ signal }) => fetchNotifications(limit, signal),
    refetchInterval: 30_000,
  });
}

/** Marks notifications as read in every cached list right away; the server result follows. */
async function markReadInCache(queryClient: QueryClient, shouldMark: (id: number) => boolean) {
  await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all() });
  const readAt = new Date().toISOString();
  queryClient.setQueriesData<NotificationList>({ queryKey: queryKeys.notifications.all() }, (data) => {
    if (!data) return data;
    let marked = 0;
    const items = data.items.map((item) => {
      if (item.readAt || !shouldMark(item.id)) return item;
      marked += 1;
      return { ...item, readAt };
    });
    return { items, unreadCount: Math.max(0, data.unreadCount - marked) };
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) => markNotificationRead(notificationId),
    onMutate: (notificationId) => markReadInCache(queryClient, (id) => id === notificationId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => markReadInCache(queryClient, () => true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() }),
  });
}
