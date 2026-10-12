export const PAYMENT_AMOUNT_ERROR =
  "Ange ett giltigt belopp större än 0 med högst två decimaler.";

function getMinorUnits(value: string): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > 2) return null;

  return BigInt(match[1] || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function parsePaymentAmount(value: string): number | null {
  const minorUnits = getMinorUnits(value.trim());
  if (minorUnits === null || minorUnits <= 0n ||
      minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const amount = Number(minorUnits) / 100;

  // JSON must preserve the same cent value, not just a rounded display value.
  if (!Number.isFinite(amount) || getMinorUnits(String(amount)) !== minorUnits) {
    return null;
  }

  return amount;
}
