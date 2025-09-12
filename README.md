# Spend Tracker (Google Sheets + Vercel)

A fast, low-cost personal finance app that uses Google Sheets as the database and Vercel for hosting.
Built with Vite + React + TypeScript + Tailwind; charts via Recharts; API via Vercel Serverless Functions.

## ✨ Features

- Dashboard: this month/year cards (Income, Expense, Net) and category breakdowns
- Analytics: monthly/annual totals, savings rate, and YoY pacing
- Transactions: search, filter by type and categories (multi-select)
- Add Transaction: quick form with recent-category chips
- Budget: automatic monthly budget from history + manual overrides
- Data cache: app-wide cache with refresh and optimistic updates

See also GOOGLE_SHEETS_SETUP.md for detailed Sheets setup instructions.

---

## 🗂️ Google Sheets Tabs

- Transactions (header row): ID | Date | Amount | Type | Category | Description | Created At | Updated At
  - Type must be income or expense (lowercase)
  - Amount should be Number-formatted in Sheets
- Categories: ID | Name | Type
- Budgets (optional): Month (YYYY-MM) | Amount | Notes
  - Any number of override rows allowed per month; amounts are summed

Share the sheet with your service account email as Editor.

---

## 🔐 Environment Variables

Set these in Vercel (Project → Settings → Environment Variables) and in local frontend/.env.local when developing with functions:

- GOOGLE_SERVICE_ACCOUNT_JSON: Entire service account JSON as one line (escape newlines in private_key)
- GOOGLE_SHEETS_ID: Spreadsheet ID
- GOOGLE_SHEETS_TAB: Transactions tab name (default: Transactions)
- GOOGLE_SHEETS_BUDGETS_TAB: Budgets tab name (default: Budgets)
- APP_ACCESS_TOKEN: Simple shared secret used by API and UI

Auth model: On first load, the UI prompts for an access key (stored in localStorage). Requests include Authorization: Bearer <key>. Serverless routes validate against APP_ACCESS_TOKEN.

---

## ▶️ Running Locally

Recommended: use Vercel’s local dev to run the serverless API.

Option A — Vercel functions (single process):

1) cd frontend
2) npm install
3) Create frontend/.env.local with the variables above
4) npx vercel dev

This serves the SPA and /api/* at http://localhost:3000.

Option B — Vite dev (SPA) + backend (optional/legacy):

From repo root:

1) npm install
2) Populate backend/.env (see GOOGLE_SHEETS_SETUP.md)
3) npm run dev

Notes:
- Vite proxies /api → http://localhost:3001 (see frontend/vite.config.ts)
- The backend currently implements /api/transactions endpoints. Analytics and budget endpoints are provided by the serverless functions in frontend/api and will 404 if only the backend is running. For full functionality locally, prefer Option A.

---

## ☁️ Deploy (Vercel)

- Project root: frontend
- Build Command: npm run build
- Output Dir: dist
- Environment variables: configure the ones listed above
- The serverless API lives under frontend/api/* and is auto-deployed

vercel.json ensures SPA routing (fallback to index.html) and /api/* routing.

---

## 🧱 Project Structure

frontend/
  api/
    _lib/
      sheets.ts            # Google Sheets helpers
      auth.ts              # Bearer-token check using APP_ACCESS_TOKEN
    transactions.ts        # GET/POST transactions
    summary.ts             # GET monthly summary
    breakdown.ts           # GET category breakdown
    categories.ts          # GET categories (from "Categories" tab)
    budget.ts              # GET computed budget + POST override
  src/
    components/
      CategorySelect.tsx
      CurrencyInput.tsx
      PageHeader.tsx
      RefreshButton.tsx
      CombinedMonthlyChart.tsx
      Layout.tsx
      AccessGate.tsx
    pages/
      Dashboard.tsx
      Analytics.tsx
      Transactions.tsx
      AddTransaction.tsx
      Budget.tsx
    lib/
      api.ts              # Client fetchers
      format.ts           # Currency formatting
      colors.ts           # Chart palette
      chart.ts            # Chart helpers (axes/formatters)
    state/
      data-cache.tsx      # App-wide cache and helpers
      auth.tsx            # LocalStorage-based token gate

backend/ (optional)
  Express API for /api/transactions; used by Vite proxy in dev if you choose Option B.

shared/
  Shared types and utilities for backend/frontend.

---

## 🧮 API Overview (serverless)

- GET /api/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD&type=income|expense&category=Cat&q=search
  - Returns normalized rows from Transactions
- POST /api/transactions
  - Body: { date, type: "income"|"expense", category, amount, description? }
  - Generates an ID like spend-#### and appends to the sheet
- GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
  - { totalIncome, totalExpense, netCashFlow }
- GET /api/breakdown?type=income|expense&start=YYYY-MM-DD&end=YYYY-MM-DD
  - [{ category, amount }]
- GET /api/categories
  - [{ id, name, type }]
- GET /api/budget?month=YYYY-MM (optional)
  - { month, totalBudget, totalActualMTD, totalRemaining, series, rows, manualTotal, overAllocated }
- POST /api/budget
  - Body: { amount: number, notes?: string, month?: YYYY-MM }

All routes require Authorization: Bearer APP_ACCESS_TOKEN if that env var is set.

---

## 🧠 Caching & Refresh

- Uses react-query plus a lightweight local cache for fast UX
- Manual Refresh button; cache auto-refreshes after adding transactions
- Optimistic updates where safe

---

## 🎨 UI Details

- Money: signed USD (+ income, − expense)
- Badges: 🟢 income / 🔴 expense
- Charts: Recharts (green income, red expense, blue net) with smart axes
- Category dropdowns: multi-select in Analytics/Transactions; single-select in Add Transaction
- Dashboard charts show Top 14 categories and group the rest into Other

---

## 🛠️ Dev & Tooling

- Format: npm run format and npm run format:check (root)
- Lint (frontend): cd frontend && npm run lint
- Build (frontend): cd frontend && npm run build

Storybook (optional): sample stories exist; you can init Storybook with npx storybook@latest init.

---

## 🔒 Security Notes

- Keep GOOGLE_SERVICE_ACCOUNT_JSON secret; never commit .env files
- Share the Sheet only with the service account email
- APP_ACCESS_TOKEN is a shared secret; rotate periodically

---

## 🗺️ Roadmap

- Inline edit/delete on Transactions
- Budget targets & variance
- Recurring transactions helper
- CSV import/export
- Optional OAuth-based auth
