import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { listTransactions, listCategories, getBudget } from "@/lib/api";
import type { Category, TransactionResponse, BudgetResponse } from "@/lib/api";
import { useAuth } from "@/state/auth";

export type Tx = TransactionResponse;

// Minimal shape for Budget response (current month)
export type BudgetResp = BudgetResponse;

type Ctx = {
  txns: Tx[];
  isLoading: boolean;
  lastSyncAt?: number;
  refresh: () => Promise<void>;
  addLocal: (tx: Tx) => void;
  removeLocal: (id: string) => void;
  categories: Category[];
  getCategories: (type?: "income" | "expense") => Category[];
  // Budget cache (current month)
  budget: BudgetResp | null;
  isBudgetLoading: boolean;
  refreshBudget: () => Promise<void>;
  getSummary: (
    start?: string,
    end?: string,
  ) => {
    totalIncome: number;
    totalExpense: number;
    netCashFlow: number;
  };
  getBreakdown: (
    type: "income" | "expense",
    start?: string,
    end?: string,
  ) => Array<{ category: string; amount: number }>;
  getMonthlySeries: (
    start?: string,
    end?: string,
    category?: string,
  ) => Array<{ month: string; income: number; expense: number; net: number }>;
};

const DataCacheContext = createContext<Ctx>({
  txns: [],
  isLoading: true,
  lastSyncAt: undefined,
  refresh: async () => {},
  addLocal: () => {},
  removeLocal: () => {},
  categories: [],
  getCategories: () => [],
  budget: null,
  isBudgetLoading: false,
  refreshBudget: async () => {},
  getSummary: () => ({ totalIncome: 0, totalExpense: 0, netCashFlow: 0 }),
  getBreakdown: () => [],
  getMonthlySeries: () => [],
});

const LS_KEY = "st-cache-v2";
const LS_BUDGET_KEY = "st-budget-v1"; // separate key to avoid migrations
const STALE_MS = 5 * 60 * 1000; // 5 minutes
const BUDGET_STALE_MS = 5 * 60 * 1000; // 5 minutes (tweak as needed)

type PersistShape = { txns: Tx[]; lastSyncAt: number; categories: Category[] };

