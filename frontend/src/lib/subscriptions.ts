import type { CadenceType, Subscription } from "@/lib/api";

const toLocalDate = (date: Date) => {
  const tz = date.getTimezoneOffset();
  const local = new Date(date.getTime() - tz * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

const toUtcMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (isoDate: string, days: number) => {
  const date = toUtcMidnight(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const addMonths = (isoDate: string, months: number) => {
  const date = toUtcMidnight(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return formatDate(date);
};

const addYears = (isoDate: string, years: number) => {
  const date = toUtcMidnight(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return formatDate(date);
};

export const nextOccurrenceFrom = (
  isoDate: string,
  cadenceType: CadenceType,
  interval?: number,
): string => {
  switch (cadenceType) {
    case "weekly":
      return addDays(isoDate, 7);
    case "monthly":
      return addMonths(isoDate, 1);
    case "yearly":
      return addYears(isoDate, 1);
    case "custom":
      if (!interval || interval <= 0) return "";
      return addDays(isoDate, interval);
    default:
      return "";
  }
};

export const todayLocalISO = () => toLocalDate(new Date());

export const computeMissedOccurrences = (sub: Subscription, untilDate?: string): string[] => {
  if (!sub.startDate) return [];
  const limit = untilDate ? untilDate : todayLocalISO();
  const maxCheck = sub.endDate && sub.endDate < limit ? sub.endDate : limit;

  const out: string[] = [];
  if (!sub.lastLoggedDate) {
    if (sub.startDate <= maxCheck) out.push(sub.startDate);
    let cursor = sub.startDate;
    let guard = 0;
    while (guard < 512) {
      const next = nextOccurrenceFrom(cursor, sub.cadenceType, sub.cadenceIntervalDays);
      if (!next || next > maxCheck) break;
      out.push(next);
      cursor = next;
      guard += 1;
    }
    return out;
  }

  let cursor = sub.lastLoggedDate;
  let guard = 0;
  while (guard < 512) {
    const next = nextOccurrenceFrom(cursor, sub.cadenceType, sub.cadenceIntervalDays);
    if (!next) break;
    if (sub.endDate && next > sub.endDate) break;
    if (next > limit) break;
    out.push(next);
    cursor = next;
    guard += 1;
  }
  return out;
};

export const getNextDueDate = (sub: Subscription): string | null => {
  if (!sub.startDate) return null;
  if (!sub.lastLoggedDate) return sub.startDate;
  const next = nextOccurrenceFrom(sub.lastLoggedDate, sub.cadenceType, sub.cadenceIntervalDays);
  return next || null;
};
