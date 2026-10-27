import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './queryKeys';
import type { ReportSummary } from './types';

export function fetchReportSummary(months: number, signal?: AbortSignal) {
  return api.get<ReportSummary>('/api/reports/summary', { query: { months }, signal });
}

export function useReportSummary(months: number) {
  return useQuery({
    queryKey: queryKeys.reports.summary(months),
    queryFn: ({ signal }) => fetchReportSummary(months, signal),
    // Keep the previous period on screen while another one loads.
    placeholderData: keepPreviousData,
  });
}
