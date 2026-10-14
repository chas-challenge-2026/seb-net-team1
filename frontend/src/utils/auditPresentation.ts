import type { AuditEntry } from "../types/AuditLog";

type ActionPresentation = {
  label: string;
  tone: "created" | "approved" | "step" | "rejected" | "neutral";
};

export function getActionPresentation(action: string): ActionPresentation {
  switch (action) {
    case "CREATE_RECIPIENT":
      return { label: "Lade till en mottagare", tone: "created" };
    case "CREATE_PAYMENT":
      return { label: "Skapade en betalning", tone: "created" };
    case "APPROVE_PAYMENT":
      return { label: "Godkände en betalning", tone: "approved" };
    case "APPROVE_PAYMENT_STEP":
      return { label: "Godkände ett atteststeg", tone: "step" };
    case "REJECT_PAYMENT":
      return { label: "Avvisade en betalning", tone: "rejected" };
    default:
      return { label: "Annan händelse", tone: "neutral" };
  }
}

const dateTimeFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Europe/Stockholm",
});

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

export function formatEntity(entry: AuditEntry): string {
  return [
    entry.entityType?.trim(),
    entry.entityId != null ? `#${entry.entityId}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
