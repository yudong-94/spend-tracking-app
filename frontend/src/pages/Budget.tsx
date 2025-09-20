import { useEffect, useState, useMemo, useCallback } from "react";
import { Info, ChevronLeft, ChevronRight } from "lucide-react";
import { getBudget, createBudgetOverride } from "@/lib/api";
import { useDataCache } from "@/state/data-cache";
import type { BudgetResp } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import { fmtUSD } from "@/lib/format";
import { estimateYAxisWidthFromMax } from "@/lib/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

export default function Budget() {
  const { budget, isBudgetLoading, refreshBudget } = useDataCache();
  const [data, setData] = useState<BudgetResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const now = new Date();
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const CUR_MONTH = monthKey(now);
  const [selectedMonth, setSelectedMonth] = useState<string>(CUR_MONTH);

  const fetchIt = useCallback(async (m?: string) => {
    try {
      setLoading(true);
      setErr(null);
      const target = m || selectedMonth;
      if (target === CUR_MONTH) {
        await refreshBudget();
      } else {
        const d = await getBudget(target);
        setData(d);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, CUR_MONTH, refreshBudget]);

  useEffect(() => {
    // If cache already has data, use it; otherwise prefetch
    if (budget) {
      setData(budget);
      setSelectedMonth(budget.month || CUR_MONTH);
    } else void fetchIt(CUR_MONTH);
    // keep in sync with provider updates
  }, [budget, CUR_MONTH, fetchIt]);

  useEffect(() => {
    if (budget) setData(budget);
  }, [budget]);

  // When switching months, load appropriate data
  useEffect(() => {
    if (!selectedMonth) return;
    if (selectedMonth === CUR_MONTH) {
      if (budget) setData(budget);
      else void fetchIt(CUR_MONTH);
    } else {
      void fetchIt(selectedMonth);
    }
  }, [selectedMonth, CUR_MONTH, budget, fetchIt]);

  const totalBudget = data?.totalBudget ?? 0;
  const cards: Array<{ label: string; value: string; note?: string }> = [
    {
      label: "Budget (this month)",
      value: fmtUSD(totalBudget),
      note: "Calculated as: average of last 12 complete months regular spend (excluding Rent, Travel, Tax Return, Credit Card Fee) + last month's rent + manual adjustment.",
    },
    { label: "Actual (MTD)", value: fmtUSD(data?.totalActualMTD ?? 0) },
    { label: "Remaining", value: fmtUSD(data?.totalRemaining ?? 0) },
  ];

  const METHOD_TEXT: Record<string, string> = {
    "last-month": "Last month (fixed)",
    "avg-12": "Average of last 12 complete months",
    derived: "Derived remainder (Misc.)",
    "override-total": "Manual TOTAL override", // shown at top as a note; included here for completeness
  };
  const methodLabel = (s?: string) => METHOD_TEXT[s || ""] || "-";

  // Show actuals only up to *today* when viewing the current month.
  const seriesForChart = useMemo(() => {
    if (!data?.series?.length) return [];
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (data.month !== thisMonthKey) return data.series; // historical month -> show full series
    const today = now.getDate();
    // Recharts breaks the line on null/undefined, so null out future points
    return data.series.map((point) =>
      point.day <= today ? point : { ...point, cumActual: null },
    );
  }, [data]);

  const rows = data?.rows ?? [];

  // removed pacing badge – linear pacing not appropriate for seasonal spend

  const [showAdjust, setShowAdjust] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader onRefresh={() => fetchIt(selectedMonth)} isRefreshing={loading || isBudgetLoading} />

      {/* Month switcher + pacing */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            className="p-1.5 rounded border hover:bg-slate-50"
            onClick={() => {
              const [y, m] = selectedMonth.split("-").map(Number);
              const d = new Date(y, (m || 1) - 2, 1); // prev month
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
            }}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            className="border rounded px-3 py-1.5"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
          <button
            type="button"
            className="p-1.5 rounded border hover:bg-slate-50"
            onClick={() => {
              const [y, m] = selectedMonth.split("-").map(Number);
              const d = new Date(y, (m || 1), 1); // next month
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
            }}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* pacing badge removed */}
      </div>

      {err ? (
        <div className="text-sm px-3 py-2 rounded border bg-rose-50 border-rose-200 text-rose-700">
          Error loading budget: {err}
        </div>
      ) : null}

      {data?.manualTotal ? (
        <div className="text-sm px-3 py-2 rounded border bg-amber-50 border-amber-200">
          <span className="font-medium">Manual adjustment:</span>{" "}
          <span className="text-slate-900">+{fmtUSD(data.manualTotal)}</span>
          {data.manualNote ? <span className="text-slate-500"> — “{data.manualNote}”</span> : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border bg-white p-4">
            <div className="text-sm text-slate-500">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.value}</div>
            {c.note ? (
              <div className="mt-1 text-xs text-slate-500 flex items-start gap-1">
                <Info className="h-3.5 w-3.5 mt-[1px] text-slate-400 shrink-0" />
                <span className="leading-relaxed">{c.note}</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Chart: cumulative actual vs flat budget line */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium mb-3">Cumulative actual vs budget</div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={seriesForChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis
                tickFormatter={(v: number) => fmtUSD(v)}
                width={(() => {
                  const maxVal = Math.max(
                    totalBudget || 0,
                    ...seriesForChart.map((point) => Math.abs(Number(point.cumActual || 0))),
                  );
                  return Math.max(56, estimateYAxisWidthFromMax(maxVal, fmtUSD));
                })()}
              />
              <Tooltip formatter={(value: number | string) => fmtUSD(typeof value === "number" ? value : Number(value))} />
              <Line type="monotone" dataKey="cumActual" stroke="#2563eb" dot={false} />
              <ReferenceLine
                y={totalBudget}
                stroke="#111827"
                strokeDasharray="6 6"
                ifOverflow="extendDomain"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-1 text-xs text-slate-500">
            Actuals are shown through today; the line does not project future days.
          </div>
        </div>
      </div>

      {/* Breakdown */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium mb-3">Breakdown</div>
        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-2">
          {rows.map((r) => {
            const pct = r.budget
              ? Math.min(1, (r.actual || 0) / r.budget)
              : r.actual > 0
                ? 1
                : 0;
            const color = pct < 0.8 ? "bg-emerald-500" : pct <= 1 ? "bg-amber-500" : "bg-rose-500";
            return (
              <div key={r.category} className="border rounded p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.category}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{methodLabel(r.source)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Remaining</div>
                    <div className="font-semibold">{fmtUSD(r.remaining)}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Budget</div>
                    <div className="font-medium">{fmtUSD(r.budget)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Actual</div>
                    <div className="font-medium">{fmtUSD(r.actual)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Usage</div>
                    <div className="mt-1 h-2 w-full bg-slate-200 rounded">
                      <div className={`h-2 rounded ${color}`} style={{ width: `${pct * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {data?.overAllocated ? (
            <div className="text-xs text-rose-600 mt-2">
              Note: budgets are over-allocated (Miscellaneous went below 0).
            </div>
          ) : null}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Budget</th>
                  <th className="py-2 pr-4">Actual</th>
                  <th className="py-2 pr-4">Remaining</th>
                  <th className="py-2 px-3 w-1/5">Methodology</th>
                  <th className="py-2">Usage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = r.budget
                    ? Math.min(1, (r.actual || 0) / r.budget)
                    : r.actual > 0
                      ? 1
                      : 0;
                  const color =
                    pct < 0.8 ? "bg-emerald-500" : pct <= 1 ? "bg-amber-500" : "bg-rose-500";
                  return (
                    <tr key={r.category} className="border-t">
                      <td className="py-2 pr-4">{r.category}</td>
                      <td className="py-2 pr-4">{fmtUSD(r.budget)}</td>
                      <td className="py-2 pr-4">{fmtUSD(r.actual)}</td>
                      <td className="py-2 pr-4">{fmtUSD(r.remaining)}</td>
                      <td className="py-2 px-3 text-slate-500">{methodLabel(r.source)}</td>
                      <td className="py-2">
                        <div className="h-2 w-40 bg-slate-200 rounded">
                          <div
                            className={`h-2 rounded ${color}`}
                            style={{ width: `${pct * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data?.overAllocated ? (
              <div className="text-xs text-rose-600 mt-3">
                Note: budgets are over-allocated (Miscellaneous went below 0).
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Current adjustments */}
      {(data?.manualItems?.length ?? 0) > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm font-medium mb-2">Adjustments this month</div>
          <ul className="space-y-1">
            {data!.manualItems!.map((it, i) => {
              const sign = it.amount >= 0 ? "+" : "−";
              const abs = Math.abs(it.amount);
              return (
                <li key={i} className="flex justify-between text-sm">
                  <span className="text-slate-600">{it.notes || "—"}</span>
                  <span className="font-medium">
                    {sign}
                    {fmtUSD(abs)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Adjust TOTAL override */}
      <button
        type="button"
        className="px-3 py-2 rounded bg-slate-900 text-white"
        onClick={() => setShowAdjust(true)}
      >
        Add adjustment
      </button>
      <AdjustBudgetModal
        open={showAdjust}
        onClose={() => setShowAdjust(false)}
        onSuccess={fetchIt /* or refresh() – the function you use to re-fetch budgets */}
      />
    </div>
  );
}

function AdjustBudgetModal({
  open,
  onClose,
  onSuccess, // call to refresh data after save
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}) {
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const parsed = Number((amount || "").toString().replace(/,/g, ""));

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(parsed)) {
      alert("Please enter a valid amount.");
      return;
    }
    setSaving(true);
    try {
      await createBudgetOverride({ amount: parsed, notes });
      await onSuccess(); // refresh budgets
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save the adjustment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/20 flex items-start justify-center p-6">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-base font-semibold">Adjust Budget (this month)</h3>
          <button
            type="button"
            className="px-3 py-1.5 rounded bg-slate-900 text-white"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 space-y-4">
          <div>
            <label className="block text-sm mb-1">Amount</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 500"
              inputMode="decimal"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Notes (optional)</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What is this adjustment for?"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded bg-slate-900 text-white disabled:opacity-50"
              disabled={saving || !Number.isFinite(parsed)}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
