import type { ApprovalStepStatus, PaymentStatus, Role } from '../../api/types';
import {
  APPROVAL_STEP_STATUS_LABELS,
  APPROVAL_STEP_STATUS_TONES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONES,
  ROLE_LABELS,
  auditActionLabel,
  auditActionTone,
  type Tone,
} from '../../utils/labels';
import { Badge } from './Badge';

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge tone={PAYMENT_STATUS_TONES[status] ?? 'neutral'} dot>
      {PAYMENT_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ApprovalStepBadge({ status }: { status: ApprovalStepStatus }) {
  return (
    <Badge tone={APPROVAL_STEP_STATUS_TONES[status] ?? 'neutral'} dot>
      {APPROVAL_STEP_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function AuditActionBadge({ action }: { action: string }) {
  return (
    <Badge tone={auditActionTone(action)} size="sm">
      {auditActionLabel(action)}
    </Badge>
  );
}

const ROLE_TONES: Record<Role, Tone> = {
  initiator: 'info',
  attestant: 'warning',
  admin: 'brand',
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge tone={ROLE_TONES[role] ?? 'neutral'} size="sm">
      {ROLE_LABELS[role] ?? role}
    </Badge>
  );
}
