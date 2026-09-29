/**
 * DTOs for the SEB Företagsbetalningar API. Field names match the API contract exactly.
 *
 * Conventions:
 * - Money is always a decimal string with two decimals ("12500.00"), never a JS number.
 * - Timestamps are ISO 8601 strings in UTC ("2026-09-29T15:01:51.035939Z").
 * - Date-only query parameters use YYYY-MM-DD.
 */

/** Decimal string with two decimals, e.g. "12500.00". */
export type Money = string;
/** ISO 8601 timestamp in UTC. */
export type IsoDateTime = string;
/** Date-only string, YYYY-MM-DD. */
export type IsoDate = string;

export type Role = 'initiator' | 'attestant' | 'admin';
export type PaymentStatus = 'pending_approval' | 'completed' | 'rejected';
export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected';
export type PaymentSource = 'manual' | 'batch';
export type TransactionType = 'payment' | 'deposit';
export type ApprovalAction = 'approve' | 'reject';
export type NotificationType = 'approval_requested' | 'payment_completed' | 'payment_rejected';
export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE_PAYMENT'
  | 'APPROVE_PAYMENT_STEP'
  | 'APPROVE_PAYMENT'
  | 'REJECT_PAYMENT'
  | 'BATCH_UPLOAD'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET';

/** Paged list, `page` is 1-based. */
export interface Paged<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** RFC 7807 error body. Unknown members are extensions (e.g. `validation` on batch errors). */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  [extension: string]: unknown;
}

// ---------------------------------------------------------------- Auth

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  tenantId: number;
  tenantName: string;
}

export interface AuthResponse {
  accessToken: string;
  expiresAt: IsoDateTime;
  user: CurrentUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------- Config

export interface AppConfig {
  approvalThreshold: Money;
  doubleApprovalThreshold: Money;
  currency: string;
  maxBatchFileSizeBytes: number;
  maxBatchRows: number;
}

// ---------------------------------------------------------------- Accounts

export interface Account {
  id: number;
  accountName: string;
  iban: string;
  balance: Money;
  availableBalance: Money;
  reservedAmount: Money;
  currency: string;
  pendingPaymentCount: number;
}

export interface Transaction {
  id: number;
  date: IsoDateTime;
  /** Negative for outgoing money. */
  amount: Money;
  description: string;
  transactionType: TransactionType;
  paymentId: number | null;
}

// ---------------------------------------------------------------- Dashboard

export interface PaymentSummary {
  id: number;
  toIban: string;
  amount: Money;
  currency: string;
  reference: string;
  status: PaymentStatus;
  createdAt: IsoDateTime;
}

export interface DashboardUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  tenantId: number;
}

export interface DashboardStats {
  totalBalance: Money;
  /** Balance minus money reserved by pending payments. */
  availableBalance: Money;
  /** Pending payments in the whole tenant. */
  pendingApprovalCount: number;
  /** Approval steps waiting on the current user. */
  myPendingApprovalCount: number;
  paymentsThisMonthCount: number;
  completedThisMonthCount: number;
  completedThisMonthAmount: Money;
  rejectedThisMonthCount: number;
}

export interface Dashboard {
  tenantName: string;
  user: DashboardUser;
  accounts: Account[];
  /** The 20 newest payments in the tenant. */
  recentPayments: PaymentSummary[];
  /** Payments waiting on the current user (attestant/admin). Empty for initiators. */
  pendingApprovals: PaymentSummary[];
  stats: DashboardStats;
}

// ---------------------------------------------------------------- Payments

export interface ApprovalProgress {
  approved: number;
  required: number;
}

export interface PaymentListItem {
  id: number;
  fromAccountId: number;
  fromAccountName: string;
  toIban: string;
  amount: Money;
  currency: string;
  reference: string;
  status: PaymentStatus;
  createdAt: IsoDateTime;
  executedAt: IsoDateTime | null;
  createdById: number;
  createdByName: string;
  source: PaymentSource;
  /** Null when the payment never needed attest. */
  approvalProgress: ApprovalProgress | null;
}

export interface ApprovalStep {
  id: number;
  stepNumber: number;
  attestantId: number | null;
  attestantName: string | null;
  status: ApprovalStepStatus;
  decidedAt: IsoDateTime | null;
  comment: string | null;
}

export interface AuditEntry {
  id: number;
  action: AuditAction;
  entityType: string;
  entityId: number | null;
  description: string;
  createdAt: IsoDateTime;
  userName: string | null;
}

