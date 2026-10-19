import { getPaymentDetails, getRecentPayments } from "./paymentsApi";
import { getApprovedRecipientIban } from "../utils/paymentRecipients";

const RECENT_PAYMENT_LIMIT = 20;
const DETAIL_CONCURRENCY = 3;

export type HistoricalRecipientsResult = {
  ibans: string[];
  incomplete: boolean;
};

export async function getHistoricalRecipients(signal: AbortSignal): Promise<HistoricalRecipientsResult> {
  signal.throwIfAborted();
  const overview = await getRecentPayments(signal);
  signal.throwIfAborted();

  // The dashboard contract guarantees recent payments, not complete history.
  const seenIds = new Set<number>();
  const candidates = overview.recentPayments.slice(0, RECENT_PAYMENT_LIMIT).filter((payment) => {
    if (payment.status !== "completed" || seenIds.has(payment.id)) return false;
    seenIds.add(payment.id);
    return true;
  });
  const ibans: (string | null)[] = Array(candidates.length).fill(null);
  let nextIndex = 0;
  let incomplete = false;

  async function checkPayments() {
    while (nextIndex < candidates.length) {
      signal.throwIfAborted();
      const index = nextIndex++;
      try {
        const details = await getPaymentDetails(candidates[index].id, signal);
        signal.throwIfAborted();
        ibans[index] = getApprovedRecipientIban(details);
      } catch {
        signal.throwIfAborted();
        incomplete = true;
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(DETAIL_CONCURRENCY, candidates.length) },
    () => checkPayments()
  ));
  return { ibans: [...new Set(ibans.filter((iban): iban is string => iban !== null))], incomplete };
}