function loadFromStorage(): PersistShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistShape;
  } catch (error) {
    console.debug("Unable to read cached transactions", error);
    return null;
  }
}
function saveToStorage(txns: Tx[], lastSyncAt: number, categories: Category[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ txns, lastSyncAt, categories }));
  } catch (error) {
    console.debug("Unable to persist cached transactions", error);
  }
}

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
  const { token, clear } = useAuth();
  const [txns, setTxns] = useState<Tx[]>([]);
  const [isLoading, setLoading] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | undefined>();
  const [categories, setCategories] = useState<Category[]>([]);
  // Budget state (current month)
  const [budget, setBudget] = useState<BudgetResp | null>(null);
  const [isBudgetLoading, setBudgetLoading] = useState(false);
  const [budgetLastSyncAt, setBudgetLastSyncAt] = useState<number | undefined>();

  const refresh = useCallback(async () => {
    if (!token) {
      // no key -> don’t hit API, don’t spin
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [rows, cats] = await Promise.all([listTransactions({}), listCategories()]);
      setTxns(rows);

      // If Categories sheet is empty for some reason, derive fallback from txns
      const fallback = rows.reduce((acc, r) => {
        const key = `${r.type}:${r.category}`;
        if (!acc.has(key)) acc.set(key, { id: key, name: r.category, type: r.type });
        return acc;
      }, new Map<string, Category>());
      const usableCats = cats.length ? cats : Array.from(fallback.values());

      setCategories(usableCats);
      const ts = Date.now();
      setLastSyncAt(ts);
      saveToStorage(rows, ts, usableCats);
    } catch (error) {
      // Missing key: just stop; AccessGate will show if token isn’t set
      if (
        error instanceof Error &&
        (error.message === "missing_access_key" || (error as { code?: string }).code === "NO_KEY")
      ) {
        return;
      }
      // Server says unauthorized -> wipe key so gate re-appears
      if ((error as { status?: number }).status === 401) {
        clear();
        return;
      }
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [token, clear]);

    const sortCats = (a: Category, b: Category) => {
    if (a.type !== b.type) return a.type === "expense" ? -1 : 1; // expenses first
    return a.name.localeCompare(b.name);
  };

  const getCategories = useCallback(
    (type?: "income" | "expense") =>
      (categories || [])
        .filter((c) => !type || c.type === type)
        .slice()
        .sort(sortCats),
    [categories],
  );

  // Prefetch and cache current-month budget
  const refreshBudget = useCallback(async () => {
    if (!token) return;
    setBudgetLoading(true);
    try {
      const d = await getBudget();
      setBudget(d);
      const ts = Date.now();
      setBudgetLastSyncAt(ts);
      try {
        localStorage.setItem(LS_BUDGET_KEY, JSON.stringify({ data: d, ts }));
      } catch (error) {
        console.debug("Unable to persist budget cache", error);
      }
    } catch (error) {
      if ((error as { status?: number }).status === 401) clear();
      console.error(error);
    } finally {
      setBudgetLoading(false);
    }
  }, [token, clear]);


// Initial hydrate from localStorage, load when token becomes available, then refresh if stale
  useEffect(() => {
    // hydrate from localStorage immediately (no network)
    const persisted = loadFromStorage();
    if (persisted) {
      setTxns(persisted.txns);
      setCategories(persisted.categories || []);
      setLastSyncAt(persisted.lastSyncAt);
    }
    // hydrate budget from its own storage
    try {
      const raw = localStorage.getItem(LS_BUDGET_KEY);
      if (raw) {
        const b = JSON.parse(raw) as { data: BudgetResp; ts: number };
        setBudget(b.data);
        setBudgetLastSyncAt(b.ts);
      }
    } catch (error) {
      console.debug("Unable to hydrate budget cache", error);
    }
    if (!token) {
      // no token -> ensure not “stuck” loading
      setLoading(false);
      return;
    }
    // only fetch when we actually have a token
    if (token) {
      const stale =
        !persisted ||
        Date.now() - (persisted.lastSyncAt || 0) > STALE_MS ||
        !persisted.categories?.length;
      if (stale) void refresh();
      // prefetch budget too
      const budgetStale =
        !budget || !budgetLastSyncAt || Date.now() - budgetLastSyncAt > BUDGET_STALE_MS;
      if (budgetStale) void refreshBudget();
    }
  }, [token, refresh, budget, budgetLastSyncAt, refreshBudget]);

  // Optimistic local add (used after POST)
  const addLocal = useCallback(
    (tx: Tx) => {
      setTxns((prev) => {
        // Keep newest first to align with API ordering and UI expectations
        const next = [tx, ...prev].sort((a, b) => b.date.localeCompare(a.date));
        saveToStorage(next, lastSyncAt ?? Date.now(), categories);
        return next;
      });
    },
    [lastSyncAt, categories],
  );

  const removeLocal = useCallback(
    (id: string) => {
      setTxns((prev) => {
        const next = prev.filter((tx) => tx.id !== id);
        if (next.length === prev.length) return prev;
        saveToStorage(next, lastSyncAt ?? Date.now(), categories);
        return next;
      });
    },
    [lastSyncAt, categories],
  );

  const filter = useCallback(
    (start?: string, end?: string) =>
      txns.filter((r) => (!start || r.date >= start) && (!end || r.date <= end)),
    [txns],
  );

  const getSummary: Ctx["getSummary"] = useCallback(
    (start, end) => {
      const rows = filter(start, end);
      let income = 0,
        expense = 0;
      for (const r of rows) r.type === "income" ? (income += r.amount) : (expense += r.amount);
      return { totalIncome: income, totalExpense: expense, netCashFlow: income - expense };
    },
    [filter],
  );

  const getBreakdown: Ctx["getBreakdown"] = useCallback(
    (type, start, end) => {
      const rows = filter(start, end).filter((r) => r.type === type);
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.category, (map.get(r.category) || 0) + r.amount);
      return Array.from(map, ([category, amount]) => ({ category, amount })).sort(
        (a, b) => b.amount - a.amount,
      );
    },
    [filter],
  );

  const getMonthlySeries: Ctx["getMonthlySeries"] = useCallback(
    (start, end, category) => {
      const rows = filter(start, end).filter((r) => !category || r.category === category);
      const by = new Map<string, { month: string; income: number; expense: number; net: number }>();
      for (const r of rows) {
        const m = r.date.slice(0, 7);
        const p = by.get(m) ?? { month: m, income: 0, expense: 0, net: 0 };
        r.type === "income" ? (p.income += r.amount) : (p.expense += r.amount);
        p.net = p.income - p.expense;
        by.set(m, p);
      }
      return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
    },
    [filter],
  );

  const value: Ctx = useMemo(
    () => ({
      txns,
      isLoading,
      lastSyncAt,
      refresh,
      addLocal,
      removeLocal,
      categories,
      getCategories,
      budget,
      isBudgetLoading,
      refreshBudget,
      getSummary,
      getBreakdown,
      getMonthlySeries,
    }),
    [
      txns,
      isLoading,
      lastSyncAt,
      refresh,
      addLocal,
      removeLocal,
      categories,
      getCategories,
      budget,
      isBudgetLoading,
      refreshBudget,
      getSummary,
      getBreakdown,
      getMonthlySeries,
    ],
  );

  return <DataCacheContext.Provider value={value}>{children}</DataCacheContext.Provider>;
}

export const useDataCache = () => useContext(DataCacheContext);
export {};
