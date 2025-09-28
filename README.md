# Spend Tracker (Google Sheets + Vercel)

Spend Tracker is a fast, low-cost personal finance app that stores data in Google Sheets and serves the API through Vercel Serverless Functions. The frontend is built with Vite, React, TypeScript, and Tailwind CSS, and visualizations are rendered with Recharts.

See `GOOGLE_SHEETS_SETUP.md` for a detailed walkthrough on preparing your spreadsheet and Google service account.

## ✨ Features

- Dashboard: month-to-date and year-to-date cards (income, expense, net) plus category breakdowns
- Analytics: monthly/annual totals, savings rate, YoY pacing, and side-by-side period comparison
- Transactions: instant search, multi-select category filters, quick ranges, inline edit/delete, and paginated tables
- Add Transaction: keyboard-friendly form with recent-category chips and rich currency input
- Budget: automatic target based on the last 12 complete months, manual overrides, and cumulative pacing chart
- Access control & caching: simple bearer-token gate, optimistic updates, and a localStorage-backed cache with manual refresh

---

## 🧰 Requirements

- Node.js 18+ and npm 9+ (npm workspaces are enabled)
- A Google Cloud project with the Sheets API enabled and a service account key
- A Google Sheet prepared with the tabs and headers below
- (Local dev) Vercel CLI (`npx vercel`) for running serverless functions locally

---

## 🗂️ Google Sheets Tabs

- Transactions (header row): `ID | Date | Amount | Type | Category | Description | Created At | Updated At`
  - `Type` must be `income` or `expense` (lowercase)
  - `Amount` should use the Number format in Sheets
  - `Created At`/`Updated At` are timestamps maintained by the API
- Categories: `ID | Name | Type`
- Budgets (optional but required for budget features): `Month (YYYY-MM) | Amount | Notes`
  - You can add multiple override rows per month; amounts are summed

Share the sheet with your service account email as an **Editor** so the API can read and write.

---

## 🔐 Environment Variables

Configure these variables in Vercel (Project → Settings → Environment Variables) and in `frontend/.env.local` when developing locally with `vercel dev`:

| Name | Description | Required | Default |
| --- | --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Entire service account JSON, stringified on one line (escape `\n` in `private_key`) | Yes | — |
| `GOOGLE_SHEETS_ID` | Spreadsheet ID from the Google Sheets URL | Yes | — |
| `GOOGLE_SHEETS_TAB` | Transactions tab name | Optional | `Transactions` |
| `GOOGLE_SHEETS_BUDGETS_TAB` | Budgets tab name | Optional | `Budgets` |
| `APP_ACCESS_TOKEN` | Shared secret used by both the API and UI access gate | Yes (recommended) | — |

The UI prompts users for an access key on first load and keeps it in `localStorage`. Enter the same value you configure for `APP_ACCESS_TOKEN`.

### Optional: legacy Express backend

The `backend/` workspace exposes an Express API primarily for custom integrations and isn’t required for the default Vercel deployment. If you need it, provide these variables via `backend/.env`:

- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_CREDENTIALS_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY` (use literal `\n` escapes)
- `GOOGLE_SHEETS_TRANSACTIONS_RANGE` (default `Transactions!A:F`)
- `GOOGLE_SHEETS_CATEGORIES_RANGE` (default `Categories!A:E`)
- `CORS_ORIGIN`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`

---

## ▶️ Local Development

Running the UI and serverless API together (recommended):

1. From the repo root, install dependencies (npm workspaces handle all packages):
   ```bash
   npm install
   ```
2. Create `frontend/.env.local` and populate it with the environment variables listed above.
3. Start the Vercel dev server from the frontend workspace:
   ```bash
   cd frontend
   npx vercel dev
   ```
   The first run will prompt you to log in or link a project; follow the CLI prompts.
4. Visit `http://localhost:3000`. When prompted for an access key, use the value of `APP_ACCESS_TOKEN`.

> Tip: `vercel dev` serves both the Vite SPA and the serverless routes under `/api/*`, matching the production deployment.

### Other workflows

- **Frontend only (expects a remote API):** `npm run dev --workspace=frontend`
- **Express backend (legacy/optional):** `npm run dev --workspace=backend`
  - Note: the Express backend does not expose the analytics/budget routes that the UI expects. Use `vercel dev` for the complete experience.

