import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatus,
} from "../types/Payment";
import { apiRequest } from "./apiClient";

const PAYMENTS_ENDPOINT = "/api/payments";
const DEFAULT_PAYMENT_ERROR_MESSAGE = "Kunde inte skapa betalningen.";

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
