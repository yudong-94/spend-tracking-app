import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "./_lib/auth.js";
import { getSheetsClient } from "./_lib/sheets.js";

/**
 * GET /api/categories  ->  [{ id, name, type: "income"|"expense" }]
 * Reads the "Categories" sheet. Header row must contain: ID, Name, Type
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {

  if (!requireAuth(req, res)) return;

  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  try {
    const { sheets, spreadsheetId } = await getSheetsClient();

    // 1) Header
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Categories!1:1`,
    });
    const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());

    // find header indexes defensively (tolerate case/whitespace)
    const idxId = headers.findIndex((h) => /^id$/i.test(h));
    const idxName = headers.findIndex((h) => /^name$/i.test(h));
    const idxType = headers.findIndex((h) => /^type$/i.test(h));
    if (idxId < 0 || idxName < 0 || idxType < 0) {
      return res.status(200).json([]); // no usable headers
    }

    // 2) Data
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Categories!A2:ZZZ`,
    });
    const rows = dataRes.data.values || [];

    const out = rows
      .map((r) => ({
        id: String(r[idxId] ?? "").trim(),
        name: String(r[idxName] ?? "").trim(),
        type: String(r[idxType] ?? "").trim().toLowerCase(),
      }))
      .filter(
        (x) =>
          x.id &&
          x.name &&
          (x.type === "income" || x.type === "expense")
      );

    return res.status(200).json(out);
  } catch (err) {
    console.error("GET /api/categories failed:", err);
    return res.status(500).json({ error: "failed_to_read_categories" });
  }
}