import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
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
import { estimateYAxisWidthFromMax, percentFormatter } from "@/lib/chart";
import CombinedMonthlyChart from "@/components/CombinedMonthlyChart";

// Tooltip for savings rate charts
function RateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const v = Number(payload[0]?.value);
  return (
    <div className="rounded border bg-white p-2 text-sm shadow">
      <div className="font-medium">{String(label)}</div>
      <div>Saving rate: {Number.isFinite(v) ? percentFormatter(v) : "—"}</div>
      <div className="mt-1 text-xs text-slate-500">
        Formula: net ÷ income. Years with zero income are omitted.
      </div>
    </div>
  );
}

type Tx = { date: string; type: "income" | "expense"; category: string; amount: number };
type Point = { month: string; income: number; expense: number; net: number };
type YearPoint = { year: string; income: number; expense: number; net: number };

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
    return all.filter((r: Tx) => {
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

  // Category breakdowns based on current filters
  const incomeCats = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of filtered as Tx[]) {
      if (r.type !== "income") continue;
      by.set(r.category, (by.get(r.category) || 0) + r.amount);
    }
    return [...by.entries()].map(([category, amount]) => ({ category, amount }));
  }, [filtered]);

  const expenseCats = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of filtered as Tx[]) {
      if (r.type !== "expense") continue;
      by.set(r.category, (by.get(r.category) || 0) + r.amount);
    }
    return [...by.entries()].map(([category, amount]) => ({ category, amount }));
  }, [filtered]);

  // Totals based on current Analytics filters
  const totals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const r of filtered as Tx[]) {
      if (r.type === "income") totalIncome += r.amount;
      else totalExpense += r.amount;
    }
    const net = totalIncome - totalExpense;
    return { totalIncome, totalExpense, net };
  }, [filtered]);

  const savingsRate = useMemo(() => {
    return totals.totalIncome > 0 ? totals.net / totals.totalIncome : null;
  }, [totals]);

  // (Overview removed) – no deltas computation needed

  // Annual aggregation (respects start/end + category like monthly)
  const annualSeries: YearPoint[] = useMemo<YearPoint[]>(() => {
    const by = new Map<string, YearPoint>();
    for (const r of filtered as Tx[]) {
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

    for (const r of all as Tx[]) {
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
      {/* Filters */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b py-2">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="grid">
            <label className="text-sm">Start</label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="grid">
            <label className="text-sm">End</label>
            <input
              type="date"
              className="border rounded px-3 py-2"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="grid">
            <label className="text-sm">Category</label>
            <CategorySelect
              multiple
              value={categories}
              onChange={setCategories}
              options={getCategories()}
              className="w-56"
              placeholder="All Categories"
            />
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

      {/* Simple totals for Monthly and Annual tabs */}
      {(tab === "monthly" || tab === "annual") && (
        <section className="grid gap-3 sm:grid-cols-4">
          <div>
            Income: <strong className="text-emerald-600">{fmtUSD(totals.totalIncome)}</strong>
          </div>
          <div>
            Expense: <strong className="text-rose-600">{fmtUSD(totals.totalExpense)}</strong>
          </div>
          <div>
            {(() => {
              const net = totals.net;
              const netClass =
                net > 0 ? "text-emerald-600" : net < 0 ? "text-rose-600" : "text-slate-600";
              return (
                <>
                  Net: <strong className={netClass}>{fmtUSD(net)}</strong>
                </>
              );
            })()}
          </div>
          <div>
            {(() => {
              const rate = savingsRate;
              const cls = rate !== null && rate >= 0 ? "text-emerald-600" : "text-rose-600";
              const label =
                "Savings rate = net / income. Based on current filters. If income is 0, savings rate is not defined.";
              return (
                <>
                  <span title={label} aria-label={label} className="cursor-help">
                    Savings rate:
                  </span>{" "}
                  <strong className={cls}>
                    {rate === null ? "—" : percentFormatter(rate)}
                  </strong>
                </>
              );
            })()}
          </div>
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
                    <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
                    <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
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
