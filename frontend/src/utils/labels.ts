import type {
  ApprovalStepStatus,
  AuditAction,
  NotificationType,
  PaymentSource,
  PaymentStatus,
  Role,
  TransactionType,
} from '../api/types';

/** Visual tone shared by badges, alerts and icons. */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending_approval: 'Väntar på attest',
  completed: 'Genomförd',
  rejected: 'Avvisad',
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  pending_approval: 'warning',
  completed: 'success',
  rejected: 'danger',
};

export const APPROVAL_STEP_STATUS_LABELS: Record<ApprovalStepStatus, string> = {
  pending: 'Väntar',
  approved: 'Godkänd',
  rejected: 'Avvisad',
};

export const APPROVAL_STEP_STATUS_TONES: Record<ApprovalStepStatus, Tone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  manual: 'Manuell',
  batch: 'Batchfil',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  payment: 'Betalning',
  deposit: 'Insättning',
};

export const ROLE_LABELS: Record<Role, string> = {
  initiator: 'Initierare',
  attestant: 'Attestant',
  admin: 'Administratör',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  initiator: 'Skapar betalningar och batchuppladdningar.',
  attestant: 'Attesterar betalningar som kräver godkännande.',
  admin: 'Full behörighet, inklusive användarhantering och verifiering av granskningsloggen.',
};

export const ROLES = ['initiator', 'attestant', 'admin'] as const satisfies readonly Role[];

export const AUDIT_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'CREATE_PAYMENT',
  'APPROVE_PAYMENT_STEP',
  'APPROVE_PAYMENT',
  'REJECT_PAYMENT',
  'BATCH_UPLOAD',
  'USER_CREATED',
  'USER_UPDATED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
] as const satisfies readonly AuditAction[];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  LOGIN: 'Inloggning',
  LOGOUT: 'Utloggning',
  CREATE_PAYMENT: 'Betalning skapad',
  APPROVE_PAYMENT_STEP: 'Attest godkänd',
  APPROVE_PAYMENT: 'Betalning slutattesterad',
  REJECT_PAYMENT: 'Betalning avvisad',
  BATCH_UPLOAD: 'Batchuppladdning',
  USER_CREATED: 'Användare skapad',
  USER_UPDATED: 'Användare ändrad',
  PASSWORD_CHANGED: 'Lösenord ändrat',
  PASSWORD_RESET: 'Lösenord återställt',
};

export const AUDIT_ACTION_TONES: Record<AuditAction, Tone> = {
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  CREATE_PAYMENT: 'info',
  APPROVE_PAYMENT_STEP: 'success',
  APPROVE_PAYMENT: 'success',
  REJECT_PAYMENT: 'danger',
  BATCH_UPLOAD: 'info',
  USER_CREATED: 'brand',
  USER_UPDATED: 'brand',
  PASSWORD_CHANGED: 'warning',
  PASSWORD_RESET: 'warning',
};

/** Falls back to the raw action for values the contract does not list yet. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

export function auditActionTone(action: string): Tone {
  return AUDIT_ACTION_TONES[action as AuditAction] ?? 'neutral';
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  payment: 'Betalning',
  user: 'Användare',
  batch: 'Batch',
  account: 'Konto',
  approval_step: 'Attest',
};

export function entityTypeLabel(entityType: string): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export const NOTIFICATION_TONES: Record<NotificationType, Tone> = {
  approval_requested: 'warning',
  payment_completed: 'success',
  payment_rejected: 'danger',
};
