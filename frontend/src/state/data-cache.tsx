// frontend/src/state/data-cache.tsx
import React, {
    createContext, useCallback, useContext, useEffect, useMemo, useState,
  } from "react";
  import { listTransactions } from "@/lib/api";
  
  export type Tx = {
    id?: string;
    date: string;                       // YYYY-MM-DD
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
    getSummary: () => ({ totalIncome: 0, totalExpense: 0, netCashFlow: 0 }),
    getBreakdown: () => [],
    getMonthlySeries: () => [],
  });
  
  export function DataCacheProvider({ children }: { children: React.ReactNode }) {
    const [txns, setTxns] = useState<Tx[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [lastSyncAt, setLastSyncAt] = useState<number | undefined>();
  
    const load = useCallback(async () => {
      setLoading(true);
      try {
        const rows = await listTransactions({});
        setTxns(rows as Tx[]);
        setLastSyncAt(Date.now());
      } finally {
        setLoading(false);
      }
    }, []);
  
    useEffect(() => { void load(); }, [load]);
  
    const filter = useCallback((start?: string, end?: string) => {
      return txns.filter(r => (!start || r.date >= start) && (!end || r.date <= end));
    }, [txns]);
  
    const getSummary: Ctx["getSummary"] = useCallback((start, end) => {
      const rows = filter(start, end);
      let income = 0, expense = 0;
      for (const r of rows) {
        if (r.type === "income") income += r.amount;
        else expense += r.amount;
      }
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
        const m = r.date.slice(0, 7); // YYYY-MM
        const p = by.get(m) ?? { month: m, income: 0, expense: 0, net: 0 };
        if (r.type === "income") p.income += r.amount; else p.expense += r.amount;
        p.net = p.income - p.expense;
        by.set(m, p);
      }
      return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
    }, [filter]);
  
    const value: Ctx = useMemo(() => ({
      txns, isLoading, lastSyncAt,
      refresh: load,
      getSummary, getBreakdown, getMonthlySeries,
    }), [txns, isLoading, lastSyncAt, load, getSummary, getBreakdown, getMonthlySeries]);
  
    return <DataCacheContext.Provider value={value}>{children}</DataCacheContext.Provider>;
  }
  
  export const useDataCache = () => useContext(DataCacheContext);
  
  // ensure this file is treated as a module in any TS config
  export {};