import { normalizeRecipientIban } from "../api/recipientsApi";
import type { PaymentDetails } from "../types/Payment";
import type { Recipient } from "../types/Recipient";

export type PaymentRecipientOption = {
  value: number | string;
  iban: string;
  label: string;
};

export function getApprovedRecipientIban(payment: PaymentDetails): string | null {
  const steps = payment.approvalTimeline;
  if (payment.status !== "completed" || !Array.isArray(steps) || steps.length === 0 ||
      !steps.every((step) => step?.status === "approved")) {
    return null;
  }

  // Completion can be automatic; legacy assignments alone do not prove approval.
  const hasRecordedApproval = steps.some((step) =>
    step.decisionSource === "manual" &&
    typeof step.decidedAt === "string" && Number.isFinite(Date.parse(step.decidedAt))
  );
  if (!hasRecordedApproval || typeof payment.toIban !== "string") return null;

  return normalizeRecipientIban(payment.toIban) || null;
}

export function getPaymentRecipientOptions(
  savedRecipients: Recipient[],
  historicalIbans: string[]
): PaymentRecipientOption[] {
  const options = new Map<string, PaymentRecipientOption>();
  for (const recipient of savedRecipients) {
    const iban = normalizeRecipientIban(recipient.iban);
    if (iban && !options.has(iban)) {
      options.set(iban, { value: recipient.id, iban, label: `${recipient.name} – ${iban}` });
    }
  }
  for (const historicalIban of historicalIbans) {
    const iban = normalizeRecipientIban(historicalIban);
    if (iban && !options.has(iban)) {
      options.set(iban, { value: `history:${iban}`, iban, label: `Tidigare godkänd betalning – ${iban}` });
    }
  }
  return [...options.values()];
}
