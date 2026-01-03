import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth.js";
import {
  appendRowToSheet,
  readTableByName,
  updateRowByIdInSheet,
  deleteRowByIdInSheet,
  type SheetRowObject,
} from "../_lib/sheets.js";
import {
  BENEFITS_SHEET,
  normalizeBenefit,
  type BenefitCreateInput,
  type BenefitRecord,
  type CadenceType,
} from "./_shared.js";

const parseCadenceType = (value: unknown): CadenceType => {
  const str = String(value ?? "").trim().toLowerCase();
  if (
    str === "weekly" ||
    str === "monthly" ||
    str === "quarterly" ||
    str === "semi-annual" ||
    str === "yearly" ||
    str === "custom"
  )
    return str as CadenceType;
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

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = String(value).toLowerCase().trim();
    return lower === "true" || lower === "1" || lower === "yes" || lower === "x" || lower === "✓";
  }
  if (typeof value === "number") return value !== 0;
  return false;
};

// Calculate valid period based on cadence and start date
// Periods align to the start date, not calendar boundaries
const calculateValidPeriod = (
  startDate: string,
  cadenceType: CadenceType,
  cadenceIntervalDays?: number,
  referenceDate?: string,
): { start: string; end: string } => {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const start = new Date(`${startDate}T00:00:00Z`);
  const refDate = new Date(`${ref}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(refDate.getTime())) {
    return { start: ref, end: ref };
  }

  // If reference date is before start date, return the first period
  if (refDate < start) {
    const firstEnd = new Date(start);
    switch (cadenceType) {
      case "weekly":
        firstEnd.setUTCDate(start.getUTCDate() + 6);
        break;
      case "monthly":
        firstEnd.setUTCMonth(start.getUTCMonth() + 1);
        firstEnd.setUTCDate(0); // Last day of the month
        break;
      case "quarterly":
        firstEnd.setUTCMonth(start.getUTCMonth() + 3);
        firstEnd.setUTCDate(0);
        break;
      case "semi-annual":
        firstEnd.setUTCMonth(start.getUTCMonth() + 6);
        firstEnd.setUTCDate(0);
        break;
      case "yearly":
        firstEnd.setUTCFullYear(start.getUTCFullYear() + 1);
        firstEnd.setUTCDate(0);
        break;
      case "custom":
        if (cadenceIntervalDays && cadenceIntervalDays > 0) {
          firstEnd.setUTCDate(start.getUTCDate() + cadenceIntervalDays - 1);
        }
        break;
    }
    return {
      start: start.toISOString().slice(0, 10),
      end: firstEnd.toISOString().slice(0, 10),
    };
  }

  let periodStart = new Date(start);
  let periodEnd = new Date(start);

  // Calculate which period we're in based on the start date
  switch (cadenceType) {
    case "weekly": {
      const daysDiff = Math.floor((refDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const weeksPassed = Math.floor(daysDiff / 7);
      periodStart = new Date(start);
      periodStart.setUTCDate(start.getUTCDate() + weeksPassed * 7);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodStart.getUTCDate() + 6);
      break;
    }
    case "monthly": {
      const monthsDiff =
        (refDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (refDate.getUTCMonth() - start.getUTCMonth());
      const startDay = start.getUTCDate();
      periodStart = new Date(start);
      periodStart.setUTCMonth(start.getUTCMonth() + monthsDiff);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodStart.getUTCMonth() + 1);
      periodEnd.setUTCDate(0); // Last day of the month
      // Handle month-end dates (e.g., Jan 31 -> Feb 28/29)
      if (startDay > periodEnd.getUTCDate()) {
        periodStart.setUTCDate(periodEnd.getUTCDate());
      }
      break;
    }
    case "quarterly": {
      const monthsDiff =
        (refDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (refDate.getUTCMonth() - start.getUTCMonth());
      const quartersPassed = Math.floor(monthsDiff / 3);
      periodStart = new Date(start);
      periodStart.setUTCMonth(start.getUTCMonth() + quartersPassed * 3);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodStart.getUTCMonth() + 3);
      periodEnd.setUTCDate(0);
      break;
    }
    case "semi-annual": {
      const monthsDiff =
        (refDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (refDate.getUTCMonth() - start.getUTCMonth());
      const semiAnnualsPassed = Math.floor(monthsDiff / 6);
      periodStart = new Date(start);
      periodStart.setUTCMonth(start.getUTCMonth() + semiAnnualsPassed * 6);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCMonth(periodStart.getUTCMonth() + 6);
      periodEnd.setUTCDate(0);
      break;
    }
    case "yearly": {
      const yearsDiff = refDate.getUTCFullYear() - start.getUTCFullYear();
      periodStart = new Date(start);
      periodStart.setUTCFullYear(start.getUTCFullYear() + yearsDiff);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCFullYear(periodStart.getUTCFullYear() + 1);
      periodEnd.setUTCDate(0);
      // Handle leap year edge case (Feb 29)
      if (start.getUTCMonth() === 1 && start.getUTCDate() === 29) {
        if (periodEnd.getUTCDate() < 29) {
          periodStart.setUTCDate(periodEnd.getUTCDate());
        }
      }
      break;
    }
    case "custom": {
      if (!cadenceIntervalDays || cadenceIntervalDays <= 0) {
        return { start: ref, end: ref };
      }
      const daysSinceStart = Math.floor((refDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const periodsPassed = Math.floor(daysSinceStart / cadenceIntervalDays);
      periodStart = new Date(start);
      periodStart.setUTCDate(start.getUTCDate() + periodsPassed * cadenceIntervalDays);
      periodEnd = new Date(periodStart);
      periodEnd.setUTCDate(periodStart.getUTCDate() + cadenceIntervalDays - 1);
      break;
    }
    default:
      return { start: ref, end: ref };
  }

  return {
    start: periodStart.toISOString().slice(0, 10),
    end: periodEnd.toISOString().slice(0, 10),
  };
};

const validateCreateInput = (body: Record<string, unknown>): { ok: true; data: BenefitCreateInput } | { ok: false; error: string } => {
  const id = String(body.id ?? "").trim();
  const name = String(body.name ?? "").trim();
  const amount = parseNumber(body.amount);
  const cadenceType = parseCadenceType(body.cadenceType);
  const cadenceIntervalDaysRaw = parseNumber(body.cadenceIntervalDays);
  const cadenceIntervalDays = cadenceType === "custom" ? cadenceIntervalDaysRaw : undefined;
  const startDate = String(body.startDate ?? "").trim();
  const creditCard = String(body.creditCard ?? "").trim() || undefined;

  if (!id) return { ok: false, error: "missing_id" };
  if (!name) return { ok: false, error: "missing_name" };
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
      startDate,
      creditCard,
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
  if (body.startDate !== undefined) patch["Start Date"] = parseDate(body.startDate);
  if (body.used !== undefined) patch["Used"] = parseBoolean(body.used);
  if (body.validPeriodStart !== undefined) patch["Valid Period Start"] = parseDate(body.validPeriodStart);
  if (body.validPeriodEnd !== undefined) patch["Valid Period End"] = parseDate(body.validPeriodEnd);
  if (body.creditCard !== undefined) patch["Credit Card"] = body.creditCard === null || body.creditCard === "" ? "" : String(body.creditCard);

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

async function listBenefits(): Promise<BenefitRecord[]> {
  try {
    const rows = await readTableByName(BENEFITS_SHEET);
    const benefits = rows
      .map((r) => normalizeBenefit(r))
      .filter((benefit) => benefit.id && benefit.name);

    // Auto-refresh valid periods and used status
    const today = new Date().toISOString().slice(0, 10);
    const updates: Array<{ id: string; patch: SheetRowObject }> = [];

    for (const benefit of benefits) {
      if (!benefit.startDate) continue;

      const currentPeriod = calculateValidPeriod(
        benefit.startDate,
        benefit.cadenceType,
        benefit.cadenceIntervalDays,
        today,
      );

      // If the stored period doesn't match the current period, reset used and update period
      if (
        benefit.validPeriodStart !== currentPeriod.start ||
        benefit.validPeriodEnd !== currentPeriod.end
      ) {
        const patch: SheetRowObject = {
          "Valid Period Start": currentPeriod.start,
          "Valid Period End": currentPeriod.end,
          Used: false,
        };
        updates.push({ id: benefit.id, patch });
      }
    }

    // Apply updates
    for (const update of updates) {
      try {
        await updateRowByIdInSheet(BENEFITS_SHEET, update.id, update.patch);
      } catch (error) {
        console.error(`Failed to update benefit ${update.id}`, error);
      }
    }

    // Re-read to get updated values
    if (updates.length > 0) {
      const updatedRows = await readTableByName(BENEFITS_SHEET);
      return updatedRows
        .map((r) => normalizeBenefit(r))
        .filter((benefit) => benefit.id && benefit.name);
    }

    return benefits;
  } catch (error) {
    console.error("Failed to read benefits", error);
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireAuth(req, res)) return;

  if (req.method === "GET") {
    const rows = await listBenefits();
    return res.status(200).json(rows);
  }

  if (req.method === "POST") {
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const result = validateCreateInput(rawBody ?? {});
    if (!result.ok) return res.status(400).json({ error: result.error });

    const today = new Date().toISOString().slice(0, 10);
    const validPeriod = calculateValidPeriod(
      result.data.startDate,
      result.data.cadenceType,
      result.data.cadenceIntervalDays,
      today,
    );

    const now = new Date();
    const row: SheetRowObject = {
      ID: result.data.id,
      Name: result.data.name,
      Amount: result.data.amount,
      "Cadence Type": result.data.cadenceType,
      "Cadence Interval (Days)":
        result.data.cadenceType === "custom" ? result.data.cadenceIntervalDays ?? "" : "",
      "Start Date": result.data.startDate,
      "Valid Period Start": validPeriod.start,
      "Valid Period End": validPeriod.end,
      Used: false,
      "Credit Card": result.data.creditCard ?? "",
      "Created At": now.toLocaleString(),
      "Updated At": now.toLocaleString(),
    };

    try {
      await appendRowToSheet(BENEFITS_SHEET, row);
      return res.status(201).json(normalizeBenefit(row));
    } catch (error) {
      console.error("Failed to create benefit", error);
      return res.status(500).json({ error: "create_failed" });
    }
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const validation = validateUpdateInput(rawBody ?? {});
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    try {
      const updated = await updateRowByIdInSheet(BENEFITS_SHEET, validation.id, validation.patch);
      return res.status(200).json(normalizeBenefit(updated));
    } catch (error) {
      if (error instanceof Error && error.message === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("Failed to update benefit", error);
      return res.status(500).json({ error: "update_failed" });
    }
  }

  if (req.method === "DELETE") {
    const id = typeof req.query.id === "string" ? req.query.id.trim() : "";
    if (!id) return res.status(400).json({ error: "missing_id" });

    try {
      await deleteRowByIdInSheet(BENEFITS_SHEET, id);
      return res.status(200).json({ ok: true, id });
    } catch (error) {
      if (error instanceof Error && error.message === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      console.error("Failed to delete benefit", error);
      return res.status(500).json({ error: "delete_failed" });
    }
  }

  res.setHeader("Allow", "GET, POST, PUT, PATCH, DELETE");
  return res.status(405).send("Method Not Allowed");
}

