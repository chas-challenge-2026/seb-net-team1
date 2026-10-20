import { useCallback, useEffect, useState } from "react";
import { ApprovalApiError, getApprovalInbox } from "../api/approvalsApi";
import type { PendingApproval } from "../types/Approval";
import type { User } from "../types/User";
import { APPROVALS_UPDATED_EVENT } from "../utils/approvalUpdates";

type NotificationError = { message: string; status?: number };
type NotificationState = {
  identity: string;
  version: number;
  pending: PendingApproval[];
  error: NotificationError | null;
};

function uniquePayments(pending: PendingApproval[]): PendingApproval[] {
  const payments = new Map<number, PendingApproval>();
  for (const approval of pending) {
    if (!Number.isSafeInteger(approval.paymentId) || approval.paymentId <= 0) {
      throw new Error("Invalid approval response");
    }
    const existing = payments.get(approval.paymentId);
    if (!existing || approval.currentStep < existing.currentStep) {
      payments.set(approval.paymentId, approval);
    }
  }
  return [...payments.values()].sort((first, second) =>
    Date.parse(second.createdAt) - Date.parse(first.createdAt) || second.paymentId - first.paymentId);
}

export function useApprovalNotifications(user: User | null) {
  const canApprove = Boolean(user && Number.isSafeInteger(user.id) && user.id > 0 &&
    Number.isSafeInteger(user.tenantId) && user.tenantId > 0 &&
    (user.role === "admin" || user.role === "attestant"));
  const identity = user ? `${user.tenantId}:${user.id}:${user.role}` : "";
  const [requestVersion, setRequestVersion] = useState(0);
  const [state, setState] = useState<NotificationState>({
    identity: "", version: -1, pending: [], error: null,
  });
  const current = canApprove && state.identity === identity ? state : null;
  const isLoading = canApprove && current?.version !== requestVersion;
  const error = isLoading ? null : current?.error ?? null;
  const refresh = useCallback(() => setRequestVersion((version) => version + 1), []);

  useEffect(() => {
    if (!canApprove) return;
    const controller = new AbortController();

    getApprovalInbox({ signal: controller.signal })
      .then((inbox) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(inbox?.pending)) throw new Error("Invalid approval response");
        setState({ identity, version: requestVersion, pending: uniquePayments(inbox.pending), error: null });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          identity, version: requestVersion, pending: [],
          error: {
            message: cause instanceof ApprovalApiError
              ? cause.message
              : "Kunde inte hämta notiser. Kontrollera anslutningen och försök igen.",
            status: cause instanceof ApprovalApiError ? cause.status : undefined,
          },
        });
      });

    return () => controller.abort();
  }, [identity, canApprove, requestVersion]);

  const pollingBlocked = current?.error?.status === 401 || current?.error?.status === 403;
  useEffect(() => {
    if (!canApprove || pollingBlocked) return;
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") refresh();
    }, 30_000);
    return () => clearInterval(timer);
  }, [canApprove, pollingBlocked, refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshVisible = () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "user" || event.key === null) refresh();
    };
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener(APPROVALS_UPDATED_EVENT, refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APPROVALS_UPDATED_EVENT, refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  return { pending: current?.pending ?? [], isLoading, error, canApprove, refresh };
}
