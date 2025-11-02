import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import {
  appendRow,
  getSheetsClient,
  readTable,
  readTableByName,
  updateRowByIdInSheet,
} from "../_lib/sheets.js";
import {
  SUBSCRIPTIONS_SHEET,
  normalizeSubscription,
  isOccurrenceOnSchedule,
  type SubscriptionRecord,
} from "./_shared.js";

type CategoryInfo = { id: string; name: string; type: "income" | "expense" };

const loadSubscriptions = async (id: string): Promise<SubscriptionRecord | null> => {
  const rows = await readTableByName(SUBSCRIPTIONS_SHEET);
  const match = rows.find((r) => String(r.ID ?? r.id ?? "").trim() === id);
  if (!match) return null;
  return normalizeSubscription(match);
};

const fetchCategories = async (): Promise<Map<string, CategoryInfo>> => {
  const map = new Map<string, CategoryInfo>();
  const { sheets, spreadsheetId } = await getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Categories!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());
  const idxId = headers.findIndex((h) => /^id$/i.test(h));
  const idxName = headers.findIndex((h) => /^name$/i.test(h));
  const idxType = headers.findIndex((h) => /^type$/i.test(h));
  if (idxId < 0 || idxName < 0 || idxType < 0) return map;

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Categories!A2:ZZZ`,
  });
  const rows = dataRes.data.values || [];
  for (const row of rows) {
    const id = String(row[idxId] ?? "").trim();
    if (!id) continue;
    const name = String(row[idxName] ?? "").trim();
    const type = String(row[idxType] ?? "").trim().toLowerCase();
    if (type !== "income" && type !== "expense") continue;
    map.set(id, { id, name, type });
  }
  return map;
};

const generateTransactionId = async () => {
  const rows = await readTable();
  let max = 0;
  for (const r of rows) {
    const raw = (r["ID"] ?? r["id"] ?? "") as string;
    const match = String(raw).match(/spend-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > max) max = num;
    }
  }
  return `spend-${max + 1}`;
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const subscriptionId = String(body?.subscriptionId ?? "").trim();
    const occurrenceDate = String(body?.occurrenceDate ?? "").trim();
    if (!subscriptionId) return res.status(400).json({ error: "missing_subscription_id" });
    if (!occurrenceDate || !isIsoDate(occurrenceDate)) {
      return res.status(400).json({ error: "invalid_occurrence_date" });
    }

    const subscription = await loadSubscriptions(subscriptionId);
    if (!subscription) return res.status(404).json({ error: "subscription_not_found" });

    if (subscription.endDate && occurrenceDate > subscription.endDate) {
      return res.status(400).json({ error: "after_end_date" });
    }

    if (!subscription.startDate) {
      return res.status(400).json({ error: "subscription_missing_start_date" });
    }

    const cadenceCheck = isOccurrenceOnSchedule(subscription, occurrenceDate);
    if (!cadenceCheck.ok) {
      return res.status(400).json({ error: "off_schedule", reason: cadenceCheck.reason });
    }

    const categories = await fetchCategories();
    const category = categories.get(subscription.categoryId);
    if (!category) return res.status(400).json({ error: "category_not_found" });

    const txId = await generateTransactionId();
    const now = new Date();
    const description = subscription.name;

    await appendRow({
      ID: txId,
      Date: occurrenceDate,
      Amount: subscription.amount,
      Type: category.type,
      Category: category.name,
      Description: description,
      "Created At": now.toLocaleString(),
      "Updated At": now.toLocaleString(),
      "Subscription ID": subscription.id,
    });

    const updatedRow = await updateRowByIdInSheet(SUBSCRIPTIONS_SHEET, subscription.id, {
      "Last Logged Date": occurrenceDate,
    });
    const updatedSubscription = normalizeSubscription(updatedRow);

    return res.status(200).json({
      transaction: {
        id: txId,
        date: occurrenceDate,
        type: category.type,
        category: category.name,
        description,
        amount: subscription.amount,
        subscriptionId: subscription.id,
      },
      subscription: updatedSubscription,
    });
  } catch (error) {
    console.error("POST /api/subscriptions/log failed", error);
    return res.status(500).json({ error: "log_failed" });
  }
}
