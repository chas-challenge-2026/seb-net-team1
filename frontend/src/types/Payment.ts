export type PaymentStatus = "completed" | "pending_approval";

export type PaymentId = number | string;

export type CreatePaymentRequest = {
  fromAccountId: number;
  toIban: string;
  amount: string;
  reference?: string;
};

export type CreatePaymentResponse = {
  id: PaymentId;
  status: PaymentStatus;
  fromAccountId: number;
  toIban: string;
  amount: string;
  currency: string;
  reference: string;
  createdAt: string;
};
