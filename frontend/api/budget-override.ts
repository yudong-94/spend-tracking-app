import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendBudgetOverride } from "./_lib/sheets.js";

const AUTH = process.env.APP_ACCESS_TOKEN || process.env.VITE_APP_ACCESS_TOKEN;

function toMonthKey(d: Date) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const header = req.headers.authorization || "";
  if (AUTH) {
    const want = `Bearer ${AUTH}`;
    if (header !== want) return res.status(401).json({ error: "unauthorized" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const month = String(body.month || toMonthKey(new Date()));
    const amount = Number(body.amount || 0);
    const notes = String(body.notes || "");

    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });
    if (!Number.isFinite(amount)) return res.status(400).json({ error: "amount must be number" });

    await appendBudgetOverride(month, amount, notes);
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "failed to append override" });
  }
}