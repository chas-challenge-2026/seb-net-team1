import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { invalidatePaymentData, queryKeys } from './queryKeys';
import type { ApprovalDecisionRequest, ApprovalDecisionResponse, ApprovalInbox } from './types';

export function fetchApprovals(signal?: AbortSignal) {
  return api.get<ApprovalInbox>('/api/approvals', { signal });
}

export function decideApproval(approvalStepId: number, body: ApprovalDecisionRequest) {
  return api.post<ApprovalDecisionResponse>(`/api/approvals/${approvalStepId}/decision`, body);
}

export function useApprovals(options: { enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.approvals.all(),
    queryFn: ({ signal }) => fetchApprovals(signal),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval,
  });
}

export function useDecideApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ approvalStepId, body }: { approvalStepId: number; body: ApprovalDecisionRequest }) =>
      decideApproval(approvalStepId, body),
    // Also after a failure: a 409 means somebody else changed the payment, so refetch it.
    onSettled: () => invalidatePaymentData(queryClient),
  });
}
