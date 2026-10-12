import type {
  ApprovalDecisionRequest,
  ApprovalDecisionResponse,
  ApprovalInboxResponse,
} from "../types/Approval";
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

const decisionErrorMessages: Record<number, string> = {
  400: "Kunde inte spara beslutet. Kontrollera åtgärden och kommentaren (högst 255 tecken).",
  401: "Din inloggning har gått ut. Logga in igen för att fatta beslut.",
  403: "Du har inte behörighet att fatta beslut om denna betalning.",
  404: "Betalningens atteststeg hittades inte. Uppdatera listan.",
  409: "Betalningen har redan hanterats eller ändrats. Uppdatera listan.",
};

// Only known business messages from ProblemDetails are shown in the page.
const decisionBusinessMessages: Record<number, readonly string[]> = {
  400: [
    "Ogiltig åtgärd.",
    "Kommentaren får vara högst 255 tecken.",
    "Kontot har inte tillräckligt saldo för denna betalning.",
    "Beloppet måste vara större än 0.",
    "Betalningen tillhör inte det angivna kontot.",
  ],
  409: [
    "Det här atteststeget är redan hanterat.",
    "Du har redan godkänt den här betalningen. En annan attestant måste godkänna nästa steg.",
    "Betalningen är inte längre under granskning.",
    "Kontot ändrades av en annan betalning. Uppdatera och försök igen.",
  ],
};

export class ApprovalDecisionApiError extends Error {
  readonly status: number;

  constructor(status: number, detail?: string) {
    const safeDetail =
      detail && decisionBusinessMessages[status]?.includes(detail)
        ? detail
        : undefined;

    super(
      safeDetail ??
        decisionErrorMessages[status] ??
        "Kunde inte bekräfta att beslutet sparades. Uppdatera listan för att kontrollera betalningens status innan du försöker igen."
    );
    this.name = "ApprovalDecisionApiError";
    this.status = status;
  }
}

function isApprovalDecisionResponse(
  value: unknown,
  approvalStepId: string,
  request: ApprovalDecisionRequest
): value is ApprovalDecisionResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const decision = value as Record<string, unknown>;
  if (
    typeof decision.paymentId !== "number" ||
    !Number.isSafeInteger(decision.paymentId) ||
    decision.paymentId <= 0 ||
    typeof decision.approvalStepId !== "string" ||
    decision.approvalStepId.toLowerCase() !== approvalStepId.toLowerCase()
  ) {
    return false;
  }

  return request.action === "approve"
    ? decision.stepStatus === "approved" &&
        (decision.paymentStatus === "completed" ||
          decision.paymentStatus === "pending_approval")
    : decision.stepStatus === "rejected" &&
        decision.paymentStatus === "rejected";
}

export async function decideApproval(
  approvalStepId: string,
  request: ApprovalDecisionRequest
): Promise<ApprovalDecisionResponse> {
  let response: Response;

  try {
    response = await apiRequest(
      `/api/approvals/${encodeURIComponent(approvalStepId)}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      }
    );
  } catch {
    // A network failure may happen after the backend saved the decision.
    // The caller must refresh the inbox before deciding whether to retry.
    throw new ApprovalDecisionApiError(0);
  }

  if (!response.ok) {
    let detail: string | undefined;

    try {
      const problem = (await response.json()) as { detail?: unknown };
      if (typeof problem.detail === "string") {
        detail = problem.detail;
      }
    } catch {
      // Empty or non-JSON errors use the safe message for the HTTP status.
    }

    throw new ApprovalDecisionApiError(response.status, detail);
  }

  try {
    const decision: unknown = await response.json();
    if (!isApprovalDecisionResponse(decision, approvalStepId, request)) {
      throw new ApprovalDecisionApiError(response.status);
    }

    return decision;
  } catch {
    throw new ApprovalDecisionApiError(response.status);
  }
}
