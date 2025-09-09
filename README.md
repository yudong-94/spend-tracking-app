# Spend Tracker (Google Sheets + Vercel)

A fast, low-cost personal finance app that uses **Google Sheets** as the database and **Vercel** for hosting.  
Built with **Vite + React + TypeScript + Tailwind**, charts via **Recharts**, and serverless API routes that read/write your sheet.

## ✨ Features

- **Dashboard**
  - “**This Month**” and “**This Year**” cards: Income / Expense / Net (USD formatted)
  - Category breakdown charts (income + expense) for month & YTD
  - X‑axis is de‑crowded automatically: shows Top 14 categories and groups the rest into “Other”, truncates long labels and skips ticks when crowded.
- **Analytics**
  - Monthly totals (income / expense / net) bar charts
  - Combined monthly chart: income vs expense with a net line
  - Monthly savings rate KPI + line chart (net ÷ income)
  - Annual totals (income / expense / net) bar charts
  - Annual savings rate line chart (per‑year net ÷ income)
  - **YoY pacing** line chart: cumulative net vs. last year (Jan→Dec)
  - Time window & **multi‑select category** filters
- **Transactions**
  - Search, type filter, **multi-select category** filter
  - Signed USD totals (+ for income, − for expense)
  - Colored dots: 🟢 income, 🔴 expense
- **Add Transaction**
  - Quick form with date, type, category (single‑select)
  - “Quick add” chips (recent categories) now sit right below Category for faster entry
  - Posts directly to your Google Sheet
- **Data**
  - Uses your **Transactions** and **Categories** tabs
  - Generates a unique `ID` like `spend-3901` when adding
- **Performance & UX**
  - App‑wide **cache** (localStorage) hydrated on load
  - **Refresh** button; cache auto‑refreshes after adding a transaction
  - Charts auto‑size Y‑axes to avoid clipping currency/percent labels
  - Unified page header component (timestamp + refresh) shared across screens

---

## 🗂️ Google Sheets Setup

Create a Google Sheet with two tabs:

### `Transactions` (header row exactly as below)
| ID | Date | Amount | Type | Category | Description | Created At | Updated At |
|---|---|---|---|---|---|---|---|
| spend-3901 | 2025-08-14 | 62 | expense | Utility | Xfinity | 8/14/2025 0:00:00 | 8/14/2025 0:00:00 |

- **Type** must be `income` or `expense` (lowercase).
- Recommended: format **Amount** as Number (the UI handles currency).

### `Categories`
| ID | Name | Type |
|---|---|---|
| cat-31 | Rent | expense |
| cat-2 | Grand Total | income |

The app reads this tab to populate category dropdowns (expense first A→Z, then income A→Z).

> Share the sheet with your **service account email** (see below) as **Editor**.

---

## 🔐 Environment Variables

Create a **service account** in Google Cloud with **“Google Sheets API”** enabled and download its JSON key.
In **Vercel** (Project → Settings → Environment Variables) and in local `.env.local`, set:
1. **Entire service account JSON (as one line)**  
GOOGLE_SERVICE_ACCOUNT_JSON={“type”:“service_account”,“project_id”:”…”,“private_key_id”:”…”,“private_key”:”—–BEGIN PRIVATE KEY—–\n…\n—–END PRIVATE KEY—–\n”,“client_email”:“my-sa@my-project.iam.gserviceaccount.com”, …}
2. Target spreadsheet + default tab name for Transactions  
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_SHEETS_TAB=Transactions

> Make sure the **service account email** (from the JSON) has **Editor** access to the sheet.

---

## ▶️ Run Locally

Option A — from repo root (workspace scripts):

```bash
npm install               # installs all workspaces
cp frontend/.env.local.example frontend/.env.local  # if provided, else create it
npm run dev               # runs backend (if used) and frontend together
```

Option B — frontend only:

```bash
cd frontend
npm install
# Put the env vars above into frontend/.env.local
npm run dev               # http://localhost:5173
```

---

