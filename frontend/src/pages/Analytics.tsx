import { useEffect, useMemo, useState } from "react";
import { listTransactions } from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Tx = { date: string; type: "income" | "expense"; category: string; amount: number };
type Point = { month: string; income: number; expense: number; net: number };

const ym = (d: string) => d.slice(0, 7);

export default function Analytics() {
  const [all, setAll] = useState<Tx[]>([]);
  const [start, setStart] = useState<string>(""); // YYYY-MM-DD
  const [end, setEnd] = useState<string>("");     // YYYY-MM-DD
  const [category, setCategory] = useState<string>("");

  useEffect(() => {
    listTransactions({}).then(setAll).catch(console.error);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(all.map(r => r.category))).sort(),
    [all]
  );

  const filtered = useMemo(() => {
    return all.filter(r => {
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      if (category && r.category !== category) return false;
      return true;
    });
  }, [all, start, end, category]);

  const series: Point[] = useMemo(() => {
    const by = new Map<string, Point>();
    for (const r of filtered) {
      const key = ym(r.date);
      const p = by.get(key) ?? { month: key, income: 0, expense: 0, net: 0 };
      if (r.type === "income") p.income += r.amount; else p.expense += r.amount;
      p.net = p.income - p.expense;
      by.set(key, p);
    }
    return [...by.values()].sort((a,b) => a.month.localeCompare(b.month));
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="grid">
          <label className="text-sm">Start</label>
          <input type="date" className="border rounded px-3 py-2" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="grid">
          <label className="text-sm">End</label>
          <input type="date" className="border rounded px-3 py-2" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <div className="grid">
          <label className="text-sm">Category</label>
          <select className="border rounded px-3 py-2" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Monthly Income */}
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly total income</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Bar dataKey="income" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Expense */}
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly total expenses</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Bar dataKey="expense" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Net */}
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly net</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Bar dataKey="net" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}