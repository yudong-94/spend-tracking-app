import { useEffect, useState, useMemo } from "react";
import { getBudget, createBudgetOverride } from "@/lib/api";
import RefreshButton from "@/components/RefreshButton";
import { fmtUSD } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

type BudgetResp = {
    month: string;
    totalBudget: number;
    totalActualMTD: number;
    totalRemaining: number;
    manualTotal: number;
    manualNote: string;
    manualItems?: Array<{ amount: number; notes: string }>; // <-- add
    overAllocated: boolean;
    series: Array<{ day: number; cumActual: number }>;
    rows: Array<{
      category: string;
      budget: number;
      actual: number;
      remaining: number;
      source: "avg-12" | "last-month" | "derived";
    }>;
  };

export default function Budget() {
  const [data, setData] = useState<BudgetResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchIt = async () => {
    try {
      setLoading(true);
      setErr(null);
      const d = await getBudget();
      setData(d);
    } catch (e: any) {
      setErr(e?.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIt();
  }, []);

  const totalBudget = data?.totalBudget ?? 0;
  const cards = [
    { label: "Budget (this month)", value: fmtUSD(totalBudget) },
    { label: "Actual (MTD)", value: fmtUSD(data?.totalActualMTD ?? 0) },
    { label: "Remaining", value: fmtUSD(data?.totalRemaining ?? 0) },
  ];

  const METHOD_TEXT: Record<string, string> = {
    "last-month": "Last month (fixed)",
    "avg-12": "Average of last 12 complete months",
    "derived": "Derived remainder (Misc.)",
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
    return data.series.map((p: any) => (p.day <= today ? p : { ...p, cumActual: null }));
  }, [data]);

  const rows = data?.rows ?? [];

  const [showAdjust, setShowAdjust] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Budget</h2>
        <RefreshButton onClick={fetchIt} label={loading ? "Refreshing..." : "Refresh"} />
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
              <YAxis tickFormatter={(v: number) => fmtUSD(v)} width={80} />
              <Tooltip formatter={(v: number) => fmtUSD(Number(v))} />
              <Line type="monotone" dataKey="cumActual" stroke="#2563eb" dot={false} />
              <ReferenceLine y={totalBudget} stroke="#111827" strokeDasharray="6 6" ifOverflow="extendDomain" />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-1 text-xs text-slate-500">
          Actuals are shown through today; the line does not project future days.
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white p-4">
        <div className="text-sm font-medium mb-3">Breakdown</div>
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
                const pct = r.budget ? Math.min(1, (r.actual || 0) / r.budget) : r.actual > 0 ? 1 : 0;
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
                        <div className={`h-2 rounded ${color}`} style={{ width: `${pct * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data?.overAllocated ? (
            <div className="text-xs text-rose-600 mt-3">Note: budgets are over-allocated (Miscellaneous went below 0).</div>
          ) : null}
        </div>
      </div>

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
      {(data?.manualItems?.length ?? 0) > 0 && (
        <div className="rounded-lg border p-4 mt-4">
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
