import type { IbanErrorCode } from '../api/types';

/**
 * Client-side IBAN check (ISO 13616: country length + MOD97) for instant feedback in
 * forms. The server stays authoritative and validates again on submit.
 */

/** IBAN length per country, from the SWIFT IBAN registry. */
const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27, BR: 29, BY: 28,
  CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18,
  FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22,
  IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28, NL: 18,
  NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31,
  SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23, TN: 24, TR: 26, UA: 29,
  VA: 22, VG: 24, XK: 20, YE: 30,
};

export const MAX_IBAN_LENGTH = 34;
export const IBAN_EXAMPLE = 'SE35 5000 0000 0549 1000 0003';

let regionNames: Intl.DisplayNames | null = null;

function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(['sv'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Removes spaces and dashes and upper-cases: "se35 5000…" → "SE355000…". */
export function normalizeIban(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

/** Groups in fours: "SE3550000000054910000003" → "SE35 5000 0000 0549 1000 0003". */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})(?=.)/g, '$1 ');
}

/** Last four characters only: "•••• 0003". */
export function maskIban(value: string): string {
  const normalized = normalizeIban(value);
  return normalized.length > 4 ? `•••• ${normalized.slice(-4)}` : normalized;
}

function passesMod97(normalized: string): boolean {
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const digits = char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder === 1;
}

export interface IbanCheck {
  valid: boolean;
  normalized: string;
  formatted: string;
  countryCode: string | null;
  /** Same codes as the API: 0 ok, 1 wrong length, 2 unknown country, 3 invalid character, 4 check digits. */
  errorCode: IbanErrorCode;
  message: string;
  /** Expected length for the country, when the country is known. */
  expectedLength: number | null;
}

export function validateIban(value: string): IbanCheck {
  const normalized = normalizeIban(value);
  const result = (
    errorCode: IbanErrorCode,
    message: string,
    countryCode: string | null = null,
    expectedLength: number | null = null,
  ): IbanCheck => ({
    valid: errorCode === 0,
    normalized,
    formatted: formatIban(normalized),
    countryCode,
    errorCode,
    message,
    expectedLength,
  });

  if (!normalized) return result(1, 'Ange mottagarens IBAN.');
  if (!/^[A-Z0-9]+$/.test(normalized)) return result(3, 'IBAN får bara innehålla bokstäver och siffror.');
  if (!/^[A-Z]{2}/.test(normalized)) {
    return result(3, 'Ett IBAN börjar med en landskod, till exempel SE för Sverige.');
  }

  const countryCode = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode] ?? null;
  if (expectedLength === null) return result(2, `Landskoden ${countryCode} är inte giltig för IBAN.`, countryCode);
  if (!/^[A-Z]{2}\d{2}/.test(normalized)) {
    return result(3, 'Efter landskoden kommer två kontrollsiffror, till exempel SE35.', countryCode, expectedLength);
  }
  if (normalized.length !== expectedLength) {
    return result(
      1,
      `Ett IBAN från ${countryName(countryCode)} har ${expectedLength} tecken, du har angett ${normalized.length}.`,
      countryCode,
      expectedLength,
    );
  }
  if (!passesMod97(normalized)) {
    return result(4, 'Kontrollsiffrorna stämmer inte. Kontrollera att IBAN är rätt inskrivet.', countryCode, expectedLength);
  }
  return result(0, `Giltigt IBAN (${countryName(countryCode)}).`, countryCode, expectedLength);
}
