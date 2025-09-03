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
  const auth = new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    SCOPES
  );
  const sheets = google.sheets({ version: "v4", auth });
  return { sheets, ...getSheetIds() };
}

export async function readTable() {
  const { sheets, spreadsheetId, sheetName } = await getSheetsClient();
  // Read header
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  const headers = (headerRes.data.values?.[0] || []).map((h) => String(h).trim());
  // Read data (A2:Z handles up to column Z; expand if needed)
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
    range: `${sheetName}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [values] }
  });
}