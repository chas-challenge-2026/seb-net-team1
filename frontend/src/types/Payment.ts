export type PaymentStatus = "completed" | "pending_approval";

export type CreatePaymentRequest = {
  fromAccountId: number;
  toIban: string;
  amount: string;
  reference?: string;
};

export type CreatePaymentResponse = {
  id: number;
  status: PaymentStatus;
  fromAccountId: number;
  toIban: string;
  amount: string;
  currency: string;
  reference: string;
  createdAt: string;
};
