import type { VercelRequest, VercelResponse } from "@vercel/node";

export function requireAuth(req: VercelRequest, res: VercelResponse) {
  const required = process.env.APP_ACCESS_TOKEN;
  if (!required) return true; // if not set, allow (dev convenience)
  const hdr = req.headers.authorization || "";
  const ok = hdr === `Bearer ${required}`;
  if (!ok) res.status(401).json({ error: "unauthorized" });
  return ok;
}