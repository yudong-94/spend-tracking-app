import { useEffect, useState, useMemo } from "react";
import { getBudget, createBudgetOverride } from "@/lib/api";
import RefreshButton from "@/components/RefreshButton";
import { fmtUSD } from "@/lib/format";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

type BudgetResp = Awaited<ReturnType<typeof getBudget>>;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Budget</h2>
        <RefreshButton onClick={fetchIt} label={loading ? "Refreshing..." : "Refresh"} />
      </div>

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
      <AdjustTotalCard onSaved={fetchIt} />
      {err ? <div className="text-rose-600 text-sm">{err}</div> : null}
    </div>
  );
}

function AdjustTotalCard({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createBudgetOverride({ amount, notes });
    setOpen(false);
    setAmount(0);
    setNotes("");
    onSaved();
  };

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Adjust Budget (this month)</div>
        <button
          type="button"
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Add adjustment"}
        </button>
      </div>
      {open && (
        <form onSubmit={onSubmit} className="grid gap-3 mt-3">
          <div className="grid gap-1">
            <label className="text-sm">Amount</label>
            <input
              type="number"
              step="0.01"
              className="border p-2 rounded"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value || 0))}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Notes (optional)</label>
            <input
              type="text"
              className="border p-2 rounded"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Expected travel this month"
            />
          </div>
          <div>
            <button className="bg-slate-900 text-white rounded px-4 py-2">Save</button>
          </div>
        </form>
      )}
    </div>
  );
}