import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import { readTable } from "./_lib/sheets.js";

type Period = { start?: string; end?: string };
type Totals = { income: number; expense: number; net: number };
type CategoryAggregate = {
  category: string;
  type: "income" | "expense";
  amountA: number;
  amountB: number;
  hasA: boolean;
  hasB: boolean;
};

type CategoryComparison = CategoryAggregate & {
  delta: number;
  pct: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

type ComparisonResponse = {
  periodA: Period & { totals: Totals };
  periodB: Period & { totals: Totals };
  categories: CategoryComparison[];
};

function monthRange(offset: number): Period {
  const today = new Date();
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const start = base.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  const d = new Date(t);
  const iso = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return iso.toISOString().slice(0, 10);
}

function toTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : undefined;
}

function inPeriod(ts: number, period: { startTs?: number; endTs?: number }): boolean {
  if (period.startTs != null && ts < period.startTs) return false;
  if (period.endTs != null && ts > period.endTs) return false;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!requireAuth(req, res)) return;
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { aStart, aEnd, bStart, bEnd } = req.query as {
      aStart?: string;
      aEnd?: string;
      bStart?: string;
      bEnd?: string;
    };

    const defaults = { newer: monthRange(0), previous: monthRange(-1) };
    const rawPeriodA: Period = {
      start: normalizeDate(aStart) ?? defaults.previous.start,
      end: normalizeDate(aEnd) ?? defaults.previous.end,
    };
    const rawPeriodB: Period = {
      start: normalizeDate(bStart) ?? defaults.newer.start,
      end: normalizeDate(bEnd) ?? defaults.newer.end,
    };

    const startATs = toTimestamp(rawPeriodA.start);
    const endATs = toTimestamp(rawPeriodA.end);
    const startBTs = toTimestamp(rawPeriodB.start);
    const endBTs = toTimestamp(rawPeriodB.end);

    const periodAMs = {
      startTs: startATs,
      endTs: endATs != null ? endATs + DAY_MS - 1 : undefined,
    };
    const periodBMs = {
      startTs: startBTs,
      endTs: endBTs != null ? endBTs + DAY_MS - 1 : undefined,
    };

    const rows = await readTable();

    const map = new Map<string, CategoryAggregate>();
    const totalsA = { income: 0, expense: 0 };
    const totalsB = { income: 0, expense: 0 };

    for (const row of rows) {
      const dateRaw = row["Date"] ?? row["date"];
      const ts = toTimestamp(typeof dateRaw === "string" ? dateRaw : String(dateRaw ?? ""));
      if (!ts && ts !== 0) continue;
      const typeRaw = row["Type"] ?? row["type"] ?? "";
      const type = String(typeRaw).toLowerCase() as "income" | "expense";
      if (type !== "income" && type !== "expense") continue;
      const catRaw = row["Category"] ?? row["category"] ?? "Uncategorized";
      const category = String(catRaw) || "Uncategorized";
      const amountRaw = row["Amount"] ?? row["amount"] ?? 0;
      const amount = Number(amountRaw) || 0;

      const entryKey = `${type}__${category}`;
      let entry = map.get(entryKey);
      if (!entry) {
        entry = { category, type, amountA: 0, amountB: 0, hasA: false, hasB: false };
        map.set(entryKey, entry);
      }

      if (inPeriod(ts, periodAMs)) {
        entry.amountA += amount;
        entry.hasA = true;
        totalsA[type] += amount;
      }
      if (inPeriod(ts, periodBMs)) {
        entry.amountB += amount;
        entry.hasB = true;
        totalsB[type] += amount;
      }
    }

    const categories: CategoryComparison[] = Array.from(map.values()).map((entry) => {
      const delta = entry.amountB - entry.amountA;
      const pct = entry.hasA && entry.hasB && entry.amountA !== 0 ? delta / entry.amountA : null;
      return { ...entry, delta, pct };
    });

    categories.sort((a, b) => {
      if (a.type === b.type) return Math.abs(b.delta) - Math.abs(a.delta);
      return a.type === "income" ? -1 : 1;
    });

    const totalsPeriodA: Totals = {
      income: totalsA.income,
      expense: totalsA.expense,
      net: totalsA.income - totalsA.expense,
    };
    const totalsPeriodB: Totals = {
      income: totalsB.income,
      expense: totalsB.expense,
      net: totalsB.income - totalsB.expense,
    };

    const payload: ComparisonResponse = {
      periodA: { ...rawPeriodA, totals: totalsPeriodA },
      periodB: { ...rawPeriodB, totals: totalsPeriodB },
      categories,
    };

    res.status(200).json(payload);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Server error";
    res.status(500).json({ error: message });
  }
}
