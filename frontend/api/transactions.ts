import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTable, appendRow } from "./_lib/sheets";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      // Optional date filtering: ?start=YYYY-MM-DD&end=YYYY-MM-DD (uses 'Date' column)
      const rows = await readTable();
      const { start, end } = req.query as { start?: string; end?: string };
      const toTime = (d?: string) => (d ? new Date(d).getTime() : undefined);
      const startMs = toTime(start);
      const endMs = toTime(end);
      const filtered = rows.filter((r) => {
        const t = new Date(r["Date"] || r["date"]).getTime();
        if (Number.isNaN(t)) return true;
        if (startMs && t < startMs) return false;
        if (endMs && t > endMs) return false;
        return true;
      });
      return res.status(200).json(filtered);
    }
    if (req.method === "POST") {
      // Expecting keys matching your header row, e.g.:
      // { Date, Type, Category, Amount, Account, Description }
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.Date || !body?.Type || !body?.Category || body?.Amount == null) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await appendRow(body);
      return res.status(201).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method Not Allowed");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}