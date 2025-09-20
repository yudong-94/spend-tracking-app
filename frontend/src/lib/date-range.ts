export type QuickRangeKey = "all" | "this-month" | "last-30" | "ytd";

export type QuickRangeOption = {
  key: QuickRangeKey;
  label: string;
};

export const QUICK_RANGE_OPTIONS: QuickRangeOption[] = [
  { key: "all", label: "All time" },
  { key: "this-month", label: "This month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "ytd", label: "Year to date" },
];

export function computeQuickRange(key: QuickRangeKey): { start: string; end: string } {
  const today = new Date();
  const end = toDateInputValue(today);

  if (key === "all") {
    return { start: "", end: "" };
  }

  if (key === "this-month") {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: toDateInputValue(startDate), end };
  }

  if (key === "last-30") {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    return { start: toDateInputValue(startDate), end };
  }

  if (key === "ytd") {
    const startDate = new Date(today.getFullYear(), 0, 1);
    return { start: toDateInputValue(startDate), end };
  }

  return { start: "", end: "" };
}

export function isQuickRangeKey(value: string | null | undefined): value is QuickRangeKey {
  return value === "all" || value === "this-month" || value === "last-30" || value === "ytd";
}

function toDateInputValue(date: Date): string {
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const local = new Date(date.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 10);
}
