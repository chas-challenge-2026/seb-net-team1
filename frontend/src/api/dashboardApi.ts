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
  toIban: string | null;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  createdAt: string;
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
  let recentActivity: DashboardAuditEntry[] = [];

  if (canReadAuditLog(dashboard.user?.role)) {
    const auditResponse = await apiRequest("/api/audit-log?limit=3");

    // The current identity may have changed since the dashboard request.
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
  const countStatus = (status: string) =>
    payments.filter((payment) => payment.status === status).length;

  return {
    user: dashboard.user,
    tenantName: dashboard.tenantName,
    accounts,
    payments,
    pendingApprovals,
    validations: null,
    recentActivity,
    upcomingPayments: payments
      .filter((payment) =>
        payment.status === "pending_approval" || payment.status === "processing"
      ),
    paymentStatusCounts: {
      completed: countStatus("completed"),
      processing: countStatus("processing"),
      pendingApproval: countStatus("pending_approval"),
      rejected: countStatus("rejected"),
      failed: countStatus("failed"),
    },
    summary: {
      totalBalance: accounts
        .filter((account) => account.currency === "SEK")
        .reduce((total, account) => total + account.balance, 0),
      pendingApprovals: pendingApprovals.length,
      totalPayments: null,
      validationErrors: null,
    },
  };
}
