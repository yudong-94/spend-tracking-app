import { AUTH_STORAGE_KEY } from "@/state/auth";

function getToken(): string {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function withAuth(init: RequestInit = {}): RequestInit {
  const token = getToken();
  // Optional: fail fast if there’s no key
  if (!token) {
    // Let callers decide what to do (we’ll handle it in the cache)
    const err = new Error("missing_access_key");
    throw Object.assign(err, { code: "NO_KEY" as const });
  }
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  };
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = new Error(`http_${res.status}`);
    throw Object.assign(err, { status: res.status });
  }
  return res.json() as Promise<T>;
}

export type NewTransaction = {
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  category: string;
  amount: number;
  description?: string;
};

export type TransactionResponse = {
  id?: string;
  date: string;
  type: "income" | "expense";
  category: string;
  description?: string;
  amount: number;
};

export type BudgetResponse = {
  month: string;
  totalBudget: number;
  totalActualMTD: number;
  totalRemaining: number;
  manualTotal: number;
  manualNote: string;
  manualItems?: Array<{ amount: number; notes: string }>;
  overAllocated: boolean;
  series: Array<{ day: number; cumActual: number | null }>;
  rows: Array<{
    category: string;
    budget: number;
    actual: number;
    remaining: number;
    source: "avg-12" | "last-month" | "derived";
  }>;
};

type Period = { start?: string; end?: string };

function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(path, window.location.origin); // same-origin: /api/*
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

export async function listTransactions(period?: Period) {
  const res = await fetch(buildUrl("/api/transactions", period), withAuth());
  return jsonOrThrow<TransactionResponse[]>(res);
}

export type CreateTransactionResponse = { ok: true; id: string };

export async function createTransaction(tx: NewTransaction) {
  const res = await fetch(
    "/api/transactions",
    withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    }),
  );
  return jsonOrThrow<CreateTransactionResponse>(res);
}

export async function updateTransaction(input: Partial<NewTransaction> & { id: string }) {
  const res = await fetch(
    "/api/transactions",
    withAuth({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return jsonOrThrow<{ ok: true; id: string }>(res);
}

export async function deleteTransaction(id: string) {
  const res = await fetch(buildUrl("/api/transactions", { id }), withAuth({ method: "DELETE" }));
  return jsonOrThrow<{ ok: true; id: string }>(res);
}

export async function getSummary(period?: Period) {
  const res = await fetch(buildUrl("/api/summary", period), withAuth());
  return jsonOrThrow<{ totalIncome: number; totalExpense: number; netCashFlow: number }>(res);
}

export async function getBreakdown(type: "income" | "expense", period?: Period) {
  const res = await fetch(buildUrl("/api/breakdown", { type, ...period }), withAuth());
  return jsonOrThrow<Array<{ category: string; amount: number }>>(res);
}

export type Category = { id: string; name: string; type: "income" | "expense" };
export type ComparisonCategory = {
  category: string;
  type: "income" | "expense";
  amountA: number;
  amountB: number;
  delta: number;
  pct: number | null;
};

export type ComparisonWaterfallStep = {
  label: string;
  kind: "baseline" | "category" | "result";
  type: "income" | "expense" | "net";
  delta: number;
  net: number;
};

export type ComparisonResponse = {
  periodA: { start?: string; end?: string; totals: { income: number; expense: number; net: number } };
  periodB: { start?: string; end?: string; totals: { income: number; expense: number; net: number } };
  categories: ComparisonCategory[];
  waterfall: ComparisonWaterfallStep[];
};

export async function getComparison(params?: { aStart?: string; aEnd?: string; bStart?: string; bEnd?: string }) {
  const res = await fetch(buildUrl("/api/comparison", params), withAuth());
  return jsonOrThrow<ComparisonResponse>(res);
}

export async function listCategories() {
  const res = await fetch("/api/categories", withAuth());
  return jsonOrThrow<Category[]>(res);
}

export async function getBudget(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  const res = await fetch(`/api/budget${qs}`, { headers: withAuth({}).headers });
  if (!res.ok) throw new Error(`getBudget failed: ${res.status}`);
  return res.json() as Promise<BudgetResponse>;
}

// Save/append a budget override for a month
export async function createBudgetOverride(input: {
  amount: number;
  notes?: string;
  month?: string; // optional; server defaults to current month
}) {
  const res = await fetch(
    "/api/budget",
    withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  if (!res.ok) throw new Error(`budgets POST failed: ${res.status}`);
  return res.json();
}
