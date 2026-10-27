import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { AppConfig } from './types';

export function fetchConfig(signal?: AbortSignal) {
  return api.get<AppConfig>('/api/config', { signal });
}

/** Business rules (approval thresholds, batch limits). Never hardcode these in the UI. */
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config(),
    queryFn: ({ signal }) => fetchConfig(signal),
    staleTime: Infinity,
  });
}