---

## ☁️ Deploy (Vercel)

- Project root: `frontend`
- Build command: `npm run build`
- Output directory: `dist`
- Set the environment variables listed above in the Vercel project settings
- The serverless API lives under `frontend/api/*` and is auto-deployed; `vercel.json` handles SPA fallbacks and `/api/*` rewrites

---

## 🧱 Project Structure

```
frontend/
  api/
    _lib/
      sheets.ts            # Google Sheets helpers (read/append/update/delete)
      auth.ts              # Bearer-token validation against APP_ACCESS_TOKEN
    transactions.ts        # CRUD for transactions
    summary.ts             # Aggregate income/expense summaries
    breakdown.ts           # Category breakdown
    categories.ts          # Categories tab reader
    budget.ts              # Budget computation + manual overrides
  src/
    components/
      AccessGate.tsx
      CategorySelect.tsx
      CombinedMonthlyChart.tsx
      CurrencyInput.tsx
      Layout.tsx
      PageHeader.tsx
      RefreshButton.tsx
    lib/
      api.ts               # Client-side fetch helpers
      chart.ts             # Recharts utilities
      colors.ts            # Shared color palette
      date-range.ts        # Quick-range presets & helpers
      format.ts            # Currency/number formatting
    pages/
      Dashboard.tsx
      Analytics.tsx
      Transactions.tsx
      AddTransaction.tsx
      Budget.tsx
    state/
      auth.tsx             # Access token storage
      data-cache.tsx       # Local cache, summaries, budget helpers
backend/                  # Optional Express API for custom integrations
shared/                   # Shared types/utilities consumed by backend/frontend
```

---

## 🧮 API Overview (serverless)

All routes require `Authorization: Bearer <APP_ACCESS_TOKEN>` if the token is set.

- `GET /api/transactions?start=YYYY-MM-DD&end=YYYY-MM-DD&type=income|expense&category=Cat&q=search`
- `POST /api/transactions` → `{ date, type: "income"|"expense", category, amount, description? }`
- `PUT /api/transactions` → `{ id, ...fields }` (partial updates)
- `DELETE /api/transactions?id=spend-123`
- `GET /api/summary?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/breakdown?type=income|expense&start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/comparison?aStart=YYYY-MM-DD&aEnd=YYYY-MM-DD&bStart=YYYY-MM-DD&bEnd=YYYY-MM-DD`
- `GET /api/categories`
- `GET /api/budget?month=YYYY-MM`
- `POST /api/budget` → `{ amount: number, notes?: string, month?: YYYY-MM }`

IDs are generated as `spend-####` when missing, and the API normalizes headers when reading from Sheets.

---

## 🧠 Caching & Refresh

- Local data is cached in `localStorage` (transactions, categories, budget) for instant reloads
- Manual Refresh button invalidates the cache and refetches data
- Optimistic updates keep the UI responsive when creating, editing, or deleting transactions

---

## 🎨 UI Details

- Currency is rendered as signed USD (`+` income / `−` expense)
- Badges: 🟢 income / 🔴 expense / 📘 net on charts
- Quick date ranges (This Month, Last 30 Days, YTD, etc.) persist per user
- Category dropdowns provide multi-select in Analytics/Transactions and single-select in Add Transaction
- Dashboard charts show the top categories and group the rest as “Other”

---

## 🛠️ Dev & Tooling

- Format everything: `npm run format`
- Check formatting only: `npm run format:check`
- Frontend lint: `npm run lint --workspace=frontend`
- Frontend build: `npm run build --workspace=frontend`
- Preview production build: `npm run preview --workspace=frontend`

Storybook isn’t configured, but you can bootstrap it with `npx storybook@latest init` if desired.

---

## 🔒 Security Notes

- Keep `GOOGLE_SERVICE_ACCOUNT_JSON` secret; never commit `.env` files
- Share the Sheet only with the service account email
- Rotate `APP_ACCESS_TOKEN` periodically; all clients must re-enter the new key

---

## 🗺️ Roadmap

- Budget variance alerts and target tracking
- Recurring transaction helper
- CSV import/export
- Optional OAuth-based authentication
