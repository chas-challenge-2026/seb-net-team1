import type { ReportPeriod } from "../types/Report";

const swedishDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getDefaultReportPeriod(now: Date = new Date()): ReportPeriod {
  const parts = swedishDateFormatter.formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === name)!.value;
  const month = `${part("year")}-${part("month")}`;
  return { from: `${month}-01`, to: `${month}-${part("day")}` };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function getReportPeriodError(from: string, to: string): string | null {
  if (!from || !to) return "Välj både Från-datum och Till-datum.";
  if (!isCalendarDate(from) || !isCalendarDate(to) || to === "9999-12-31") {
    return "Välj giltiga datum för perioden.";
  }
  return from > to ? "Från-datum får inte vara efter Till-datum." : null;
}
