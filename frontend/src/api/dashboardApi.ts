import type { User } from "../types/User";

const DEFAULT_MOCK_API_URL = "http://localhost:3001";
const MOCK_API_URL =
  import.meta.env.VITE_MOCK_API_URL?.trim() || DEFAULT_MOCK_API_URL;

export interface DashboardAccount {
  id: number;
  accountName: string;
  iban: string;
  balance: number;
  currency: string;
}

export interface DashboardPayment {
  id: number;
  tenantId: number;
  fromAccountId: number;
  toIban: string;
  amount: number;
  currency: string;
  reference: string;
  status: string;
  createdAt: string;
  executedAt: string | null;
}

export interface DashboardApproval {
  payment: DashboardPayment;
  step: {
    id: number;
    stepNumber: number;
  };
  approver?: {
    name: string;
  };
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
  pendingApprovals: DashboardApproval[];
  validations: DashboardValidation[];
  recentActivity: DashboardAuditEntry[];
  upcomingPayments: DashboardPayment[];
  paymentStatusCounts: DashboardPaymentStatusCounts;
  summary: {
    totalBalance: number;
    pendingApprovals: number;
    totalPayments: number;
    validationErrors: number;
  };
}

export interface DashboardPaymentStatusCounts {
  completed: number;
  processing: number;
  pendingApproval: number;
  rejected: number;
  failed: number;
}

interface MockUser extends Omit<User, "id" | "tenantId"> {
  id: number | string;
  tenantId: number | string;
}

interface MockTenant {
  id: number | string;
  name: string;
}

interface MockAccount extends Omit<DashboardAccount, "id" | "balance"> {
  id: number | string;
  tenantId: number | string;
  balance: number | string;
}

interface MockPayment extends Omit<DashboardPayment, "id" | "tenantId" | "fromAccountId" | "amount"> {
  id: number | string;
  tenantId: number | string;
  fromAccountId: number | string;
  amount: number | string;
}

interface MockApprovalStep {
  id: number | string;
  paymentId: number | string;
  attestantId: number | string;
  stepNumber: number | string;
  status: string;
}

interface MockValidation {
  id: number | string;
  paymentId: number | string;
  ibanValid: boolean;
  bicValid: boolean;
}

interface MockAuditEntry extends Omit<DashboardAuditEntry, "id"> {
  id: number | string;
}

async function getMockCollection<T>(collection: string): Promise<T[]> {
  const response = await fetch(`${MOCK_API_URL}/${collection}`);

  if (!response.ok) {
    throw new Error(`Kunde inte hämta ${collection} från mock-API:t.`);
  }

  return response.json() as Promise<T[]>;
}

function getStoredUser(): Partial<User> | null {
  try {
    const storedUser = localStorage.getItem("user");
    return storedUser ? (JSON.parse(storedUser) as Partial<User>) : null;
  } catch {
    return null;
  }
}

export async function getDashboardData(): Promise<DashboardData> {
  const [usersData, tenantsData, accountsData, paymentsData, stepsData, validationsData, auditData] =
    await Promise.all([
      getMockCollection<MockUser>("users"),
      getMockCollection<MockTenant>("tenants"),
      getMockCollection<MockAccount>("accounts"),
      getMockCollection<MockPayment>("payments"),
      getMockCollection<MockApprovalStep>("approvalSteps"),
      getMockCollection<MockValidation>("ibanValidations"),
      getMockCollection<MockAuditEntry>("auditEntries"),
    ]);

  const storedUser = getStoredUser();
  const rawUser = usersData.find(
    (user) =>
      (storedUser?.id !== undefined && String(user.id) === String(storedUser.id)) ||
      (storedUser?.email !== undefined && user.email === storedUser.email)
  ) ?? usersData[0];

  if (!rawUser) {
    throw new Error("Mock-datan innehåller inga användare.");
  }

  const user: User = {
    ...rawUser,
    id: Number(rawUser.id),
    tenantId: Number(rawUser.tenantId),
  };

  const accounts = accountsData
    .filter((account) => Number(account.tenantId) === user.tenantId)
    .map((account): DashboardAccount => ({
      ...account,
      id: Number(account.id),
      balance: Number(account.balance),
    }));

  const payments = paymentsData
    .filter((payment) => Number(payment.tenantId) === user.tenantId)
    .map((payment): DashboardPayment => ({
      ...payment,
      id: Number(payment.id),
      tenantId: Number(payment.tenantId),
      fromAccountId: Number(payment.fromAccountId),
      amount: Number(payment.amount),
    }));

  const paymentsById = new Map(payments.map((payment) => [payment.id, payment]));
  const usersById = new Map(
    usersData.map((mockUser) => [Number(mockUser.id), mockUser])
  );

  const pendingApprovals = stepsData
    .filter((step) => step.status === "pending")
    .flatMap((step) => {
      const payment = paymentsById.get(Number(step.paymentId));
      if (!payment) {
        return [];
      }

      const approver = usersById.get(Number(step.attestantId));
      return [{
        payment,
        step: { id: Number(step.id), stepNumber: Number(step.stepNumber) },
        approver: approver ? { name: approver.name } : undefined,
      }];
    })
    .slice(0, 3);

  const validations = validationsData.map((validation): DashboardValidation => ({
    id: Number(validation.id),
    paymentId: Number(validation.paymentId),
    ibanValid: validation.ibanValid,
    bicValid: validation.bicValid,
  }));

  const recentActivity = auditData
    .map((entry): DashboardAuditEntry => ({ ...entry, id: Number(entry.id) }))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 3);

  const countStatus = (status: string) =>
    payments.filter((payment) => payment.status === status).length;

  return {
    user,
    tenantName: tenantsData.find((tenant) => Number(tenant.id) === user.tenantId)?.name ?? null,
    accounts,
    payments,
    pendingApprovals,
    validations,
    recentActivity,
    upcomingPayments: payments
      .filter((payment) =>
        payment.status === "pending_approval" || payment.status === "processing"
      )
      .slice(0, 3),
    paymentStatusCounts: {
      completed: countStatus("completed"),
      processing: countStatus("processing"),
      pendingApproval: countStatus("pending_approval"),
      rejected: countStatus("rejected"),
      failed: countStatus("failed"),
    },
    summary: {
      totalBalance: accounts.reduce((total, account) => total + account.balance, 0),
      pendingApprovals: payments.filter((payment) => payment.status === "pending_approval").length,
      totalPayments: payments.length,
      validationErrors: validations.filter((validation) => !validation.ibanValid || !validation.bicValid).length,
    },
  };
}