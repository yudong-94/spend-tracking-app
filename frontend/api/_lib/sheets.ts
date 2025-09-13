import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON env var");
  return JSON.parse(raw);
}

function getSheetIds() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEETS_ID env var");
  const sheetName = process.env.GOOGLE_SHEETS_TAB || "Transactions";
  return { spreadsheetId, sheetName };
}

export async function getSheetsClient() {
  const creds = getCreds();
  const auth = new google.auth.JWT(creds.client_email, undefined, creds.private_key, SCOPES);
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, ...getSheetIds() };
}

/** read the header row for a given sheet name */
async function readHeadersFor(
  sheets: ReturnType<typeof google.sheets>["spreadsheets"]["values"],
  spreadsheetId: string,
  sheetName: string,
) {
  const headerRes = await sheets.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  return (headerRes.data.values?.[0] || []).map((h) => String(h).trim());
}

/** core reader: returns array of objects using row 1 as headers */
async function readTableCore(sheetName: string) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const headers = await readHeadersFor(sheets.spreadsheets.values, spreadsheetId, sheetName);
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    // generous range in case you add columns later
    range: `${sheetName}!A2:ZZZ`,
  });
  const rows = dataRes.data.values || [];
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
}

/** Existing behavior: reads from the default tab (Transactions) */
export async function readTable() {
  const { sheetName } = getSheetIds();
  return readTableCore(sheetName);
}

/** NEW: read any worksheet by its tab name (e.g., "Categories") */
export async function readTableByName(sheetName: string) {
  return readTableCore(sheetName);
}

export async function appendRow(row: Record<string, any>) {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  // Map to header order for resilience
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());
  const values = headers.map((h) => row[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:ZZZ`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Update a row in the default Transactions sheet by `ID`. */
export async function updateRowById(
  id: string,
  patch: Partial<Record<string, any>>,
) {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  // Read headers
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers: string[] = (headerRes.data.values?.[0] || []).map((h: any) => String(h).trim());

  // Read all rows to find the row index
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:ZZZ`,
  });
  const rows: any[][] = dataRes.data.values || [];
  let foundIndex = -1;
  let existing: Record<string, any> | null = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Assume the first column is ID; also map by headers for resilience
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
    const curId = String(obj["ID"] ?? obj["id"] ?? "").trim();
    if (curId === id) {
      foundIndex = i; // zero-based from A2
      existing = obj;
      break;
    }
  }
  if (foundIndex === -1 || !existing) throw new Error("not_found");

  const now = new Date();
  const updated: Record<string, any> = { ...existing, ...patch };
  // Ensure ID preserved and timestamps handled
  updated["ID"] = id;
  updated["Updated At"] = now.toLocaleString();
  // Keep Created At from existing if not provided
  if (!updated["Created At"]) updated["Created At"] = existing["Created At"] || now.toLocaleString();

  // Map to header order for the update
  const values = headers.map((h) => updated[h] ?? "");
  const rowNumber = foundIndex + 2; // +2 because header is row 1 and we started at A2
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });

  return updated;
}

/** Read any sheet into array of objects (header row determines keys). */
export async function readSheetAsObjects(sheetName: string) {
  const { sheets, spreadsheetId } = await getSheetsClient();

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:Z`,
  });
  const rows = dataRes.data.values || [];
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });
}

/** Append a row object to a specific sheet (maps by header order). */
export async function appendRowToSheet(sheetName: string, row: Record<string, any>) {
  const { sheets, spreadsheetId } = await getSheetsClient();
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());
  const values = headers.map((h) => row[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] },
  });
}

/** Budgets helpers (one TOTAL override row per month; notes optional). */
export async function readBudgets() {
  try {
    return await readSheetAsObjects("Budgets");
  } catch {
    // If Budgets tab doesn't exist yet, behave as empty
    return [] as Array<Record<string, string>>;
  }
}

export async function appendBudgetOverride(month: string, amount: number, notes?: string) {
  await appendRowToSheet("Budgets", {
    "Month (YYYY-MM)": month,
    Category: "TOTAL",
    Amount: amount,
    Notes: notes ?? "",
  });
}
