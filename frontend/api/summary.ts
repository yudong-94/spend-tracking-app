import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import { readTable } from "./_lib/sheets.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!requireAuth(req, res)) return;

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }
    const { start, end } = req.query as { start?: string; end?: string };
    const rows = await readTable();
    const toTime = (d?: string) => (d ? new Date(d).getTime() : undefined);
    const startMs = toTime(start);
    const endMs = toTime(end);

    let income = 0,
      expense = 0;
    for (const r of rows) {
      const t = new Date(r["Date"] || r["date"]).getTime();
      if (!Number.isFinite(t)) continue;
      if (startMs && t < startMs) continue;
      if (endMs && t > endMs) continue;
      const amt = Number(r["Amount"] ?? r["amount"] ?? 0) || 0;
      const type = String(r["Type"] ?? r["type"] ?? "").toLowerCase();
      if (type === "income") income += amt;
      else if (type === "expense") expense += amt;
    }
    return res.status(200).json({
      totalIncome: income,
      totalExpense: expense,
      netCashFlow: income - expense,
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Server error";
    return res.status(500).json({ error: message });
  }
}
