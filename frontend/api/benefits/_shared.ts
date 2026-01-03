export const BENEFITS_SHEET =
  process.env.GOOGLE_SHEETS_BENEFITS_TAB || "Benefits";

export type CadenceType = "weekly" | "monthly" | "quarterly" | "semi-annual" | "yearly" | "custom";

export type BenefitRecord = {
  id: string;
  name: string;
  amount: number;
  cadenceType: CadenceType;
  cadenceIntervalDays?: number;
  startDate: string;
  validPeriodStart: string;
  validPeriodEnd: string;
  used: boolean;
  creditCard?: string;
  createdAt?: string;
  updatedAt?: string;
};

const CADENCE_TYPES: CadenceType[] = ["weekly", "monthly", "quarterly", "semi-annual", "yearly", "custom"];

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

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "1" || lower === "yes" || lower === "x" || lower === "✓";
  }
  if (typeof value === "number") return value !== 0;
  return false;
};

export const normalizeBenefit = (raw: Record<string, unknown>): BenefitRecord => {
  const get = (k: string) =>
    raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()] ?? raw[k.replace(/\s+/g, "")];

  const cadenceTypeRaw = String(get("Cadence Type") ?? "").trim().toLowerCase();
  const cadenceType = CADENCE_TYPES.includes(cadenceTypeRaw as CadenceType)
    ? (cadenceTypeRaw as CadenceType)
    : "monthly";

  const cadenceInterval = stripToNumber(get("Cadence Interval (Days)"));

  const creditCardValue = String(get("Credit Card") ?? "").trim();
  const obj: BenefitRecord = {
    id: String(get("ID") ?? "").trim(),
    name: String(get("Name") ?? "").trim(),
    amount: stripToNumber(get("Amount")),
    cadenceType,
    cadenceIntervalDays: cadenceType === "custom" && cadenceInterval > 0 ? cadenceInterval : undefined,
    startDate: toIsoDate(get("Start Date")),
    validPeriodStart: toIsoDate(get("Valid Period Start")),
    validPeriodEnd: toIsoDate(get("Valid Period End")),
    used: parseBoolean(get("Used")),
    creditCard: creditCardValue || undefined,
    createdAt: String(get("Created At") ?? "") || undefined,
    updatedAt: String(get("Updated At") ?? "") || undefined,
  };

  return obj;
};

export type BenefitCreateInput = {
  id: string;
  name: string;
  amount: number;
  cadenceType: CadenceType;
  cadenceIntervalDays?: number;
  startDate: string;
  creditCard?: string;
};

