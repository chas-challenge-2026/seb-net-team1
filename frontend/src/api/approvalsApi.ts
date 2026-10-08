import type { ApprovalInboxResponse } from "../types/Approval";
import { apiRequest } from "./apiClient";

type ApprovalInboxRequest = {
  signal?: AbortSignal;
};

export class ApprovalApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 401
        ? "Åtkomst nekad. Logga in igen."
        : status === 403
          ? "Du har inte behörighet att se väntande betalningar."
          : "Kunde inte hämta väntande betalningar. Försök igen."
    );
    this.name = "ApprovalApiError";
    this.status = status;
  }
}

export async function getApprovalInbox({
  signal,
}: ApprovalInboxRequest = {}): Promise<ApprovalInboxResponse> {
  const response = await apiRequest("/api/approvals", { signal });

  if (!response.ok) {
    throw new ApprovalApiError(response.status);
  }

  return response.json() as Promise<ApprovalInboxResponse>;
}
