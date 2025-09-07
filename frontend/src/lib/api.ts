import { AUTH_STORAGE_KEY } from "@/state/auth";

function getToken(): string {
    try { return localStorage.getItem(AUTH_STORAGE_KEY) || ""; } catch { return ""; }
  }

function withAuth(init: RequestInit = {}): RequestInit {
  const token = getToken();
  // Optional: fail fast if there’s no key
  if (!token) {
    // Let callers decide what to do (we’ll handle it in the cache)
    const err: any = new Error("missing_access_key");
    err.code = "NO_KEY";
    throw err;
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

async function jsonOrThrow(res: Response) {
    if (!res.ok) {
      const err: any = new Error(`http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
}

export type NewTransaction = {
  date: string;                       // YYYY-MM-DD
  type: "income" | "expense";
  category: string;
  amount: number;
  description?: string;
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
    return jsonOrThrow(res);
}
  
export type CreateTransactionResponse = { ok: true; id: string };

export async function createTransaction(tx: NewTransaction) {
    const res = await fetch("/api/transactions", withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    }));
    return jsonOrThrow(res);
}
  
export async function getSummary(period?: Period) {
    const res = await fetch(buildUrl("/api/summary", period), withAuth());
    return jsonOrThrow(res);
}
  
export async function getBreakdown(
    type: "income" | "expense",
    period?: Period
  ) {
    const res = await fetch(buildUrl("/api/breakdown", { type, ...period }), withAuth());
    return jsonOrThrow(res);
}

  export type Category = { id: string; name: string; type: "income" | "expense" };

export async function listCategories() {
    const res = await fetch("/api/categories", withAuth());
    return jsonOrThrow(res);
  }
  
 
export async function getBudget(month?: string) {
    const qs = month ? `?month=${encodeURIComponent(month)}` : "";
    const res = await fetch(`/api/budget${qs}`, { headers: withAuth({}).headers });
    if (!res.ok) throw new Error(`getBudget failed: ${res.status}`);
    return res.json() as Promise<{
      month: string;
      totalBudget: number;
      totalActualMTD: number;
      totalRemaining: number;
      manualTotal: number;
      manualNote: string;
      overAllocated: boolean;
      series: Array<{ day: number; cumActual: number }>;
      rows: Array<{
        category: string;
        budget: number;
        actual: number;
        remaining: number;
        source: "median-12" | "last-month" | "derived";
      }>;
    }>;
  }
  
  export async function createBudgetOverride(input: { month?: string; amount: number; notes?: string }) {
    const res = await fetch("/api/budget-override", {
      method: "POST",
      headers: { ...withAuth({}).headers, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`budget-override failed: ${res.status}`);
    return res.json();
  }