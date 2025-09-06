import { AUTH_STORAGE_KEY } from "@/state/auth";

function withAuth(init: RequestInit = {}): RequestInit {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEY) : "";
  return {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  };
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
    if (!res.ok) throw new Error(`listTransactions failed: ${res.status}`);
    return res.json() as Promise<any[]>; // array of row objects (keys from header row)
  }
  
  export type CreateTransactionResponse = { ok: true; id: string };

  export async function createTransaction(tx: NewTransaction) {
    const res = await fetch("/api/transactions", withAuth({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tx),
    }));
    if (!res.ok) throw new Error(`createTransaction failed: ${res.status}`);
    return res.json() as Promise<CreateTransactionResponse>;
  }
  
  export async function getSummary(period?: Period) {
    const res = await fetch(buildUrl("/api/summary", period), withAuth());
    if (!res.ok) throw new Error(`getSummary failed: ${res.status}`);
    return res.json() as Promise<{ totalIncome: number; totalExpense: number; netCashFlow: number }>;
  }
  
  export async function getBreakdown(
    type: "income" | "expense",
    period?: Period
  ) {
    const res = await fetch(buildUrl("/api/breakdown", { type, ...period }), withAuth());
    if (!res.ok) throw new Error(`getBreakdown failed: ${res.status}`);
    return res.json() as Promise<Array<{ category: string; amount: number }>>;
  }

  export type Category = { id: string; name: string; type: "income" | "expense" };

  export async function listCategories() {
    const res = await fetch("/api/categories", withAuth());
    if (!res.ok) throw new Error(`listCategories failed: ${res.status}`);
    return res.json() as Promise<Category[]>;
  }
  