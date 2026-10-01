import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatus,
} from "../types/Payment";
import { buildApiUrl } from "./apiConfig";

const PAYMENTS_ENDPOINT = "/payments";
const MOCK_DEFAULT_STATUS: PaymentStatus = "completed";
const MOCK_DEFAULT_CURRENCY = "SEK";

type JsonServerCreatePaymentResponse = {
  id?: number | string;
  status?: PaymentStatus;
  fromAccountId?: number;
  toIban?: string;
  amount?: string | number;
  currency?: string;
  reference?: string;
  createdAt?: string;
};

export async function createPayment(
  payment: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const mockPaymentBody = {
    ...payment,
    reference: payment.reference ?? "",
    status: MOCK_DEFAULT_STATUS,
    currency: MOCK_DEFAULT_CURRENCY,
    createdAt: new Date().toISOString(),
  };

  const response = await fetch(buildApiUrl(PAYMENTS_ENDPOINT), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mockPaymentBody),
  });

  if (!response.ok) {
    throw new Error("Kunde inte skapa betalningen.");
  }

  const createdPayment =
    (await response.json()) as JsonServerCreatePaymentResponse;

  if (createdPayment.id === undefined) {
    throw new Error("Mock API saknade betalnings-id.");
  }

  return {
    id: createdPayment.id,
    status: createdPayment.status ?? MOCK_DEFAULT_STATUS,
    fromAccountId: createdPayment.fromAccountId ?? payment.fromAccountId,
    toIban: createdPayment.toIban ?? payment.toIban,
    amount: String(createdPayment.amount ?? payment.amount),
    currency: createdPayment.currency ?? MOCK_DEFAULT_CURRENCY,
    reference: createdPayment.reference ?? payment.reference ?? "",
    createdAt: createdPayment.createdAt ?? mockPaymentBody.createdAt,
  };
}
