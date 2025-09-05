import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTable, appendRow } from "./_lib/sheets.js";

type Tx = {
  id?: string;
  date: string;             // YYYY-MM-DD
  type: "income" | "expense";
  category: string;
  description?: string;
  amount: number;
};

// helper: parse amount safely
const parseAmount = (v: any) =>
  typeof v === "number" ? v : v ? Number(String(v).replace(/[^0-9.-]/g, "")) || 0 : 0;

// helper: convert Google serial date or strings to epoch ms
const toMillis = (v: any) => {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400 * 1000)).getTime();
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : NaN;
};

// normalize any header casing to a canonical Tx
const normalize = (r: Record<string, any>): Tx => {
  const get = (k: string) => r[k] ?? r[k.toLowerCase()] ?? r[k.toUpperCase()];
  const rawDate = get("Date") ?? get("Created At") ?? "";
  const ms = toMillis(rawDate);
  const date = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";

  const rawType = String(get("Type") ?? "").toLowerCase();
  const type = rawType === "income" ? "income" : "expense";

  return {
    id: String(get("ID") ?? ""),
    date,
    type,
    category: String(get("Category") ?? "Uncategorized"),
    description: String(get("Description") ?? ""),
    amount: parseAmount(get("Amount"))
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const { start, end, type, category, q } = (req.query || {}) as {
        start?: string; end?: string; type?: string; category?: string; q?: string;
      };

      const startMs = start ? Date.parse(start) : undefined;
      const endMs = end ? Date.parse(end) : undefined;
      const typeFilter = type ? String(type).toLowerCase() : undefined;
      const catFilter = category ? String(category).toLowerCase() : undefined;
      const qStr = q ? String(q).toLowerCase() : "";

      const raw = await readTable();
      const rows = raw
        .map(normalize)
        .filter(tx => {
          if (startMs && Date.parse(tx.date) < startMs) return false;
          if (endMs && Date.parse(tx.date) > endMs) return false;
          if (typeFilter && tx.type !== typeFilter) return false;
          if (catFilter && tx.category.toLowerCase() !== catFilter) return false;
          if (qStr && !(tx.category + " " + (tx.description || "")).toLowerCase().includes(qStr)) return false;
          return true;
        })
        .sort((a, b) => b.date.localeCompare(a.date)); // newest first

      return res.status(200).json(rows);
    }

  if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      // accept lowercase or Sheet-style Title Case
      const pick = (k: string) => body?.[k] ?? body?.[k[0].toUpperCase() + k.slice(1)];
      const parseAmount = (v: any) =>
        typeof v === "number"
          ? v
          : v
          ? Number(String(v).replace(/[^0-9.-]/g, "")) || 0
          : 0;
      const typeRaw = String(pick("type") ?? "").toLowerCase();
      const toSheetRow: Record<string, any> = {
        ID: pick("id") || "",
        Date: pick("date"),
        Amount: parseAmount(pick("amount")),
        Type: typeRaw === "income" ? "income" : "expense",
        Category: pick("category"),
        Description: pick("description") || "",
        "Created At": new Date().toLocaleString(),
        "Updated At": new Date().toLocaleString(),
      };
      await appendRow(toSheetRow);
      return res.status(201).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).send("Method Not Allowed");
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}