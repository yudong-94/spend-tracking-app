import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
  } from "react";
import { listTransactions, listCategories } from "@/lib/api";
import type { Category } from "@/lib/api";
import { useAuth } from "@/state/auth";
  
  export type Tx = {
    id?: string;
    date: string;                         // YYYY-MM-DD
    type: "income" | "expense";
    category: string;
    description?: string;
    amount: number;
  };
  
  type Ctx = {
    txns: Tx[];
    isLoading: boolean;
    lastSyncAt?: number;
    refresh: () => Promise<void>;
    addLocal: (tx: Tx) => void;
    categories: Category[];
    getCategories: (type?: "income"|"expense") => Category[];
    getSummary: (start?: string, end?: string) => {
      totalIncome: number; totalExpense: number; netCashFlow: number;
    };
    getBreakdown: (type: "income" | "expense", start?: string, end?: string)
      => Array<{ category: string; amount: number }>;
    getMonthlySeries: (start?: string, end?: string, category?: string)
      => Array<{ month: string; income: number; expense: number; net: number }>;
  };
  
  const DataCacheContext = createContext<Ctx>({
    txns: [],
    isLoading: true,
    lastSyncAt: undefined,
    refresh: async () => {},
    addLocal: () => {},
    categories: [],
    getCategories: () => [],
    getSummary: () => ({ totalIncome: 0, totalExpense: 0, netCashFlow: 0 }),
    getBreakdown: () => [],
    getMonthlySeries: () => [],
  });
  
  const LS_KEY = "st-cache-v2";
  const STALE_MS = 5 * 60 * 1000; // 5 minutes
  
  type PersistShape = { txns: Tx[]; lastSyncAt: number; categories: Category[] };
  
  function loadFromStorage(): PersistShape | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PersistShape;
    } catch { return null; }
  }
  function saveToStorage(txns: Tx[], lastSyncAt: number, categories: Category[]) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ txns, lastSyncAt, categories })); } catch {}
  }
  
  export function DataCacheProvider({ children }: { children: React.ReactNode }) {
    const { token, clear } = useAuth();
    const [txns, setTxns] = useState<Tx[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [lastSyncAt, setLastSyncAt] = useState<number | undefined>();
    const [lastError, setLastError] = useState<string | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
  
    const refresh = useCallback(async () => {
        if (!token) {               // no key -> don’t hit API, don’t spin
            setLoading(false);
            return;
          }
        setLoading(true);
        setLastError(null);
        try {
            const [rows, cats] = await Promise.all([
                listTransactions({}),
                listCategories(),
            ]);
            setTxns(rows as Tx[]);
        
          // If Categories sheet is empty for some reason, derive fallback from txns
            const fallback =
            (rows as Tx[])
                ?.reduce((acc, r) => {
                const key = `${r.type}:${r.category}`;
                if (!acc.has(key)) acc.set(key, { id: key, name: r.category, type: r.type });
                return acc;
                }, new Map<string, { id: string; name: string; type: "income"|"expense" }>())
                ?? new Map();
            const usableCats = (cats as any[])?.length ? (cats as any[]) : Array.from(fallback.values());

          setCategories(usableCats as Category[]);
          const ts = Date.now();
          setLastSyncAt(ts);
          saveToStorage(rows as Tx[], ts, usableCats as Category[]);
        } catch (e: any) {
            // Missing key: just stop; AccessGate will show if token isn’t set
            if (e?.code === "NO_KEY" || e?.message === "missing_access_key") {
              setLastError("no-key");
              return;
            }
            // Server says unauthorized -> wipe key so gate re-appears
            if (e?.status === 401) {
              setLastError("unauthorized");
              clear();
              return;
            }
            setLastError("fetch-failed");
            console.error(e);
        } finally {
          setLoading(false);
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
        if (!token) {           // no token -> ensure not “stuck” loading
            setLoading(false);
            return;
        }
        // only fetch when we actually have a token
        if (token) {
          const stale = !persisted || Date.now() - (persisted.lastSyncAt || 0) > STALE_MS
                        || !persisted.categories?.length;
          if (stale) void refresh();
        }
      }, [token, refresh]);

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
        [categories]
    );
      
    // Optimistic local add (used after POST)
    const addLocal = useCallback((tx: Tx) => {
      setTxns(prev => {
        const next = [tx, ...prev].sort((a, b) => a.date.localeCompare(b.date));
        saveToStorage(next, lastSyncAt ?? Date.now(), categories);
        return next;
      });
    }, [lastSyncAt, categories]);
  
    const filter = useCallback((start?: string, end?: string) =>
      txns.filter(r => (!start || r.date >= start) && (!end || r.date <= end))
    , [txns]);
  
    const getSummary: Ctx["getSummary"] = useCallback((start, end) => {
      const rows = filter(start, end);
      let income = 0, expense = 0;
      for (const r of rows) r.type === "income" ? income += r.amount : expense += r.amount;
      return { totalIncome: income, totalExpense: expense, netCashFlow: income - expense };
    }, [filter]);
  
    const getBreakdown: Ctx["getBreakdown"] = useCallback((type, start, end) => {
      const rows = filter(start, end).filter(r => r.type === type);
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.category, (map.get(r.category) || 0) + r.amount);
      return Array.from(map, ([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
    }, [filter]);
  
    const getMonthlySeries: Ctx["getMonthlySeries"] = useCallback((start, end, category) => {
      const rows = filter(start, end).filter(r => !category || r.category === category);
      const by = new Map<string, { month: string; income: number; expense: number; net: number }>();
      for (const r of rows) {
        const m = r.date.slice(0, 7);
        const p = by.get(m) ?? { month: m, income: 0, expense: 0, net: 0 };
        r.type === "income" ? (p.income += r.amount) : (p.expense += r.amount);
        p.net = p.income - p.expense;
        by.set(m, p);
      }
      return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
    }, [filter]);
  
    const value: Ctx = useMemo(() => ({
        txns, isLoading, lastSyncAt, refresh, addLocal,
        categories, getCategories,
        getSummary, getBreakdown, getMonthlySeries,
      }), [txns, isLoading, lastSyncAt, lastError, refresh, addLocal, categories, getCategories, getSummary, getBreakdown, getMonthlySeries]);
  
    return <DataCacheContext.Provider value={value}>{children}</DataCacheContext.Provider>;
  }
  
  export const useDataCache = () => useContext(DataCacheContext);
  export {};