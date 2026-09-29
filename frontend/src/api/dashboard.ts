import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Dashboard } from './types';

export function fetchDashboard(signal?: AbortSignal) {
  return api.get<Dashboard>('/api/dashboard', { signal });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: ({ signal }) => fetchDashboard(signal),
  });
}
