import type { RecentPaymentSummary } from "../types/Payment";

export type PaymentDateRange = "all" | "7" | "30" | "90";
export type PaymentAmountRange = "all" | "under10000" | "10000to50000" | "50000to100000" | "over100000";

export type PaymentListFilters = {
  status: string;
  dateRange: PaymentDateRange;
  amountRange: PaymentAmountRange;
};

export const DEFAULT_PAYMENT_FILTERS: PaymentListFilters = {
  status: "all",
  dateRange: "30",
  amountRange: "all",
};

export function matchesPaymentAmount(amount: string | null, range: PaymentAmountRange): boolean {
  if (range === "all") return true;
  const match = amount && /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return false;

  // Compare integer minor units without changing or rounding the transport value.
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  switch (range) {
    case "under10000": return cents < 1000000n;
    case "10000to50000": return cents >= 1000000n && cents < 5000000n;
    case "50000to100000": return cents >= 5000000n && cents <= 10000000n;
    case "over100000": return cents > 10000000n;
  }
}

export function filterRecentPayments(
  payments: RecentPaymentSummary[],
  filters: PaymentListFilters,
  now = new Date()
): RecentPaymentSummary[] {
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (filters.dateRange !== "all") firstDay.setDate(firstDay.getDate() - Number(filters.dateRange) + 1);

  return payments.filter((payment) => {
    if (filters.status !== "all" && payment.status !== filters.status) return false;
    if (filters.dateRange !== "all") {
      const createdAt = new Date(payment.createdAt).getTime();
      if (!Number.isFinite(createdAt) || createdAt < firstDay.getTime() || createdAt > now.getTime()) return false;
    }
    if (filters.amountRange !== "all" && payment.currency !== "SEK") return false;
    return matchesPaymentAmount(payment.amount, filters.amountRange);
  });
}
