import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatus,
  PaymentOverview,
  RecentPaymentSummary,
} from "../types/Payment";
import type { User } from "../types/User";
import { apiRequest } from "./apiClient";

const PAYMENTS_ENDPOINT = "/api/payments";
const DEFAULT_PAYMENT_ERROR_MESSAGE = "Kunde inte skapa betalningen.";

type PaymentOverviewResponse = {
  recentPayments: RecentPaymentSummary[];
  user: User | null;
  tenantName: string | null;
  pendingApprovals?: RecentPaymentSummary[];
};

export class PaymentReadError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? (status === 401
      ? "Åtkomst nekad. Logga in igen."
      : "Kunde inte hämta betalningarna. Försök igen."));
    this.name = "PaymentReadError";
    this.status = status;
  }
}

export async function getRecentPayments(signal?: AbortSignal): Promise<PaymentOverview> {
  const response = await apiRequest("/api/dashboard", { signal });

  if (!response.ok) {
    throw new PaymentReadError(response.status);
  }

  let overview: PaymentOverviewResponse;
  try {
    overview = await response.json() as PaymentOverviewResponse;
  } catch {
    throw new PaymentReadError(response.status, "Svaret från betalningstjänsten kunde inte läsas.");
  }

  if (!overview || !Array.isArray(overview.recentPayments) || overview.recentPayments.some(
    (payment) => !payment || !Number.isSafeInteger(payment.id) || payment.id <= 0 ||
      typeof payment.createdAt !== "string" ||
      [payment.amount, payment.currency, payment.toIban, payment.reference, payment.status].some(
        (value) => value !== null && typeof value !== "string"
      )
  )) {
    throw new PaymentReadError(response.status, "Svaret från betalningstjänsten var ofullständigt.");
  }

  return {
    recentPayments: overview.recentPayments,
    user: overview.user ?? null,
    tenantName: overview.tenantName ?? null,
    pendingApprovalCount: Array.isArray(overview.pendingApprovals)
      ? overview.pendingApprovals.length
      : undefined,
  };
}

type PaymentApiResponse = {
  id?: number;
  status?: PaymentStatus;
  fromAccountId?: number;
  toIban?: string;
  amount?: string;
  currency?: string;
  reference?: string | null;
  createdAt?: string;
};

type PaymentApiError = {
  detail?: string;
  message?: string;
};

export async function createPayment(
  payment: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const response = await apiRequest(PAYMENTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payment),
  });

  if (!response.ok) {
    throw new Error(await getPaymentErrorMessage(response));
  }

  const createdPayment = (await response.json()) as PaymentApiResponse;

  if (createdPayment.id === undefined) {
    throw new Error("Svaret saknade betalnings-id.");
  }

  if (
    createdPayment.status === undefined ||
    createdPayment.fromAccountId === undefined ||
    createdPayment.toIban === undefined ||
    createdPayment.amount === undefined ||
    createdPayment.currency === undefined ||
    createdPayment.createdAt === undefined
  ) {
    throw new Error("Svaret från betalningstjänsten var ofullständigt.");
  }

  return {
    id: createdPayment.id,
    status: createdPayment.status,
    fromAccountId: createdPayment.fromAccountId,
    toIban: createdPayment.toIban,
    amount: createdPayment.amount,
    currency: createdPayment.currency,
    reference: createdPayment.reference ?? payment.reference ?? "",
    createdAt: createdPayment.createdAt,
  };
}

async function getPaymentErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as PaymentApiError;

    return (
      errorBody.detail?.trim() ||
      errorBody.message?.trim() ||
      DEFAULT_PAYMENT_ERROR_MESSAGE
    );
  } catch {
    return DEFAULT_PAYMENT_ERROR_MESSAGE;
  }
}
