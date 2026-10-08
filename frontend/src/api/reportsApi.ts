import type { PaymentReport, ReportPayment, ReportPeriod } from "../types/Report";
import { apiRequest } from "./apiClient";

export class ReportApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(
      status === 400
        ? "Välj en giltig period. Från-datum får inte vara efter Till-datum."
        : status === 401
          ? "Du behöver logga in för att se rapporten."
          : status === 403
            ? "Du saknar behörighet att se rapporten."
            : status === 0
              ? "Kunde inte läsa rapporten. Försök igen."
              : "Kunde inte hämta rapporten. Försök igen.",
    );
    this.name = "ReportApiError";
    this.status = status;
  }
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() > 0 &&
    date.toISOString().slice(0, 19) === value.slice(0, 19);
}

function isPayment(value: unknown): value is ReportPayment {
  if (!value || typeof value !== "object") return false;
  const payment = value as Record<string, unknown>;
  return (
    typeof payment.id === "number" && Number.isSafeInteger(payment.id) && payment.id > 0 &&
    typeof payment.reference === "string" &&
    typeof payment.toIban === "string" && payment.toIban.length > 0 &&
    (payment.fromAccountName === null || typeof payment.fromAccountName === "string") &&
    typeof payment.amount === "string" && /^\d+\.\d{2}$/.test(payment.amount) &&
    Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0 &&
    typeof payment.currency === "string" && /^[A-Z]{3}$/.test(payment.currency) &&
    typeof payment.status === "string" && payment.status.length > 0 &&
    isUtcTimestamp(payment.createdAt)
  );
}

export async function getPaymentReport({ from, to, signal }: ReportPeriod & {
  signal?: AbortSignal;
}): Promise<PaymentReport> {
  const query = new URLSearchParams({ from, to });
  const response = await apiRequest(`/api/reports/payments?${query.toString()}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new ReportApiError(response.status);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new ReportApiError(0);
  }
  if (!data || typeof data !== "object") throw new ReportApiError(0);
  const report = data as Record<string, unknown>;
  if (report.from !== from || report.to !== to || report.timeZone !== "Europe/Stockholm" ||
      !Array.isArray(report.payments) || !report.payments.every(isPayment)) {
    throw new ReportApiError(0);
  }
  return report as PaymentReport;
}
