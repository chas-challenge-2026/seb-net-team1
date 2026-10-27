import type { Money } from '../api/types';

/*
 * Money arrives from the API as decimal strings ("12500.00") and is sent back the same way.
 * Arithmetic (sums, comparisons against thresholds) is done in whole öre so no float
 * rounding can creep in; numbers are only used for display.
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, signed: boolean): Intl.NumberFormat {
  const key = `${currency}|${signed}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('sv-SE', {
        style: 'currency',
        currency,
        signDisplay: signed ? 'exceptZero' : 'auto',
      });
    } catch {
      formatter = new Intl.NumberFormat('sv-SE', {
        style: 'currency',
        currency: 'SEK',
        signDisplay: signed ? 'exceptZero' : 'auto',
      });
    }
    formatterCache.set(key, formatter);
  }
  return formatter;
}

const plainAmountFormatter = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONEY_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** Converts a decimal string to whole öre (hundredths). Invalid input counts as 0. */
export function moneyToCents(value: Money | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const match = MONEY_PATTERN.exec(value.trim());
  if (!match) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
  const [, sign, integer, fraction = ''] = match;
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** Converts whole öre back to the API's decimal string format ("1234.50"). */
export function centsToMoney(cents: number): Money {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(cents));
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function sumMoney(values: Array<Money | null | undefined>): Money {
  return centsToMoney(values.reduce((total, value) => total + moneyToCents(value), 0));
}

export function subtractMoney(a: Money, b: Money): Money {
  return centsToMoney(moneyToCents(a) - moneyToCents(b));
}

export function isValidMoney(value: string | null | undefined): value is Money {
  return typeof value === 'string' && MONEY_PATTERN.test(value.trim());
}

/** "1 234 567,50 kr". `signed` adds an explicit + for positive amounts. */
export function formatMoney(
  value: Money | number | null | undefined,
  currency = 'SEK',
  options: { signed?: boolean } = {},
): string {
  const amount = typeof value === 'number' ? value : moneyToCents(value) / 100;
  return currencyFormatter(currency || 'SEK', options.signed ?? false).format(amount);
}

/** "12 500,00", used to tidy up an amount input once it loses focus. */
export function formatAmountForInput(value: Money): string {
  return plainAmountFormatter.format(moneyToCents(value) / 100);
}

/** Short axis labels in Swedish financial style: "900 kr", "125 tkr", "1,3 mnkr". */
export function formatCompactMoney(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) {
    return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(value / 1_000_000)} mnkr`;
  }
  if (absolute >= 1_000) {
    return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(value / 1_000)} tkr`;
  }
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(value)} kr`;
}

export type AmountParseResult = { ok: true; value: Money } | { ok: false; error: string };

/**
 * Parses what a user typed into an amount field. Accepts Swedish formatting
 * ("1 234,50", "1234,5", "1234.50 kr") and returns the API format ("1234.50").
 */
export function parseAmountInput(input: string): AmountParseResult {
  const cleaned = input
    // \s also matches the no-break spaces Intl uses as thousands separators.
    .replace(/\s+/g, '')
    .replace(/(kr|sek)$/i, '')
    .replace(',', '.');

  if (!cleaned) return { ok: false, error: 'Ange ett belopp.' };
  if (cleaned.startsWith('-')) return { ok: false, error: 'Beloppet måste vara större än 0.' };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: 'Ange beloppet med siffror, till exempel 1 234,50.' };
  }

  const [integerPart, fractionPart = ''] = cleaned.split('.');
  if (fractionPart.length > 2) return { ok: false, error: 'Beloppet får ha högst två decimaler.' };

  const integer = integerPart.replace(/^0+(?=\d)/, '');
  if (integer.length > 12) return { ok: false, error: 'Beloppet är för stort.' };

  const value = `${integer}.${fractionPart.padEnd(2, '0')}`;
  if (moneyToCents(value) <= 0) return { ok: false, error: 'Beloppet måste vara större än 0.' };
  return { ok: true, value };
}
