import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import {
  appendRowToSheet,
  readTableByName,
  updateRowByIdInSheet,
  type SheetRowObject,
} from "../_lib/sheets.js";
import {
  SUBSCRIPTIONS_SHEET,
  normalizeSubscription,
  type SubscriptionCreateInput,
  type SubscriptionRecord,
} from "./_shared.js";

const parseCadenceType = (value: unknown) => {
  const str = String(value ?? "").trim().toLowerCase();
  if (str === "weekly" || str === "monthly" || str === "yearly" || str === "custom") return str;
  return "monthly";
};

const parseNumber = (value: unknown) =>
  typeof value === "number"
    ? value
    : value
    ? Number(String(value).replace(/[^0-9.-]/g, "")) || 0
    : 0;

const parseDate = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (value === undefined || value === null) return "";
  return String(value);
};

const validateCreateInput = (body: Record<string, unknown>): { ok: true; data: SubscriptionCreateInput } | { ok: false; error: string } => {
  const id = String(body.id ?? "").trim();
  const name = String(body.name ?? "").trim();
  const amount = parseNumber(body.amount);
  const cadenceType = parseCadenceType(body.cadenceType);
  const cadenceIntervalDaysRaw = parseNumber(body.cadenceIntervalDays);
  const cadenceIntervalDays =
    cadenceType === "custom" ? cadenceIntervalDaysRaw : undefined;
  const categoryId = String(body.categoryId ?? "").trim();
  const startDate = String(body.startDate ?? "").trim();
  const lastLoggedDate = String(body.lastLoggedDate ?? "").trim() || startDate;
  const endDate = String(body.endDate ?? "").trim();
  const notes = body.notes === undefined || body.notes === null ? undefined : String(body.notes);

  if (!id) return { ok: false, error: "missing_id" };
  if (!name) return { ok: false, error: "missing_name" };
  if (!categoryId) return { ok: false, error: "missing_category" };
  if (!startDate) return { ok: false, error: "missing_start_date" };
  if (amount <= 0) return { ok: false, error: "invalid_amount" };
  if (cadenceType === "custom" && (!cadenceIntervalDays || cadenceIntervalDays <= 0)) {
    return { ok: false, error: "invalid_custom_interval" };
  }

  return {
    ok: true,
    data: {
      id,
      name,
      amount,
      cadenceType,
      cadenceIntervalDays,
      categoryId,
      startDate,
      lastLoggedDate: lastLoggedDate || startDate,
      endDate: endDate || undefined,
      notes,
    },
  };
};

const validateUpdateInput = (
  body: Record<string, unknown>,
): { ok: true; id: string; patch: SheetRowObject } | { ok: false; error: string } => {
  const id = String(body.id ?? body.ID ?? "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  const patch: SheetRowObject = {};
  if (body.name !== undefined) patch["Name"] = String(body.name ?? "");
  if (body.amount !== undefined) patch["Amount"] = parseNumber(body.amount);
  if (body.categoryId !== undefined) patch["Category ID"] = String(body.categoryId ?? "");
  if (body.startDate !== undefined) patch["Start Date"] = parseDate(body.startDate);
  if (body.lastLoggedDate !== undefined) patch["Last Logged Date"] = parseDate(body.lastLoggedDate);
  if (body.endDate !== undefined) patch["End Date"] = parseDate(body.endDate);
  if (body.notes !== undefined) patch["Notes"] = body.notes === null ? "" : String(body.notes ?? "");

  if (body.cadenceType !== undefined || body.cadenceIntervalDays !== undefined) {
    const cadenceType = parseCadenceType(body.cadenceType);
    patch["Cadence Type"] = cadenceType;
    if (cadenceType === "custom") {
      const interval = parseNumber(body.cadenceIntervalDays);
      if (!interval || interval <= 0) return { ok: false, error: "invalid_custom_interval" };
      patch["Cadence Interval (Days)"] = interval;
    } else {
      patch["Cadence Interval (Days)"] = "";
    }
  }

  return { ok: true, id, patch };
};

async function listSubscriptions(): Promise<SubscriptionRecord[]> {
  try {
    const rows = await readTableByName(SUBSCRIPTIONS_SHEET);
    return rows
      .map((r) => normalizeSubscription(r))
      .filter((sub) => sub.id && sub.name && sub.categoryId);
  } catch (error) {
    console.error("Failed to read subscriptions", error);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const rows = await listSubscriptions();
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const result = validateCreateInput(rawBody ?? {});
    if (!result.ok) return res.status(400).json({ error: result.error });

    const now = new Date();
    const row: SheetRowObject = {
      ID: result.data.id,
      Name: result.data.name,
      Amount: result.data.amount,
      "Cadence Type": result.data.cadenceType,
      "Cadence Interval (Days)": result.data.cadenceType === "custom" ? result.data.cadenceIntervalDays ?? "" : "",
      "Category ID": result.data.categoryId,
      "Start Date": result.data.startDate,
      "Last Logged Date": result.data.lastLoggedDate,
      "End Date": result.data.endDate ?? "",
      Notes: result.data.notes ?? "",
      "Created At": now.toLocaleString(),
      "Updated At": now.toLocaleString(),
    };

    try {
      await appendRowToSheet(SUBSCRIPTIONS_SHEET, row);
      return res.status(201).json(normalizeSubscription(row));
    } catch (error) {
      console.error("Failed to create subscription", error);
      return res.status(500).json({ error: "create_failed" });
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const validation = validateUpdateInput(rawBody ?? {});
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    try {
      const updated = await updateRowByIdInSheet(SUBSCRIPTIONS_SHEET, validation.id, validation.patch);
      return res.status(200).json(normalizeSubscription(updated));
    } catch (error) {
      if (error instanceof Error && error.message === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("Failed to update subscription", error);
      return res.status(500).json({ error: "update_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, PATCH");
  return res.status(405).send("Method Not Allowed");
}
