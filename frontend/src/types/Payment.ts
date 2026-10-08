import type { User } from "./User";

export type PaymentStatus = "completed" | "pending_approval";

export type CreatePaymentRequest = {
  fromAccountId: number;
  toIban: string;
  amount: number;
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

// Dashboard summaries are not a payment-detail response.
export type RecentPaymentSummary = {
  id: number;
  toIban: string | null;
  amount: string | null;
  currency: string | null;
  reference: string | null;
  status: string | null;
  createdAt: string;
};

export type PaymentOverview = {
  recentPayments: RecentPaymentSummary[];
  user: User | null;
  tenantName: string | null;
  pendingApprovalCount?: number;
};
