export const SUBSCRIPTIONS_SHEET =
  process.env.GOOGLE_SHEETS_SUBSCRIPTIONS_TAB || "Subscriptions";

export type CadenceType = "weekly" | "monthly" | "yearly" | "custom";

export type SubscriptionRecord = {
  id: string;
  name: string;
  amount: number;
  cadenceType: CadenceType;
  cadenceIntervalDays?: number;
  categoryId: string;
  startDate: string;
  lastLoggedDate?: string;
  endDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

const CADENCE_TYPES: CadenceType[] = ["weekly", "monthly", "yearly", "custom"];

const stripToNumber = (value: unknown) =>
  typeof value === "number"
    ? value
    : value
    ? Number(String(value).replace(/[^0-9.-]/g, "")) || 0
    : 0;

const toIsoDate = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "number") {
    const millis = Math.round((value - 25569) * 86400 * 1000);
    return new Date(millis).toISOString().slice(0, 10);
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
};

export const normalizeSubscription = (raw: Record<string, unknown>): SubscriptionRecord => {
  const get = (k: string) =>
    raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()] ?? raw[k.replace(/\s+/g, "")];

  const cadenceTypeRaw = String(get("Cadence Type") ?? "").trim().toLowerCase();
  const cadenceType = CADENCE_TYPES.includes(cadenceTypeRaw as CadenceType)
    ? (cadenceTypeRaw as CadenceType)
    : "monthly";

  const cadenceInterval = stripToNumber(get("Cadence Interval (Days)"));

  const obj: SubscriptionRecord = {
    id: String(get("ID") ?? "").trim(),
    name: String(get("Name") ?? "").trim(),
    amount: stripToNumber(get("Amount")),
    cadenceType,
    cadenceIntervalDays: cadenceType === "custom" && cadenceInterval > 0 ? cadenceInterval : undefined,
    categoryId: String(get("Category ID") ?? "").trim(),
    startDate: toIsoDate(get("Start Date")),
    lastLoggedDate: toIsoDate(get("Last Logged Date")) || undefined,
    endDate: toIsoDate(get("End Date")) || undefined,
    notes: String(get("Notes") ?? "").trim() || undefined,
    createdAt: String(get("Created At") ?? "") || undefined,
    updatedAt: String(get("Updated At") ?? "") || undefined,
  };

  return obj;
};

export type SubscriptionCreateInput = {
  id: string;
  name: string;
  amount: number;
  cadenceType: CadenceType;
  cadenceIntervalDays?: number;
  categoryId: string;
  startDate: string;
  lastLoggedDate: string;
  endDate?: string;
  notes?: string;
};

const toUtcMidnight = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (dateStr: string, days: number) => {
  const date = toUtcMidnight(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const addMonths = (dateStr: string, months: number) => {
  const date = toUtcMidnight(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDayOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDayOfMonth));
  return formatDate(date);
};

const addYears = (dateStr: string, years: number) => {
  const date = toUtcMidnight(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  const lastDayOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDayOfMonth));
  return formatDate(date);
};

export const nextOccurrence = (dateStr: string, cadenceType: CadenceType, interval?: number) => {
  switch (cadenceType) {
    case "weekly":
      return addDays(dateStr, 7);
    case "monthly":
      return addMonths(dateStr, 1);
    case "yearly":
      return addYears(dateStr, 1);
    case "custom":
      if (!interval || interval <= 0) return "";
      return addDays(dateStr, interval);
    default:
      return "";
  }
};

export const isOccurrenceOnSchedule = (
  sub: SubscriptionRecord,
  targetDate: string,
): { ok: boolean; reason?: string } => {
  if (!sub.startDate) return { ok: false, reason: "missing_start_date" };
  if (!targetDate) return { ok: false, reason: "missing_target" };
  if (sub.endDate && targetDate > sub.endDate) return { ok: false, reason: "after_end_date" };
  if (targetDate < sub.startDate) return { ok: false, reason: "before_start" };

  if (!sub.lastLoggedDate) {
    if (targetDate === sub.startDate) return { ok: true };
    let attempts = 0;
    let cursor = sub.startDate;
    while (attempts < 512) {
      const next = nextOccurrence(cursor, sub.cadenceType, sub.cadenceIntervalDays);
      if (!next) return { ok: false, reason: "invalid_cadence" };
      if (next === targetDate) return { ok: true };
      if (next > targetDate) return { ok: false, reason: "off_schedule" };
      cursor = next;
      attempts += 1;
    }
    return { ok: false, reason: "too_far_future" };
  }

  const anchor = sub.lastLoggedDate || sub.startDate;
  if (!anchor) return { ok: false, reason: "missing_anchor" };
  if (targetDate <= anchor) return { ok: false, reason: "not_after_last" };

  let attempts = 0;
  let cursor = anchor;
  while (attempts < 512) {
    const next = nextOccurrence(cursor, sub.cadenceType, sub.cadenceIntervalDays);
    if (!next) return { ok: false, reason: "invalid_cadence" };
    if (next === targetDate) return { ok: true };
    if (next > targetDate) return { ok: false, reason: "off_schedule" };
    cursor = next;
    attempts += 1;
  }

  return { ok: false, reason: "too_far_future" };
};