## ☁️ Deploy (Vercel)
- Import the repo in Vercel.
- Project root: **/frontend**
- **Build Command**: npm run build
- **Output Dir**: dist
- Set the env vars in the project.
- Deploy. (The serverless API lives in frontend/api/*.)

---

## 🧱 Project Structure

frontend/
  api/                    # Vercel serverless routes
    _lib/sheets.ts        # Google Sheets helpers
    _lib/sheets.js.d.ts   # TS shim for ESM imports
    summary.ts            # GET monthly summary
    breakdown.ts          # GET category breakdown
    transactions.ts       # GET/POST transactions
    categories.ts         # GET categories (from "Categories" tab)
  src/
    components/
      CategorySelect.tsx  # Reusable single/multi category dropdown
      RefreshButton.tsx
    pages/
      Dashboard.tsx
      Analytics.tsx
      Transactions.tsx
      AddTransaction.tsx
    state/
      data-cache.tsx      # App-wide cached data + helpers
    lib/
      api.ts              # Client fetchers
      format.ts           # Currency formatting
      colors.ts           # Chart palette
      chart.ts            # Helpers (dynamic Y-axis, % formatter)
    components/
      PageHeader.tsx      # Shared page header (updated timestamp + refresh)
      CombinedMonthlyChart.tsx

---

## 🧮 API Overview

All routes are under /api/* (serverless):
- GET /api/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD&type=income|expense
   - Returns array of rows from Transactions.
- POST /api/transactions
   - Body (JSON): { date, type: "income"|"expense", category, amount, description? }
	- Generates ID (spend-####), writes to sheet, returns { ok: true, id }.
- GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
	- { totalIncome, totalExpense, netCashFlow }
- GET /api/breakdown?type=income|expense&start=YYYY-MM-DD&end=YYYY-MM-DD
	- [{ category, amount }]
- GET /api/categories
	- Reads the Categories tab → [{ id, name, type }]

> Server code is ES Modules on Vercel; imports from ./_lib/sheets.js include the .js extension (TypeScript shim provided).

---

## 🧠 Caching & Refresh Behavior
- On first load, the app hydrates from **localStorage** (transactions + categories).
- Data is considered **stale after 5 min** and then background-refreshed.
- **Refresh** button triggers a fetch across the app.
- After **adding** a transaction, the app **optimistically** updates the cache and silently refreshes.

---

🎨 UI Details
- **Money**: signed USD (+ income, − expense) using Intl.NumberFormat
- **Badges**: 🟢 income / 🔴 expense dots in tables & dropdowns
- **Charts**: Recharts (green = income, red = expense, blue = net). Y‑axes auto‑size to avoid clipped labels.
- **Category dropdowns**:
   - **Analytics & Transactions: multi-select**
   - **Add Transaction: single-select**
   - Searchable, grouped (Expenses first, then Income)

For Dashboard category charts:
- Shows Top 14 categories; remaining categories are grouped into “Other”.
- Truncates long labels and skips some ticks when crowded to keep the axis readable.

---

## 🛠️ Troubleshooting
- **ERR_MODULE_NOT_FOUND for _lib/sheets**
   - Ensure imports in serverless routes include the extension: 
   - import { readTable } from "./_lib/sheets.js"
   - The sheets.js.d.ts shim makes TypeScript happy.
- **No categories in dropdowns**
	- Confirm the sheet tab is named Categories (exactly).
	- Header row must include ID, Name, Type (any capitalization ok).
	- Hit Refresh to repopulate the cache.
- **Amounts look wrong in the sheet**
	- The app sends numbers; set the Amount column to Number in Sheets.
	- Type must be lowercase income / expense.
- **IDs not added**
	- The server scans existing spend-#### and appends +1.
(For heavy concurrency, consider switching to ULIDs.)

### Dev & Tooling
- Formatting: `npm run format` (Prettier across repo) and `npm run format:check`.
- Lint (frontend): `npm run lint` from the `frontend/` folder (ESLint + TS + React Hooks).
- Building frontend: `npm run build` from `frontend/`.

### Storybook (optional)
The repo contains simple stories (PageHeader and CombinedMonthlyChart) but does not include Storybook runtime by default.

To enable locally:
```bash
cd frontend
npx storybook@latest init
npm run storybook
```

---

## 🔒 Security Notes
- Keep your **service account JSON** secret (GOOGLE_SERVICE_ACCOUNT_JSON).
- Share the sheet only with that service account email.

---

## 🗺️ Roadmap
- Inline edit/delete on Transactions
- Budget targets & variance
- Recurring transactions helper
- CSV import/export
- Optional auth (Protect access with Google OAuth)
