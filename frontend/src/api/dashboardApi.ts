import type { User } from "../types/User";
import { canReadAuditLog } from "../utils/auditAccess";
import { apiRequest } from "./apiClient";

export interface DashboardAccount {
  id: number;
  accountName: string;
  iban: string | null;
  balance: number;
  currency: string;
}

export interface DashboardPayment {
  id: number;
  fromAccountId?: number;
  fromAccountName?: string | null;
  createdByName?: string | null;
  toIban: string | null;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  createdAt: string;
  executedAt?: string | null;
}

export interface DashboardValidation {
  id: number;
  paymentId: number;
  ibanValid: boolean;
  bicValid: boolean;
}

export interface DashboardAuditEntry {
  id: number;
  action: string;
  description: string;
  createdAt: string;
}

export interface DashboardData {
  user: User;
  tenantName: string | null;
  accounts: DashboardAccount[];
  payments: DashboardPayment[];
  pendingApprovals: DashboardPayment[];
  validations: DashboardValidation[] | null;
  recentActivity: DashboardAuditEntry[];
  upcomingPayments: DashboardPayment[];
  paymentStatusCounts: DashboardPaymentStatusCounts;
  summary: {
    totalBalance: number;
    pendingApprovals: number;
    totalPayments: number | null;
    validationErrors: number | null;
  };
}

export interface DashboardPaymentStatusCounts {
  completed: number;
  processing: number;
  pendingApproval: number;
  rejected: number;
  failed: number;
}

type PaymentSummaryResponse = Omit<DashboardPayment, "amount"> & {
  amount: string;
};

interface DashboardApiResponse {
  tenantName: string | null;
  user: User;
  accounts: (Omit<DashboardAccount, "balance"> & { balance: string })[];
  recentPayments: PaymentSummaryResponse[];
  pendingApprovals: PaymentSummaryResponse[];
  upcomingPayments?: PaymentSummaryResponse[];
  recentActivity?: DashboardAuditEntry[];
  summary?: {
    totalBalance: string;
    pendingApprovals: number;
    totalPayments: number;
    validationErrors: number;
  };
  paymentStatusCounts?: DashboardPaymentStatusCounts;
}

interface AuditLogApiResponse {
  entries: DashboardAuditEntry[];
}

function getRequestError(response: Response, fallback: string): Error {
  if (response.status === 401) {
    return new Error("Åtkomst nekad. Logga in igen.");
  }

  return new Error(fallback);
}

export async function getDashboardData(): Promise<DashboardData> {
  const dashboardResponse = await apiRequest("/api/dashboard");

  if (!dashboardResponse.ok) {
    throw getRequestError(
      dashboardResponse,
      "Kunde inte hämta dashboarddata från API:t."
    );
  }

  const dashboard = await dashboardResponse.json() as DashboardApiResponse;
  let recentActivity = dashboard.recentActivity ?? [];

  // Compatibility with deployments that have not yet shipped the dashboard activity projection.
  if (dashboard.recentActivity === undefined && canReadAuditLog(dashboard.user?.role)) {
    const auditResponse = await apiRequest("/api/audit-log?limit=3");
    if (auditResponse.status !== 403) {
      if (!auditResponse.ok) {
        throw getRequestError(auditResponse, "Kunde inte hämta senaste aktiviteten.");
      }

      const auditLog = await auditResponse.json() as AuditLogApiResponse;
      recentActivity = auditLog.entries;
    }
  }

  const accounts = dashboard.accounts.map((account): DashboardAccount => ({
    ...account,
    balance: Number(account.balance),
  }));

  const mapPayment = (payment: PaymentSummaryResponse): DashboardPayment => ({
    ...payment,
    amount: Number(payment.amount),
  });

  const payments = dashboard.recentPayments.map(mapPayment);
  const pendingApprovals = dashboard.pendingApprovals.map(mapPayment);
  const upcomingPayments = dashboard.upcomingPayments
    ? dashboard.upcomingPayments.map(mapPayment)
    : payments.filter((payment) =>
      payment.status === "pending_approval" || payment.status === "processing"
    );
  const summary = dashboard.summary;
  const paymentStatusCounts = dashboard.paymentStatusCounts ?? {
    completed: payments.filter((payment) => payment.status === "completed").length,
    processing: payments.filter((payment) => payment.status === "processing").length,
    pendingApproval: payments.filter((payment) => payment.status === "pending_approval").length,
    rejected: payments.filter((payment) => payment.status === "rejected").length,
    failed: payments.filter((payment) => payment.status === "failed").length,
  };

  return {
    user: dashboard.user,
    tenantName: dashboard.tenantName,
    accounts,
    payments,
    pendingApprovals,
    validations: null,
    recentActivity,
    upcomingPayments,
    paymentStatusCounts,
    summary: {
      totalBalance: summary
        ? Number(summary.totalBalance)
        : accounts.filter((account) => account.currency === "SEK")
          .reduce((total, account) => total + account.balance, 0),
      pendingApprovals: summary?.pendingApprovals ?? pendingApprovals.length,
      totalPayments: summary?.totalPayments ?? null,
      validationErrors: summary?.validationErrors ?? null,
    },
  };
}
