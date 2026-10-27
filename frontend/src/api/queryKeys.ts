import type { QueryClient } from '@tanstack/react-query';
import type { AuditAction, PaymentStatus } from './types';

export interface PaymentListParams {
  status?: PaymentStatus;
  accountId?: number;
  /** Matches reference, IBAN and payment id. */
  search?: string;
  fromDate?: string;
  toDate?: string;
  createdByMe?: boolean;
  page?: number;
  pageSize?: number;
}

export type PaymentExportParams = Omit<PaymentListParams, 'page' | 'pageSize'>;

export interface AuditLogFilters {
  action?: AuditAction;
  entityType?: string;
  entityId?: number;
  limit?: number;
}

/**
 * Query-key factory. Keys are hierarchical, so invalidating e.g. `payments.all()`
 * also invalidates every list and detail below it.
 */
export const queryKeys = {
  config: () => ['config'] as const,
  currentUser: () => ['auth', 'me'] as const,
  dashboard: () => ['dashboard'] as const,
  accounts: {
    all: () => ['accounts'] as const,
    list: () => ['accounts', 'list'] as const,
    detail: (accountId: number) => ['accounts', 'detail', accountId] as const,
    transactions: (accountId: number, page: number, pageSize: number) =>
      ['accounts', 'detail', accountId, 'transactions', { page, pageSize }] as const,
  },
  payments: {
    all: () => ['payments'] as const,
    list: (params: PaymentListParams) => ['payments', 'list', params] as const,
    detail: (paymentId: number) => ['payments', 'detail', paymentId] as const,
  },
  approvals: {
    all: () => ['approvals'] as const,
  },
  auditLog: {
    all: () => ['audit-log'] as const,
    list: (filters: AuditLogFilters) => ['audit-log', 'list', filters] as const,
    recent: (limit: number) => ['audit-log', 'recent', limit] as const,
  },
  notifications: {
    all: () => ['notifications'] as const,
    list: (limit: number) => ['notifications', 'list', limit] as const,
  },
  users: {
    all: () => ['users'] as const,
  },
  reports: {
    all: () => ['reports'] as const,
    summary: (months: number) => ['reports', 'summary', months] as const,
  },
  validation: {
    iban: (value: string) => ['validation', 'iban', value] as const,
  },
};

/**
 * Everything that can change when money moves: a payment is created, a batch is
 * uploaded or an approval step is decided.
 */
export function invalidatePaymentData(client: QueryClient) {
  return Promise.all(
    [
      queryKeys.payments.all(),
      queryKeys.dashboard(),
      queryKeys.accounts.all(),
      queryKeys.approvals.all(),
      queryKeys.notifications.all(),
      queryKeys.reports.all(),
      queryKeys.auditLog.all(),
    ].map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
