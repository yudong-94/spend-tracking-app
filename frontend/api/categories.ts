// GET /api/categories  -> [{ id, name, type }]
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readTableByName } from "./_lib/sheets";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  try {
    // reads the "Categories" worksheet
    const rows = await readTableByName("Categories");
    const out = (rows || [])
      .map((r: any) => ({
        id: String(r["ID"] ?? r["Id"] ?? r["id"] ?? ""),
        name: String(r["Name"] ?? r["name"] ?? "").trim(),
        type: String(r["Type"] ?? r["type"] ?? "").toLowerCase() as "income" | "expense",
      }))
      .filter((r) => r.id && r.name && (r.type === "income" || r.type === "expense"));

    res.status(200).json(out);
  } catch (err: any) {
    console.error("categories error", err);
    res.status(500).json({ error: "failed_to_read_categories" });
  }
}