import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTable, readBudgets } from "./_lib/sheets.js";

const AUTH = process.env.APP_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN;

function normalizeType(s: any) {
  return String(s || "").trim().toLowerCase();
}
function normalizeCat(s: any) {
  return String(s || "").trim();
}
function toMonthKey(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
function parseMonthKey(s: string) {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}
function addMonths(d: Date, delta: number) {
  const dt = new Date(d);
  dt.setMonth(dt.getMonth() + delta);
  return dt;
}
function lastCompleteMonthKey(today = new Date()) {
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = addMonths(firstOfThisMonth, -1);
  return toMonthKey(lastMonth);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function isSameMonth(d: Date, y: number, m: number) {
  return d.getFullYear() === y && d.getMonth() === m;
}
function median(nums: number[]) {
  const arr = [...nums].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}
function num(n: any) {
  const v = typeof n === "number" ? n : Number(String(n).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}

const SPECIALS = new Set(["rent", "travel", "tax return", "credit card fee"]);
const CORE5 = ["Food", "Grocery", "Clothes", "Utilities", "Daily Necessities"];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // auth (same model as other routes)
  const header = req.headers.authorization || "";
  if (AUTH) {
    const want = `Bearer ${AUTH}`;
    if (header !== want) return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // Load all transactions
    const txRows = await readTable(); // from Transactions tab (your existing helper)

    // Basic parse
    const tx = txRows.map((r) => {
      const dateStr = String(r["Date"] || "").trim();
      const d = new Date(dateStr);
      return {
        month: toMonthKey(d),
        year: d.getFullYear(),
        mm: d.getMonth(),
        day: d.getDate(),
        type: normalizeType(r["Type"]),
        category: normalizeCat(r["Category"]),
        amount: num(r["Amount"]),
        isExpense: normalizeType(r["Type"]) === "expense",
      };
    });

    // Determine target month
    const qsMonth = String(req.query.month || "").trim();
    const targetMonthKey = qsMonth || toMonthKey(new Date()); // current month (even if partial)
    const targetMonthDate = parseMonthKey(targetMonthKey);

    // Last complete month (for history window & last rent)
    const lastCompleteKey = lastCompleteMonthKey(new Date());
    const lastCompleteDate = parseMonthKey(lastCompleteKey);

    // Build 12 complete months window (prev 12 excluding current)
    const histMonthsKeys: string[] = [];
    for (let i = 12; i >= 1; i--) {
      histMonthsKeys.push(toMonthKey(addMonths(lastCompleteDate, -i + 1)));
    }

    // Group monthly totals
    const byMonthTotal = new Map<string, number>();
    const byMonthByCat = new Map<string, Map<string, number>>();

    for (const r of tx) {
      if (!r.isExpense) continue;
      const key = r.month;
      byMonthTotal.set(key, (byMonthTotal.get(key) || 0) + r.amount);

      const catKey = r.category;
      if (!byMonthByCat.has(key)) byMonthByCat.set(key, new Map());
      const map = byMonthByCat.get(key)!;
      map.set(catKey, (map.get(catKey) || 0) + r.amount);
    }

    // ex-specials for each hist month
    const exSpecialsValues: number[] = histMonthsKeys.map((mkey) => {
      const total = byMonthTotal.get(mkey) || 0;
      const map = byMonthByCat.get(mkey) || new Map();
      let specials = 0;
      for (const [cat, v] of map.entries()) {
        if (SPECIALS.has(cat.toLowerCase())) specials += v;
      }
      return total - specials;
    });

    const baseMedian = median(exSpecialsValues);

    // Rent last month; fallback to median of last 3 months if 0
    const lastMonthCats = byMonthByCat.get(lastCompleteKey) || new Map();
    let rentLM = 0;
    for (const [cat, v] of lastMonthCats.entries()) {
      if (cat.toLowerCase() === "rent") {
        rentLM += v;
      }
    }
    if (rentLM === 0) {
      const rentSeries: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const mk = toMonthKey(addMonths(lastCompleteDate, -i));
        const m = byMonthByCat.get(mk) || new Map();
        let v = 0;
        for (const [cat, val] of m.entries()) {
          if (cat.toLowerCase() === "rent") v += val;
        }
        rentSeries.push(v);
      }
      rentLM = median(rentSeries);
    }

    // Manual TOTAL override for target month
    const budgets = await readBudgets();
    const manualRow = budgets.find(
      (b) =>
        String(b["Category"] || "").trim().toLowerCase() === "total" &&
        String(b["Month (YYYY-MM)"] || "").trim() === targetMonthKey
    );
    const manualTotal = manualRow ? num(manualRow["Amount"]) : 0;
    const manualNote = manualRow ? String(manualRow["Notes"] || "") : "";

    const totalBudget = baseMedian + rentLM + manualTotal;

    // Category budgets for display
    const coreBudgets: Record<string, number> = {};
    for (const cat of CORE5) {
      const vals: number[] = [];
      for (const mk of histMonthsKeys) {
        const map = byMonthByCat.get(mk) || new Map();
        vals.push(map.get(cat) || 0);
      }
      coreBudgets[cat] = median(vals);
    }
    const travelBudget = 0; // travel covered via TOTAL override

    // Misc
    const miscBudgetRaw =
      totalBudget -
      rentLM -
      Object.values(coreBudgets).reduce((a, b) => a + b, 0) -
      travelBudget;
    const overAllocated = miscBudgetRaw < 0;
    const miscBudget = Math.max(0, miscBudgetRaw);

    // Actuals MTD (target month)
    const targetY = targetMonthDate.getFullYear();
    const targetM = targetMonthDate.getMonth();

    let totalActualMTD = 0;
    let rentActual = 0;
    const coreActual: Record<string, number> = {};
    CORE5.forEach((c) => (coreActual[c] = 0));
    let travelActual = 0;

    // Daily series (cumulative)
    const days = daysInMonth(targetMonthDate);
    const byDay = new Array(days).fill(0);

    for (const r of tx) {
      if (!r.isExpense) continue;
      if (!isSameMonth(new Date(`${r.month}-01`), targetY, targetM)) {
        // fast month compare on yyyy-mm-01
        const d2 = new Date(r.year, r.mm, r.day);
        if (!isSameMonth(d2, targetY, targetM)) continue;
      }
      totalActualMTD += r.amount;

      const lowCat = r.category.toLowerCase();
      if (lowCat === "rent") rentActual += r.amount;
      else if (lowCat === "travel") travelActual += r.amount;
      else if (CORE5.includes(r.category)) coreActual[r.category] += r.amount;

      const d = r.day;
      if (d >= 1 && d <= days) byDay[d - 1] += r.amount;
    }

    const series: Array<{ day: number; cumActual: number }> = [];
    let acc = 0;
    for (let i = 0; i < days; i++) {
      acc += byDay[i];
      series.push({ day: i + 1, cumActual: acc });
    }

    // misc actual = total - rent - core - travel
    const coreSumActual = Object.values(coreActual).reduce((a, b) => a + b, 0);
    const miscActual = Math.max(0, totalActualMTD - rentActual - coreSumActual - travelActual);

    const budgetRows = [
      { category: "Rent", budget: rentLM, actual: rentActual, source: "last-month" as const },
      ...CORE5.map((c) => ({
        category: c,
        budget: coreBudgets[c],
        actual: coreActual[c],
        source: "median-12" as const,
      })),
      { category: "Travel", budget: 0, actual: travelActual, source: "derived" as const },
      { category: "Miscellaneous", budget: miscBudget, actual: miscActual, source: "derived" as const },
    ].map((r) => ({ ...r, remaining: Math.max(0, r.budget - r.actual) }));

    res.json({
      month: targetMonthKey,
      totalBudget,
      totalActualMTD,
      totalRemaining: Math.max(0, totalBudget - totalActualMTD),
      manualTotal,
      manualNote,
      overAllocated,
      series,
      rows: budgetRows,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "failed to compute budget" });
  }
}