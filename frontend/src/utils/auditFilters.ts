import type { AuditLogFilters } from "../types/AuditLog";

export type AuditFilterValues = {
  search: string;
  action: string;
  userId: string;
  dateRange: "all" | "today" | "7days" | "30days" | "custom";
  fromDate: string;
  toDate: string;
};

export const DEFAULT_AUDIT_FILTERS: AuditFilterValues = {
  search: "",
  action: "",
  userId: "",
  dateRange: "all",
  fromDate: "",
  toDate: "",
};

type CalendarDate = { year: number; month: number; day: number };

// Match the calendar used to display audit timestamps, regardless of the
// computer's local time zone. Stockholm days can contain 23, 24 or 25 hours.
const stockholmFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function stockholmParts(date: Date) {
  return Object.fromEntries(stockholmFormatter.formatToParts(date)
    .filter(({ type }) => type !== "literal")
    .map(({ type, value }) => [type, Number(value)]));
}

function calendarTimestamp({ year, month, day }: CalendarDate): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function shiftDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(calendarTimestamp(date));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function parseCalendarDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Ange ett giltigt datum.");

  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const normalized = shiftDays(date, 0);
  if (date.year < 1 || normalized.year !== date.year ||
    normalized.month !== date.month || normalized.day !== date.day) {
    throw new Error("Ange ett giltigt datum.");
  }
  return date;
}

function stockholmMidnight(date: CalendarDate): string {
  const target = calendarTimestamp(date);
  let timestamp = target;

  // Resolve a wall-clock midnight to UTC using the offset at that instant.
  // Re-evaluate after moving the candidate across a daylight saving boundary.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = stockholmParts(new Date(timestamp));
    const wallClock = calendarTimestamp({
      year: parts.year,
      month: parts.month,
      day: parts.day,
    }) + ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000;
    const correction = target - wallClock;
    if (correction === 0) break;
    timestamp += correction;
  }

  return new Date(timestamp).toISOString();
}

export function buildAuditLogFilters(
  values: AuditFilterValues,
  now = new Date(),
): AuditLogFilters {
  const filters: AuditLogFilters = {};
  const search = values.search.trim();
  const action = values.action.trim();
  const userId = values.userId.trim();
  if (search) filters.search = search;
  if (action) filters.action = action;
  if (userId) {
    const parsedUserId = Number(userId);
    if (!Number.isSafeInteger(parsedUserId) || parsedUserId < 0) {
      throw new Error("Välj en giltig användare.");
    }
    filters.userId = parsedUserId;
  }

  if (values.dateRange === "all") return filters;

  let fromDate: CalendarDate | undefined;
  let toDate: CalendarDate | undefined;

  if (values.dateRange === "custom") {
    fromDate = values.fromDate ? parseCalendarDate(values.fromDate) : undefined;
    toDate = values.toDate ? parseCalendarDate(values.toDate) : undefined;
    if (fromDate && toDate &&
      calendarTimestamp(fromDate) > calendarTimestamp(toDate)) {
      throw new Error("Fråndatum får inte vara efter tilldatum.");
    }
  } else {
    const { year, month, day } = stockholmParts(now);
    toDate = { year, month, day };
    const days = values.dateRange === "7days" ? 7
      : values.dateRange === "30days" ? 30 : 1;
    fromDate = shiftDays(toDate, 1 - days);
  }

  if (fromDate) filters.from = stockholmMidnight(fromDate);
  if (toDate) filters.to = stockholmMidnight(shiftDays(toDate, 1));
  return filters;
}
