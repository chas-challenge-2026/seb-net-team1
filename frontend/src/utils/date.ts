/*
 * All dates are shown in Swedish (sv-SE) in the viewer's local time zone.
 * The API sends ISO 8601 timestamps in UTC.
 */

const dateTimeFormatter = new Intl.DateTimeFormat('sv-SE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFormatter = new Intl.DateTimeFormat('sv-SE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const timeFormatter = new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' });
const monthShortFormatter = new Intl.DateTimeFormat('sv-SE', { month: 'short' });
const monthLongFormatter = new Intl.DateTimeFormat('sv-SE', { month: 'long', year: 'numeric' });

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const EMPTY = '–';

/** "29 sep. 2026 17:01" */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : EMPTY;
}

/** "29 sep. 2026" */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : EMPTY;
}

/** "tisdag 29 september 2026" */
export function formatLongDate(value: DateInput): string {
  const date = toDate(value);
  return date ? longDateFormatter.format(date) : EMPTY;
}

/** "17:01" */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : EMPTY;
}

function parseMonth(month: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

/** "2026-04" → "apr." */
export function formatMonthShort(month: string): string {
  const date = parseMonth(month);
  return date ? monthShortFormatter.format(date) : month;
}

/** "2026-04" → "april 2026" */
export function formatMonthLong(month: string): string {
  const date = parseMonth(month);
  return date ? monthLongFormatter.format(date) : month;
}

/** "2026-04" → "2026-04-01", the first day of that month. */
export function firstDayOfMonth(month: string): string | undefined {
  return parseMonth(month) ? `${month}-01` : undefined;
}

/** Local calendar date as YYYY-MM-DD (the format of date inputs and date query params). */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "nyss", "för 5 min sedan", "för 3 timmar sedan", "i går 14:02", "för 4 dagar sedan", "12 sep. 2026" */
export function formatRelativeTime(value: DateInput, now: number): string {
  const date = toDate(value);
  if (!date) return EMPTY;

  const seconds = Math.round((now - date.getTime()) / 1000);
  if (seconds < 45) return 'nyss';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `för ${minutes} min sedan`;

  const hours = Math.round(minutes / 60);
  const today = new Date(now);
  if (hours < 24 && isSameDay(date, today)) {
    return `för ${hours} ${hours === 1 ? 'timme' : 'timmar'} sedan`;
  }

  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (isSameDay(date, yesterday)) return `i går ${formatTime(date)}`;

  const days = Math.round(hours / 24);
  if (days < 7) return `för ${Math.max(days, 2)} dagar sedan`;
  return formatDate(date);
}

/** A greeting that fits the time of day. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 10) return 'God morgon';
  if (hour >= 10 && hour < 12) return 'God förmiddag';
  if (hour >= 12 && hour < 18) return 'God eftermiddag';
  if (hour >= 18 && hour < 23) return 'God kväll';
  return 'Hej';
}
