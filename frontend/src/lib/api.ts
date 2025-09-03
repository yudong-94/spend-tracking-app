// frontend/src/lib/api.ts
export type Transaction = {
    Date: string;                 // "YYYY-MM-DD"
    Type: "Income" | "Expense";
    Category: string;
    Amount: number;
    Account?: string;
    Description?: string;
    // columns H–K are computed in the sheet; you don't send them
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
    const res = await fetch(buildUrl("/api/transactions", period));
    if (!res.ok) throw new Error(`listTransactions failed: ${res.status}`);
    return res.json() as Promise<any[]>; // array of row objects (keys from header row)
  }
  
  export async function createTransaction(t: Transaction) {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    });
    if (!res.ok) throw new Error(`createTransaction failed: ${res.status}`);
    return res.json();
  }
  
  export async function getSummary(period?: Period) {
    const res = await fetch(buildUrl("/api/summary", period));
    if (!res.ok) throw new Error(`getSummary failed: ${res.status}`);
    return res.json() as Promise<{ totalIncome: number; totalExpense: number; netCashFlow: number }>;
  }
  
  export async function getBreakdown(
    type: "income" | "expense",
    period?: Period
  ) {
    const res = await fetch(buildUrl("/api/breakdown", { type, ...period }));
    if (!res.ok) throw new Error(`getBreakdown failed: ${res.status}`);
    return res.json() as Promise<Array<{ category: string; amount: number }>>;
  }