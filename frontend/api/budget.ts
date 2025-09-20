import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTable, getSheetsClient } from "./_lib/sheets.js";

const AUTH = process.env.APP_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN;
const BUDGETS_SHEET = process.env.GOOGLE_SHEETS_BUDGETS_TAB || "Budgets";

// -------------------- small helpers --------------------
const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();

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
function average(nums: number[]) {
  const arr = nums.filter((n) => Number.isFinite(n));
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}
function num(n: unknown) {
  const v = typeof n === "number" ? n : Number(String(n ?? "").replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}
function normalizeType(s: unknown) {
  return lower(s);
}
function normalizeCat(s: unknown) {
  return norm(s);
}

const SPECIALS = new Set(["rent", "travel", "tax return", "credit card fee"]);
const CORE5 = ["Food", "Grocery", "Clothes", "Utility", "Daily Necessities"] as const;

// -------------------- Budgets sheet I/O (header-agnostic) --------------------

async function appendBudgetOverride(monthKey: string, amount: number, notes: string) {
  const { sheets, spreadsheetId } = await getSheetsClient();

  const hdrRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${BUDGETS_SHEET}!1:1`,
  });
  const headers = (hdrRes.data.values?.[0] ?? []).map(String);
  const H = headers.map((h) => lower(h));

  const iMonth = H.findIndex((h) => h.startsWith("month"));
  const iAmount = H.findIndex((h) => h === "amount");
  const iNotes = H.findIndex((h) => h.startsWith("note"));

  const row = headers.map(() => "");
  if (iMonth >= 0) row[iMonth] = monthKey;
  if (iAmount >= 0) row[iAmount] = String(amount);
  if (iNotes >= 0) row[iNotes] = notes ?? "";

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${BUDGETS_SHEET}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

// -------------------- main handler (GET compute / POST override) --------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // auth
  const header = req.headers.authorization || "";
  if (AUTH) {
    const want = `Bearer ${AUTH}`;
    if (header !== want) return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "POST") {
    try {
      const now = new Date();
      const monthKey = toMonthKey(now);
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const amount = num((body as Record<string, unknown>)?.amount);
      const notes = norm((body as Record<string, unknown>)?.notes);
      await appendBudgetOverride(monthKey, amount, notes);
      return res.json({ ok: true, month: monthKey, amount, notes });
    } catch (error) {
      console.error("append override failed", error);
      const message = error instanceof Error ? error.message : "append failed";
      return res.status(500).json({ error: message });
    }
  }

  // GET – compute budgets
  try {
    // Load all transactions
    const txRows = await readTable();

    // Parse
    const tx = txRows.map((r) => {
      const d = new Date(norm(r["Date"]));
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

    // Target month (current by default)
    const qsMonth = norm(req.query.month as string | undefined);
    const targetMonthKey = qsMonth || toMonthKey(new Date());
    const targetMonthDate = parseMonthKey(targetMonthKey);

    // History window: 12 complete months (ending last complete month)
    const lastCompleteKey = lastCompleteMonthKey(new Date());
    const lastCompleteDate = parseMonthKey(lastCompleteKey);

    const histMonthsKeys: string[] = [];
    for (let i = 12; i >= 1; i--) {
      histMonthsKeys.push(toMonthKey(addMonths(lastCompleteDate, -i + 1)));
    }

    // Monthly totals & per-category totals (expenses only)
    const byMonthTotal = new Map<string, number>();
    const byMonthByCat = new Map<string, Map<string, number>>();

    for (const r of tx) {
      if (!r.isExpense) continue;
      const mkey = r.month;
      byMonthTotal.set(mkey, (byMonthTotal.get(mkey) || 0) + r.amount);

      if (!byMonthByCat.has(mkey)) byMonthByCat.set(mkey, new Map());
      const map = byMonthByCat.get(mkey)!;
      map.set(r.category, (map.get(r.category) || 0) + r.amount);
    }

    // Base avg = total minus specials (avg of last 12 complete months)
    const exSpecialsValues: number[] = histMonthsKeys.map((mkey) => {
      const total = byMonthTotal.get(mkey) || 0;
      const catMap = byMonthByCat.get(mkey) || new Map();
      let specials = 0;
      for (const [cat, v] of catMap.entries()) {
        if (SPECIALS.has(lower(cat))) specials += v;
      }
      return total - specials;
    });
    const baseAvg = average(exSpecialsValues);

    // Rent = last complete month (fallback to 3-month avg if missing)
    const lastMonthCats = byMonthByCat.get(lastCompleteKey) || new Map();
    let rentLM = 0;
    for (const [cat, v] of lastMonthCats.entries()) {
      if (lower(cat) === "rent") rentLM += v;
    }
    if (rentLM === 0) {
      const rent3: number[] = [];
      for (let i = 1; i <= 3; i++) {
        const mk = toMonthKey(addMonths(lastCompleteDate, -i));
        const m = byMonthByCat.get(mk) || new Map();
        let v = 0;
        for (const [cat, val] of m.entries()) {
          if (lower(cat) === "rent") v += val;
        }
        rent3.push(v);
      }
      rentLM = average(rent3);
    }

    // Manual TOTAL override from Budgets tab (sum up all the overrides of the current month)

    let manualTotal = 0;
    const manualItems: Array<{ amount: number; notes: string }> = [];
    let manualNote = ""; // keep for backward-compatible display

    try {
      const { sheets, spreadsheetId } = await getSheetsClient();
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${BUDGETS_SHEET}!A1:C`,
      });

      const vals = resp.data.values || [];
      if (vals.length) {
        const headers = vals[0].map((h) => String(h).trim().toLowerCase());
        const rows = vals.slice(1).map((r) => {
          const o: Record<string, string> = {};
          headers.forEach((h, i) => (o[h] = r[i] ?? ""));
          return o;
        });

        for (const r of rows) {
          const m = String(r["month"] || r["month (yyyy-mm)"] || r["month yyyy-mm"] || "").trim();

          if (m === targetMonthKey) {
            const amt = Number(String(r["amount"] ?? "").replace(/,/g, ""));
            if (Number.isFinite(amt) && amt !== 0) {
              manualTotal += amt;
              manualItems.push({
                amount: amt,
                notes: String(r["notes"] || r["note"] || ""),
              });
            }
          }
        }

        // Back-compat: collapse notes to a single line if you still show it near the top
        manualNote = manualItems
          .map((i) => i.notes)
          .filter(Boolean)
          .join("; ");
      }
    } catch (error) {
      console.error("read Budgets tab failed", error);
    }

    // Final TOTAL budget
    const totalBudget = baseAvg + rentLM + manualTotal;

    // Core 5 budgets = avg(12)
    const coreBudgets: Record<string, number> = {};
    for (const cat of CORE5) {
      const vals: number[] = [];
      for (const mk of histMonthsKeys) {
        const map = byMonthByCat.get(mk) || new Map();
        vals.push(map.get(cat) || 0);
      }
      coreBudgets[cat] = average(vals);
    }

    // Misc = Total - Rent - Core5
    const miscBudgetRaw =
      totalBudget - rentLM - Object.values(coreBudgets).reduce((a, b) => a + b, 0);
    const overAllocated = miscBudgetRaw < 0;
    const miscBudget = Math.max(0, miscBudgetRaw);

    // Actuals MTD in target month
    const targetY = targetMonthDate.getFullYear();
    const targetM = targetMonthDate.getMonth();
    let totalActualMTD = 0;
    let rentActual = 0;
    const coreActual: Record<string, number> = {};
    CORE5.forEach((c) => (coreActual[c] = 0));

    const days = daysInMonth(targetMonthDate);
    const byDay = new Array(days).fill(0);

    for (const r of tx) {
      if (!r.isExpense) continue;
      // fast month compare via yyyy-mm-01, then fallback
      if (!isSameMonth(new Date(`${r.month}-01`), targetY, targetM)) {
        const d2 = new Date(r.year, r.mm, r.day);
        if (!isSameMonth(d2, targetY, targetM)) continue;
      }

      totalActualMTD += r.amount;
      const lc = lower(r.category);
      if (lc === "rent") rentActual += r.amount;
      else if ((CORE5 as readonly string[]).includes(r.category)) {
        coreActual[r.category] += r.amount;
      }

      const d = r.day;
      if (d >= 1 && d <= days) byDay[d - 1] += r.amount;
    }

    // cumulative series
    const series: Array<{ day: number; cumActual: number }> = [];
    let acc = 0;
    for (let i = 0; i < days; i++) {
      acc += byDay[i];
      series.push({ day: i + 1, cumActual: acc });
    }

    // Misc actual = total - rent - core
    const coreSumActual = Object.values(coreActual).reduce((a, b) => a + b, 0);
    const miscActual = Math.max(0, totalActualMTD - rentActual - coreSumActual);

    const rows = [
      { category: "Rent", budget: rentLM, actual: rentActual, source: "last-month" as const },
      ...CORE5.map((c) => ({
        category: c,
        budget: coreBudgets[c],
        actual: coreActual[c],
        source: "avg-12" as const,
      })),
      {
        category: "Miscellaneous",
        budget: miscBudget,
        actual: miscActual,
        source: "derived" as const,
      },
    ].map((r) => ({ ...r, remaining: Math.max(0, r.budget - r.actual) }));

    res.json({
      month: targetMonthKey,
      totalBudget,
      totalActualMTD,
      totalRemaining: Math.max(0, totalBudget - totalActualMTD),
      manualTotal,
      manualNote,
      manualItems,
      overAllocated,
      series,
      rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "failed to compute budget" });
  }
}