export interface PaymentDetail extends PaymentListItem {
  fromAccountIban: string;
  requiresApproval: boolean;
  requiresDoubleApproval: boolean;
  approvalSteps: ApprovalStep[];
  /** The step the current user may decide right now, otherwise null. */
  myApprovalStepId: number | null;
  /** Audit trail for this payment, oldest first. */
  events: AuditEntry[];
}

export interface CreatePaymentRequest {
  fromAccountId: number;
  toIban: string;
  amount: Money;
  reference?: string;
}

export interface PaymentResponse {
  id: number;
  status: PaymentStatus;
  fromAccountId: number;
  toIban: string;
  amount: Money;
  currency: string;
  reference: string;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------- Batch

export interface BatchRow {
  /** Line number in the file (the header is line 1). */
  rowNumber: number;
  fromAccountId: number | null;
  fromAccountName: string | null;
  toIban: string | null;
  amount: Money | null;
  reference: string | null;
  requiresApproval: boolean;
  errors: string[];
}

export interface BatchValidation {
  fileName: string;
  parser: string;
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  totalAmount: Money;
  directPaymentCount: number;
  approvalRequiredCount: number;
  /** Structural problems: bad header, broken quoting, file too big... */
  fileErrors: string[];
  rows: BatchRow[];
}

export interface BatchResult {
  createdCount: number;
  completedCount: number;
  pendingApprovalCount: number;
  totalAmount: Money;
  payments: PaymentResponse[];
}

// ---------------------------------------------------------------- Approvals

export interface PendingApproval {
  paymentId: number;
  approvalStepId: number;
  toIban: string;
  amount: Money;
  currency: string;
  reference: string;
  createdAt: IsoDateTime;
  createdByName: string;
  fromAccountName: string;
  currentStep: number;
  totalSteps: number;
  requiresDoubleApproval: boolean;
}

export interface HandledApproval {
  paymentId: number;
  approvalStepId: number;
  stepNumber: number;
  amount: Money;
  currency: string;
  reference: string;
  toIban: string;
  status: ApprovalStepStatus;
  decidedAt: IsoDateTime | null;
  comment: string | null;
}

export interface ApprovalInbox {
  pending: PendingApproval[];
  recentlyHandled: HandledApproval[];
}

export interface ApprovalDecisionRequest {
  action: ApprovalAction;
  comment?: string;
}

export interface ApprovalDecisionResponse {
  paymentId: number;
  approvalStepId: number;
  stepStatus: ApprovalStepStatus;
  paymentStatus: PaymentStatus;
}

// ---------------------------------------------------------------- Audit log

export interface AuditLogPage {
  entries: AuditEntry[];
  /** Pass as `cursor` to get older entries. Null when there are no more. */
  nextCursor: string | null;
}

export interface AuditVerification {
  valid: boolean;
  checkedCount: number;
  firstInvalidEntryId: number | null;
  verifiedAt: IsoDateTime;
}

// ---------------------------------------------------------------- Notifications

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  paymentId: number | null;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
}

export interface NotificationList {
  items: AppNotification[];
  unreadCount: number;
}

// ---------------------------------------------------------------- Users (admin)

export interface UserAdmin {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: IsoDateTime;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  role: Role;
  password: string;
}

export interface UpdateUserRequest {
  name: string;
  role: Role;
  isActive: boolean;
}

export interface ResetPasswordRequest {
  newPassword: string;
}

// ---------------------------------------------------------------- Reports

export interface MonthlyReport {
  /** YYYY-MM */
  month: string;
  completedCount: number;
  completedAmount: Money;
  pendingCount: number;
  pendingAmount: Money;
  rejectedCount: number;
  rejectedAmount: Money;
}

export interface StatusBreakdown {
  status: PaymentStatus;
  count: number;
  amount: Money;
}

export interface TopRecipient {
  toIban: string;
  count: number;
  amount: Money;
}

export interface ReportSummary {
  /** Oldest first, always one entry per requested month. */
  months: MonthlyReport[];
  byStatus: StatusBreakdown[];
  /** Top 5 by amount. */
  topRecipients: TopRecipient[];
}

// ---------------------------------------------------------------- Validation

/** 0 ok, 1 wrong length, 2 unknown country, 3 invalid character, 4 wrong check digits. */
export type IbanErrorCode = 0 | 1 | 2 | 3 | 4;

export interface IbanValidation {
  valid: boolean;
  normalized: string;
  formatted: string;
  countryCode: string;
  errorCode: IbanErrorCode;
  message: string;
}
