import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTable } from "./_lib/sheets.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }
    const { start, end, type = "expense" } = req.query as {
      start?: string; end?: string; type?: string;
    };
    const target = String(type).toLowerCase();
    if (!["income", "expense"].includes(target)) {
      return res.status(400).json({ error: "type must be 'income' or 'expense'" });
    }
    const rows = await readTable();
    const toTime = (d?: string) => (d ? new Date(d).getTime() : undefined);
    const startMs = toTime(start);
    const endMs = toTime(end);
    const byCat = new Map<string, number>();
    for (const r of rows) {
      const t = new Date(r["Date"] || r["date"]).getTime();
      if (!Number.isFinite(t)) continue;
      if (startMs && t < startMs) continue;
      if (endMs && t > endMs) continue;
      const rowType = String(r["Type"] ?? r["type"] ?? "").toLowerCase();
      if (rowType !== target) continue;
      const cat = String(r["Category"] ?? r["category"] ?? "Uncategorized");
      const amt = Number(r["Amount"] ?? r["amount"] ?? 0) || 0;
      byCat.set(cat, (byCat.get(cat) || 0) + amt);
    }
    const result = Array.from(byCat, ([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return res.status(200).json(result);
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}