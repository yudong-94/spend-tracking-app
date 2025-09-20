import { useEffect, useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import type { Tx } from "@/state/data-cache";
import { fmtUSD } from "@/lib/format";
import { COL } from "@/lib/colors";
import PageHeader from "@/components/PageHeader";
import CategorySelect from "@/components/CategorySelect";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import type { TooltipProps } from "recharts";
import { estimateYAxisWidthFromMax, percentFormatter } from "@/lib/chart";
import CombinedMonthlyChart from "@/components/CombinedMonthlyChart";
import {
  QUICK_RANGE_OPTIONS,
  computeQuickRange,
  isQuickRangeKey,
  type QuickRangeKey,
} from "@/lib/date-range";

// Tooltip for savings rate charts
type SavingsTooltipPayload = TooltipProps<number | string, string>["payload"];

function RateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: SavingsTooltipPayload;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rawValue = payload[0]?.value;
  const v = typeof rawValue === "number" ? rawValue : Number(rawValue);
  return (
    <div className="rounded border bg-white p-2 text-sm shadow">
      <div className="font-medium">{label ?? ""}</div>
      <div>Saving rate: {Number.isFinite(v) ? percentFormatter(v) : "—"}</div>
      <div className="mt-1 text-xs text-slate-500">
        Formula: net ÷ income. Years with zero income are omitted.
      </div>
    </div>
  );
}
type Point = { month: string; income: number; expense: number; net: number };
type YearPoint = { year: string; income: number; expense: number; net: number };

const formatTooltipValue: TooltipProps<number | string, string>["formatter"] = (value) =>
  fmtUSD(typeof value === "number" ? value : Number(value));

const ym = (d: string) => d.slice(0, 7);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MIN_Y_AXIS = 56; // lower bound for Y-axis width

type Tab = "monthly" | "annual" | "breakdown";

