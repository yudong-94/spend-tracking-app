import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import { fmtUSD } from "@/lib/format";
import { COL } from "@/lib/colors";
import RefreshButton from "@/components/RefreshButton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Legend
} from "recharts";

type Tx = { date: string; type: "income" | "expense"; category: string; amount: number };
type Point = { month: string; income: number; expense: number; net: number };

const ym = (d: string) => d.slice(0, 7);
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Analytics() {
  const { txns: all, getCategories } = useDataCache();
  const catOptions = getCategories();
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [category, setCategory] = useState<string>("");

  // no fetching here – data comes from cache

  // Existing filtered series for the bar charts (respects start/end + category)
  const filtered = useMemo<Tx[]>(() => {
    return all.filter((r: Tx) => {
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      if (category && r.category !== category) return false;
      return true;
    });
  }, [all, start, end, category]);

  const series: Point[] = useMemo<Point[]>(() => {
    const by = new Map<string, Point>();
    for (const r of filtered as Tx[]) {
      const key = ym(r.date);
      const p = by.get(key) ?? { month: key, income: 0, expense: 0, net: 0 };
      if (r.type === "income") p.income += r.amount; else p.expense += r.amount;
      p.net = p.income - p.expense;
      by.set(key, p);
    }
    return [...by.values()].sort((a,b) => a.month.localeCompare(b.month));
  }, [filtered]);

 // --- YoY cumulative net (Jan..Dec). Ignores start/end; applies category filter.
 const yoyData = useMemo(() => {
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const cutoffIdx = now.getMonth(); // 0-based: current month index

  // monthly nets for both years (12 buckets each)
  const monthly: Record<number, number[]> = {
    [thisYear]: Array(12).fill(0),
    [lastYear]: Array(12).fill(0),
  };

  for (const r of all as Tx[]) {
    const y = Number(r.date.slice(0, 4));
    if (y !== thisYear && y !== lastYear) continue;
    if (category && r.category !== category) continue;
    const mIdx = Number(r.date.slice(5, 7)) - 1; // 0..11
    const delta = r.type === "income" ? r.amount : -r.amount;
    monthly[y][mIdx] += delta;
  }

  // cumulative series
  const cumThis: (number | null)[] = Array(12).fill(null);
  const cumLast: number[] = Array(12).fill(0);
  let accT = 0, accL = 0;
  for (let i = 0; i < 12; i++) {
    accL += monthly[lastYear][i] || 0;      // full year
    cumLast[i] = accL;

    if (i <= cutoffIdx) {                   // YTD only
      accT += monthly[thisYear][i] || 0;
      cumThis[i] = accT;
    } else {
      cumThis[i] = null;                    // makes the line stop after current month
    }
  }

  return Array.from({ length: 12 }, (_, i) => ({
    label: MONTHS[i],                       // Jan..Dec
    thisYear: cumThis[i],
    lastYear: cumLast[i],
  }));
}, [all, category]);


  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <RefreshButton />
      </div>
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
        <select
          className="border rounded px-3 py-2"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Category</option>
          <optgroup label="Expenses">
            {catOptions
              .filter((c) => c.type === "expense")
              .map((c) => (
                <option key={c.id} value={c.name}>
                  🔴 {c.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Income">
            {catOptions
              .filter((c) => c.type === "income")
              .map((c) => (
                <option key={c.id} value={c.name}>
                  🟢 {c.name}
                </option>
              ))}
          </optgroup>
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
              <Bar dataKey="income" fill={COL.income} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Expenses */}
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly total expenses</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Bar dataKey="expense" fill={COL.expense} radius={[4,4,0,0]} />
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
              <Bar dataKey="net" fill={COL.net} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NEW: YoY cumulative net (YTD) */}
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">YoY cumulative net (YTD)</h3>
        <div className="text-xs text-neutral-500 mb-2">
          Category filter applies; date range is ignored for this comparison.
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yoyData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="thisYear" name={`${new Date().getFullYear()} YTD`}
                    stroke={COL.net} strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="lastYear" name={`${new Date().getFullYear()-1} (full)`}
                    stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}