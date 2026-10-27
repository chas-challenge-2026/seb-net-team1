import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveBlob } from '../utils/download';
import { toIsoDate } from '../utils/date';
import { ApiError, api, apiDownload, type QueryParams } from './client';
import {
  invalidatePaymentData,
  queryKeys,
  type PaymentExportParams,
  type PaymentListParams,
} from './queryKeys';
import type {
  BatchResult,
  BatchValidation,
  CreatePaymentRequest,
  Paged,
  PaymentDetail,
  PaymentListItem,
  PaymentResponse,
} from './types';

function toPaymentQuery(params: PaymentListParams): QueryParams {
  return {
    status: params.status,
    accountId: params.accountId,
    search: params.search,
    fromDate: params.fromDate,
    toDate: params.toDate,
    createdByMe: params.createdByMe ? true : undefined,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export function fetchPayments(params: PaymentListParams, signal?: AbortSignal) {
  return api.get<Paged<PaymentListItem>>('/api/payments', { query: toPaymentQuery(params), signal });
}

export function fetchPayment(paymentId: number, signal?: AbortSignal) {
  return api.get<PaymentDetail>(`/api/payments/${paymentId}`, { signal });
}

export function createPayment(body: CreatePaymentRequest, idempotencyKey: string) {
  return api.post<PaymentResponse>('/api/payments', body, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** Downloads the CSV export for the given filters and saves it as a file. */
export async function downloadPaymentsExport(params: PaymentExportParams) {
  const { blob, filename } = await apiDownload('/api/payments/export', {
    query: toPaymentQuery(params),
  });
  const fallbackName = `betalningar-${toIsoDate(new Date()).replaceAll('-', '')}.csv`;
  saveBlob(blob, filename ?? fallbackName);
}

function batchFormData(file: File) {
  const form = new FormData();
  form.append('file', file, file.name);
  return form;
}

export function validateBatch(file: File) {
  return api.post<BatchValidation>('/api/payments/batch/validate', batchFormData(file));
}

export function createBatch(file: File, idempotencyKey: string) {
  return api.post<BatchResult>('/api/payments/batch', batchFormData(file), {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

/** The validation result a 400 from POST /api/payments/batch carries in its `validation` extension. */
export function batchValidationFromError(error: unknown): BatchValidation | null {
  if (!(error instanceof ApiError) || error.status !== 400) return null;
  const validation = error.extensions.validation;
  if (validation && typeof validation === 'object' && Array.isArray((validation as BatchValidation).rows)) {
    return validation as BatchValidation;
  }
  return null;
}

// ---------------------------------------------------------------- Hooks

export function usePayments(params: PaymentListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.payments.list(params),
    queryFn: ({ signal }) => fetchPayments(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function usePayment(paymentId: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.payments.detail(paymentId),
    queryFn: ({ signal }) => fetchPayment(paymentId, signal),
    enabled: options.enabled ?? true,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreatePaymentRequest; idempotencyKey: string }) =>
      createPayment(body, idempotencyKey),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}

export function useValidateBatch() {
  return useMutation({ mutationFn: (file: File) => validateBatch(file) });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, idempotencyKey }: { file: File; idempotencyKey: string }) =>
      createBatch(file, idempotencyKey),
    onSuccess: () => invalidatePaymentData(queryClient),
  });
}
