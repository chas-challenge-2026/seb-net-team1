import type { User } from "./User";
import type { ApprovalTimelineStep } from "./Approval";
import type { AuditEntry } from "./AuditLog";

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

// Payment rows include database-backed source-account and execution fields.
export type RecentPaymentSummary = {
  id: number;
  fromAccountId?: number | null;
  fromAccountName?: string | null;
  createdByName?: string | null;
  toIban: string | null;
  amount: string | null;
  currency: string | null;
  reference: string | null;
  status: string | null;
  createdAt: string;
  executedAt?: string | null;
};

export type PaymentDetails = RecentPaymentSummary & {
  fromAccountId: number;
  fromAccountName: string | null;
  createdByName: string | null;
  toIban: string;
  recipientName?: string | null;
  amount: string;
  currency: string;
  reference: string | null;
  status: string;
  approvalTimeline: ApprovalTimelineStep[];
  activity: AuditEntry[];
};

export type PaymentOverview = {
  recentPayments: RecentPaymentSummary[];
  user: User | null;
  tenantName: string | null;
  pendingApprovalCount?: number;
};