export default function Analytics() {
  const { txns: all, getCategories, refresh } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [categories, setCategories] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("monthly");
  const [quickRange, setQuickRange] = useState<QuickRangeKey | "custom">("all");
  // Persist filters + tab selection
  const LS_KEY = "analytics-state-v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        start?: string;
        end?: string;
        categories?: string[];
        tab?: Tab;
        quickRange?: string;
      };
      if (isQuickRangeKey(s.quickRange)) {
        const range = computeQuickRange(s.quickRange);
        setQuickRange(s.quickRange);
        setStart(range.start);
        setEnd(range.end);
      } else {
        if (s.start) setStart(s.start);
        if (s.end) setEnd(s.end);
        setQuickRange("custom");
      }
      if (Array.isArray(s.categories)) setCategories(s.categories);
      if (s.tab) setTab(s.tab);
    } catch (error) {
      console.debug("Unable to load analytics filters", error);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ start, end, categories, tab, quickRange }),
      );
    } catch (error) {
      console.debug("Unable to persist analytics filters", error);
    }
  }, [start, end, categories, tab, quickRange]);

  const applyQuickRange = (key: QuickRangeKey) => {
    const { start: nextStart, end: nextEnd } = computeQuickRange(key);
    setQuickRange(key);
    setStart(nextStart);
    setEnd(nextEnd);
  };

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }

  // no fetching here – data comes from cache

  // Existing filtered series for the bar charts (respects start/end + category)
  const filtered = useMemo<Tx[]>(() => {
    return all.filter((r) => {
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      if (categories.length && !categories.includes(r.category)) return false;
      return true;
    });
  }, [all, start, end, categories]);

  const series: Point[] = useMemo<Point[]>(() => {
    const by = new Map<string, Point>();
    for (const r of filtered as Tx[]) {
      const key = ym(r.date);
      const p = by.get(key) ?? { month: key, income: 0, expense: 0, net: 0 };
      if (r.type === "income") p.income += r.amount;
      else p.expense += r.amount;
      p.net = p.income - p.expense;
      by.set(key, p);
    }
    return [...by.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  // KPI comparisons: vs last month and vs 12‑mo avg
  const kpiCompare = useMemo(() => {
    const n = series.length;
    if (n === 0) return null;
    const cur = series[n - 1];
    const prev = n >= 2 ? series[n - 2] : undefined;
    const tail = n >= 2 ? series.slice(Math.max(0, n - 13), n - 1) : [];
    const avg = tail.length
      ? {
          income: tail.reduce((s, p) => s + (p.income || 0), 0) / tail.length,
          expense: tail.reduce((s, p) => s + (p.expense || 0), 0) / tail.length,
          net: tail.reduce((s, p) => s + (p.net || 0), 0) / tail.length,
        }
      : undefined;

    const rate = (p?: { income: number; net: number } | null) =>
      p && p.income > 0 ? p.net / p.income : null;

    const mk = (now: number, base?: number | null) => {
      if (base == null) return { diff: null as number | null, pct: null as number | null };
      const diff = now - base;
      const pct = base !== 0 ? diff / base : null;
      return { diff, pct };
    };

    const rateComparison = (base?: { income: number; net: number } | null) => {
      const currentRate = rate(cur);
      const baseRate = rate(base);
      return currentRate != null && baseRate != null ? mk(currentRate, baseRate) : null;
    };

    return {
      current: cur,
      prev,
      avg,
      vsLast: prev
        ? {
            income: mk(cur.income, prev.income),
            expense: mk(cur.expense, prev.expense),
            net: mk(cur.net, prev.net),
            rate: rateComparison(prev),
          }
        : null,
      vsAvg12: avg
        ? {
            income: mk(cur.income, avg.income),
            expense: mk(cur.expense, avg.expense),
            net: mk(cur.net, avg.net),
            rate: rateComparison(avg),
          }
        : null,
    } as const;
  }, [series]);

  // Category breakdowns based on current filters
  const incomeCats = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of filtered) {
      if (r.type !== "income") continue;
      by.set(r.category, (by.get(r.category) || 0) + r.amount);
    }
    return [...by.entries()].map(([category, amount]) => ({ category, amount }));
  }, [filtered]);

  const expenseCats = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of filtered) {
      if (r.type !== "expense") continue;
      by.set(r.category, (by.get(r.category) || 0) + r.amount);
    }
    return [...by.entries()].map(([category, amount]) => ({ category, amount }));
  }, [filtered]);

  // Totals across the entire filtered period (used as primary KPI values)
  const totals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const r of filtered) {
      if (r.type === "income") totalIncome += r.amount;
      else totalExpense += r.amount;
    }
    const net = totalIncome - totalExpense;
    return { totalIncome, totalExpense, net };
  }, [filtered]);

  // Savings rate over the filtered period (net ÷ income)
  const periodRate = useMemo(() => {
    return totals.totalIncome > 0 ? totals.net / totals.totalIncome : null;
  }, [totals]);

  // (Overview removed) – no deltas computation needed

  // Annual aggregation (respects start/end + category like monthly)
  const annualSeries: YearPoint[] = useMemo<YearPoint[]>(() => {
    const by = new Map<string, YearPoint>();
    for (const r of filtered) {
      const key = r.date.slice(0, 4); // YYYY
      const p = by.get(key) ?? { year: key, income: 0, expense: 0, net: 0 };
      if (r.type === "income") p.income += r.amount;
      else p.expense += r.amount;
      p.net = p.income - p.expense;
      by.set(key, p);
    }
    return [...by.values()].sort((a, b) => a.year.localeCompare(b.year));
  }, [filtered]);

  // Annual savings rate (net / income)
  const annualRateData = useMemo(() => {
    return annualSeries.map((p) => ({
      year: p.year,
      rate: p.income > 0 ? p.net / p.income : null,
    }));
  }, [annualSeries]);

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

    for (const r of all) {
      const y = Number(r.date.slice(0, 4));
      if (y !== thisYear && y !== lastYear) continue;
      if (categories.length && !categories.includes(r.category)) continue;
      const mIdx = Number(r.date.slice(5, 7)) - 1; // 0..11
      const delta = r.type === "income" ? r.amount : -r.amount;
      monthly[y][mIdx] += delta;
    }

    // cumulative series
    const cumThis: (number | null)[] = Array(12).fill(null);
    const cumLast: number[] = Array(12).fill(0);
    let accT = 0,
      accL = 0;
    for (let i = 0; i < 12; i++) {
      accL += monthly[lastYear][i] || 0; // full year
      cumLast[i] = accL;

      if (i <= cutoffIdx) {
        // YTD only
        accT += monthly[thisYear][i] || 0;
        cumThis[i] = accT;
      } else {
        cumThis[i] = null; // makes the line stop after current month
      }
    }

    return Array.from({ length: 12 }, (_, i) => ({
      label: MONTHS[i], // Jan..Dec
      thisYear: cumThis[i],
      lastYear: cumLast[i],
    }));
  }, [all, categories]);

  return (
    <div className="space-y-6">
      <PageHeader lastUpdated={lastUpdated} onRefresh={onRefresh} isRefreshing={isRefreshing} />
      {/* Filters – desktop */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b py-2 hidden md:block">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="grid w-44">
            <label className="text-sm">Start</label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={start}
              onChange={(e) => {
                setQuickRange("custom");
                setStart(e.target.value);
              }}
            />
          </div>
          <div className="grid w-44">
            <label className="text-sm">End</label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={end}
              onChange={(e) => {
                setQuickRange("custom");
                setEnd(e.target.value);
              }}
            />
          </div>
          <div className="grid w-56">
            <label className="text-sm">Category</label>
            <CategorySelect
              multiple
              value={categories}
              onChange={setCategories}
              options={getCategories()}
              className="w-full"
              placeholder="All Categories"
            />
          </div>
          <div className="flex flex-wrap gap-2 basis-full">
            {QUICK_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => applyQuickRange(opt.key)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  quickRange === opt.key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                aria-pressed={quickRange === opt.key}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <nav className="mt-3 text-sm" role="tablist" aria-label="Analytics sections">
          <div className="flex gap-4">
            {([
              ["monthly", "Monthly"],
              ["annual", "Annual"],
              ["breakdown", "Breakdown"],
            ] as Array<[Tab, string]>).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-1.5 pb-2 transition-colors ${
                  tab === key
                    ? "border-slate-900 text-slate-900 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Filters – mobile collapsible */}
      <MobileAnalyticsFilters
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        categories={categories}
        setCategories={setCategories}
        getCategories={getCategories}
        tab={tab}
        setTab={setTab}
        quickRange={quickRange}
        setQuickRange={setQuickRange}
        applyQuickRange={applyQuickRange}
      />

      {/* KPI cards with comparisons (Monthly: vs last month, Annual: vs 12‑mo avg) */}
      {(tab === "monthly" || tab === "annual") && (
        <section className="grid gap-3 sm:grid-cols-4">
          {(() => {
            if (!kpiCompare) return null;
            const cur = kpiCompare.current;
            const base = tab === "monthly" ? kpiCompare.prev : kpiCompare.avg;
            const vs = tab === "monthly" ? kpiCompare.vsLast : kpiCompare.vsAvg12;
            const label = tab === "monthly" ? "Current vs last month" : "Current vs 12‑mo avg";

            const tipIncome =
              tab === "monthly"
                ? "Income comparison with last month. % change = (this − last) ÷ last. Uses current filters."
                : "Income compared to the average of the last 12 complete months (excludes current). % change = (this − avg) ÷ avg.";
            const tipExpense = tipIncome.replace("Income", "Expense");
            const tipNet =
              tab === "monthly"
                ? "Net (income − expense) vs last month. % change = (this − last) ÷ last."
                : "Net (income − expense) vs 12‑mo average. % change = (this − avg) ÷ avg.";
            const tipRate =
              tab === "monthly"
                ? "Savings rate = net ÷ income. Shows difference in percentage points vs last month. If income is 0, rate is not defined."
                : "Savings rate = net ÷ income. Shows difference in percentage points vs 12‑mo average (excludes current). If income is 0, rate is not defined.";

            const renderPct = (pct: number | null, positiveGood = true) => {
              if (pct == null) return <span className="text-slate-500">—</span>;
              const cls = (positiveGood ? pct >= 0 : pct <= 0) ? "text-emerald-600" : "text-rose-600";
              return <span className={cls}>{percentFormatter(pct)}</span>;
            };
            const fmtPP = (diff: number | null) => {
              if (diff == null) return <span className="text-slate-500">—</span>;
              const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
              const val = Math.abs(Math.round(diff * 100)).toLocaleString();
              const cls = diff >= 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-slate-600";
              return <span className={cls}>{`${sign}${val}pp`}</span>;
            };
            const rateVal = (p: Point | { income: number; net: number } | undefined) =>
              p && p.income > 0 ? p.net / p.income : null;

            return (
              <>
                {/* Income */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <span>Income</span>
                    <TooltipInfo text={tipIncome} />
                  </div>
                  <div className="text-lg font-semibold text-emerald-600">{fmtUSD(totals.totalIncome)}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {label}: {fmtUSD(cur.income)} vs. {base ? fmtUSD(base.income) : "—"} (
                    {renderPct(vs?.income.pct ?? null, true)})
                  </div>
                </div>

                {/* Expense */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <span>Expense</span>
                    <TooltipInfo text={tipExpense} />
                  </div>
                  <div className="text-lg font-semibold text-rose-600">{fmtUSD(totals.totalExpense)}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    {label}: {fmtUSD(cur.expense)} vs. {base ? fmtUSD(base.expense) : "—"} (
                    {renderPct(vs?.expense.pct ?? null, false)})
                  </div>
                </div>

                {/* Net */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <span>Net</span>
                    <TooltipInfo text={tipNet} />
                  </div>
                  <div className={`text-lg font-semibold ${totals.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtUSD(totals.net)}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {label}: {fmtUSD(cur.net)} vs. {base ? fmtUSD(base.net) : "—"} (
                    {renderPct(vs?.net.pct ?? null, true)})
                  </div>
                </div>

                {/* Savings rate */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <span>Savings rate</span>
                    <TooltipInfo text={tipRate} />
                  </div>
                  {(() => {
                    const curR = rateVal(cur);
                    const baseR = base ? rateVal(base) : null;
                    return (
                      <>
                        <div className={`text-lg font-semibold ${periodRate != null && periodRate >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {periodRate == null ? "—" : percentFormatter(periodRate)}
                        </div>
                        <div className="text-xs text-slate-600 mt-1">
                          {label}: {curR == null ? "—" : percentFormatter(curR)} vs. {baseR == null ? "—" : percentFormatter(baseR)} (
                          {fmtPP(vs?.rate.diff ?? null)})
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            );
          })()}
        </section>
      )}

      {/* KPI cards for Breakdown: show totals and top categories */}
      {tab === "breakdown" && (
        <section className="grid gap-3 sm:grid-cols-4">
          {(() => {
            const totalInc = totals.totalIncome;
            const totalExp = totals.totalExpense;
            const topIncome = [...incomeCats]
              .sort((a, b) => (b.amount || 0) - (a.amount || 0))
              .slice(0, 3);
            const topExpense = [...expenseCats]
              .sort((a, b) => (b.amount || 0) - (a.amount || 0))
              .slice(0, 3);

            return (
              <>
                {/* Income */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Income</div>
                  <div className="text-lg font-semibold text-emerald-600">{fmtUSD(totalInc)}</div>
                  <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {totalInc > 0 && topIncome.length > 0 ? (
                      topIncome.map((x) => (
                        <div key={x.category}>
                          {x.category}: {fmtUSD(x.amount)} ({percentFormatter(x.amount / totalInc)})
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">No income</div>
                    )}
                  </div>
                </div>

                {/* Expense */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Expense</div>
                  <div className="text-lg font-semibold text-rose-600">{fmtUSD(totalExp)}</div>
                  <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {totalExp > 0 && topExpense.length > 0 ? (
                      topExpense.map((x) => (
                        <div key={x.category}>
                          {x.category}: {fmtUSD(x.amount)} ({percentFormatter(x.amount / totalExp)})
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-500">No expenses</div>
                    )}
                  </div>
                </div>

                {/* Net */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Net</div>
                  <div className={`text-lg font-semibold ${totals.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmtUSD(totals.net)}
                  </div>
                </div>

                {/* Savings rate */}
                <div className="rounded-lg border bg-white p-3">
                  <div className="text-xs text-slate-500">Savings rate</div>
                  <div className={`text-lg font-semibold ${periodRate != null && periodRate >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {periodRate == null ? "—" : percentFormatter(periodRate)}
                  </div>
                </div>
              </>
            );
          })()}
        </section>
      )}

      {/* Monthly Income */}
      {tab === "monthly" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly total income</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...series.map((p) => p.income || 0)),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="income" fill={COL.income} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Monthly Expenses */}
      {tab === "monthly" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly total expenses</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...series.map((p) => p.expense || 0)),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="expense" fill={COL.expense} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Monthly Net */}
      {tab === "monthly" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly net</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...series.map((p) => Math.abs(p.net || 0))),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="net" fill={COL.net} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Monthly: Combined monthly */}
      {tab === "monthly" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Monthly income vs expense (with net)</h3>
        <CombinedMonthlyChart data={series} />
      </div>
      )}

      {/* Annual Income */}
      {tab === "annual" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Annual total income</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annualSeries} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...annualSeries.map((p) => p.income || 0)),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="income" fill={COL.income} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Annual Expenses */}
      {tab === "annual" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Annual total expenses</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annualSeries} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...annualSeries.map((p) => p.expense || 0)),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="expense" fill={COL.expense} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Annual Net */}
      {tab === "annual" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Annual net</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={annualSeries} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(0, ...annualSeries.map((p) => Math.abs(p.net || 0))),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
          <Tooltip formatter={formatTooltipValue} />
              <Bar dataKey="net" fill={COL.net} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Annual Savings Rate */}
      {tab === "annual" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">Annual savings rate</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={annualRateData} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(
                      0,
                      ...annualRateData.map((d) => (d.rate == null ? 0 : Math.abs(d.rate))),
                    ),
                    (n) => percentFormatter(n),
                  ),
                )}
                tickFormatter={(v: number) => percentFormatter(v)}
              />
              <Tooltip content={<RateTooltip />} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke={COL.net}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* NEW: YoY cumulative net (YTD) */}
      {tab === "annual" && (
      <div className="p-4 rounded-lg border bg-white">
        <h3 className="font-medium mb-2">YoY cumulative net (YTD)</h3>
        <div className="text-xs text-neutral-500 mb-2">
          Category filter applies; date range is ignored for this comparison.
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yoyData} margin={{ left: 16, right: 8, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis
                width={Math.max(
                  MIN_Y_AXIS,
                  estimateYAxisWidthFromMax(
                    Math.max(
                      0,
                      ...yoyData
                        .map((d) => [d.thisYear, d.lastYear])
                        .flat()
                        .filter((x) => x != null)
                        .map((x) => Math.abs(x as number)),
                    ),
                    fmtUSD,
                  ),
                )}
                tickFormatter={(v: number) => fmtUSD(v)}
              />
              <Tooltip formatter={formatTooltipValue} />
              <Legend />
              <Line
                type="monotone"
                dataKey="thisYear"
                name={`${new Date().getFullYear()} YTD`}
                stroke={COL.net}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="lastYear"
                name={`${new Date().getFullYear() - 1} (full)`}
                stroke="#9ca3af"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      )}

      {/* Category breakdown (based on filters) */}
      {tab === "breakdown" && (
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Income by category */}
        <div className="p-4 rounded-lg border bg-white">
          <h3 className="font-medium mb-2">Income by category</h3>
          {(() => {
            const MAX_BARS = 15;
            const sorted = [...incomeCats].sort((a, b) => (b.amount || 0) - (a.amount || 0));
            const othersTotal = sorted.slice(MAX_BARS - 1).reduce((s, x) => s + (x.amount || 0), 0);
            const chartData =
              sorted.length > MAX_BARS
                ? [...sorted.slice(0, MAX_BARS - 1), { category: "Other", amount: othersTotal }]
                : sorted;
            if (chartData.length === 0) return <div className="text-sm text-neutral-500">No data yet.</div>;
            const maxLabelLen = Math.max(0, ...chartData.map((x) => (x.category || "").length));
            const yCatWidth = Math.max(90, Math.min(260, Math.round(maxLabelLen * 7.2 + 16)));
            const containerHeight = Math.max(260, Math.min(560, 28 * chartData.length + 40));
            return (
              <div style={{ height: containerHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartData.map((x) => ({ name: x.category, amount: x.amount }))}
                    margin={{ left: 16, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v: number) => fmtUSD(Number(v))} />
                    <YAxis type="category" dataKey="name" width={yCatWidth} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={formatTooltipValue} />
                    <Bar dataKey="amount" fill={COL.income} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>

        {/* Expense by category */}
        <div className="p-4 rounded-lg border bg-white">
          <h3 className="font-medium mb-2">Expense by category</h3>
          {(() => {
            const MAX_BARS = 15;
            const sorted = [...expenseCats].sort((a, b) => (b.amount || 0) - (a.amount || 0));
            const othersTotal = sorted.slice(MAX_BARS - 1).reduce((s, x) => s + (x.amount || 0), 0);
            const chartData =
              sorted.length > MAX_BARS
                ? [...sorted.slice(0, MAX_BARS - 1), { category: "Other", amount: othersTotal }]
                : sorted;
            if (chartData.length === 0) return <div className="text-sm text-neutral-500">No data yet.</div>;
            const maxLabelLen = Math.max(0, ...chartData.map((x) => (x.category || "").length));
            const yCatWidth = Math.max(90, Math.min(260, Math.round(maxLabelLen * 7.2 + 16)));
            const containerHeight = Math.max(260, Math.min(560, 28 * chartData.length + 40));
            return (
              <div style={{ height: containerHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={chartData.map((x) => ({ name: x.category, amount: x.amount }))}
                    margin={{ left: 16, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v: number) => fmtUSD(Number(v))} />
                    <YAxis type="category" dataKey="name" width={yCatWidth} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={formatTooltipValue} />
                    <Bar dataKey="amount" fill={COL.expense} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      </section>
      )}
    </div>
  );
}

// Collapsible mobile filter + tabs for Analytics
function TooltipInfo({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex">
      <span
        aria-label="Info"
        className="inline-flex h-4 w-4 select-none items-center justify-center rounded-full border border-slate-300 text-[10px] leading-none text-slate-600 bg-white cursor-help"
      >
        i
      </span>
      <span className="absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded border bg-white px-2 py-1 text-xs text-slate-700 shadow group-hover:block mt-1">
        {text}
      </span>
    </span>
  );
}

// Collapsible mobile filter + tabs for Analytics
function MobileAnalyticsFilters({
  start,
  setStart,
  end,
  setEnd,
  categories,
  setCategories,
  getCategories,
  tab,
  setTab,
  quickRange,
  setQuickRange,
  applyQuickRange,
}: {
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  categories: string[];
  setCategories: (v: string[]) => void;
  getCategories: () => { id: string; name: string; type: "income" | "expense" }[];
  tab: Tab;
  setTab: (t: Tab) => void;
  quickRange: QuickRangeKey | "custom";
  setQuickRange: (key: QuickRangeKey | "custom") => void;
  applyQuickRange: (key: QuickRangeKey) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b py-2">
      <button
        className="px-3 py-2 border rounded w-full text-left bg-white"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide filters" : "Show filters"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={start}
              onChange={(e) => {
                setQuickRange("custom");
                setStart(e.target.value);
              }}
            />
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={end}
              onChange={(e) => {
                setQuickRange("custom");
                setEnd(e.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => applyQuickRange(opt.key)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${
                  quickRange === opt.key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                aria-pressed={quickRange === opt.key}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <CategorySelect
            multiple
            value={categories}
            onChange={setCategories}
            options={getCategories()}
            className="w-full"
            placeholder="All Categories"
          />
          <div className="pt-1">
            <div className="flex gap-3 text-sm overflow-x-auto">
              {([
                ["monthly", "Monthly"],
                ["annual", "Annual"],
                ["breakdown", "Breakdown"],
              ] as Array<[Tab, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key as Tab)}
                  className={`px-2 py-1.5 rounded ${
                    tab === key ? "bg-slate-900 text-white" : "bg-white border"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
