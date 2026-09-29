import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { Account, Paged, Transaction } from './types';

export function fetchAccounts(signal?: AbortSignal) {
  return api.get<Account[]>('/api/accounts', { signal });
}

export function fetchAccount(accountId: number, signal?: AbortSignal) {
  return api.get<Account>(`/api/accounts/${accountId}`, { signal });
}

export function fetchAccountTransactions(
  accountId: number,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
) {
  return api.get<Paged<Transaction>>(`/api/accounts/${accountId}/transactions`, {
    query: { page, pageSize },
    signal,
  });
}

export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: ({ signal }) => fetchAccounts(signal),
  });
}

export function useAccount(accountId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.accounts.detail(accountId),
    queryFn: ({ signal }) => fetchAccount(accountId, signal),
    enabled: options.enabled ?? true,
  });
}

export function useAccountTransactions(
  accountId: number,
  page: number,
  pageSize: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.accounts.transactions(accountId, page, pageSize),
    queryFn: ({ signal }) => fetchAccountTransactions(accountId, page, pageSize, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}
