import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys, type AuditLogFilters } from './queryKeys';
import type { AuditLogPage, AuditVerification } from './types';

export function fetchAuditLog(filters: AuditLogFilters, cursor?: string, signal?: AbortSignal) {
  return api.get<AuditLogPage>('/api/audit-log', {
    query: {
      limit: filters.limit,
      cursor,
      action: filters.action,
      entityType: filters.entityType,
      entityId: filters.entityId,
    },
    signal,
  });
}

export function verifyAuditChain() {
  return api.get<AuditVerification>('/api/audit-log/verify');
}

/** Newest first; `fetchNextPage` loads older entries through `nextCursor`. */
export function useAuditLog(filters: AuditLogFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.auditLog.list(filters),
    queryFn: ({ pageParam, signal }) => fetchAuditLog(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** The latest entries only, for activity feeds. */
export function useRecentAuditEntries(limit: number) {
  return useQuery({
    queryKey: queryKeys.auditLog.recent(limit),
    queryFn: ({ signal }) => fetchAuditLog({ limit }, undefined, signal),
  });
}

export function useVerifyAuditChain() {
  return useMutation({ mutationFn: verifyAuditChain });
}
