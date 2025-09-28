import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getComparison, type ComparisonCategory, type ComparisonResponse } from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import { percentFormatter } from "@/lib/chart";
import { COL } from "@/lib/colors";

type PresetKey = "month" | "year" | "custom";

type PeriodDraft = {
  earlierStart: string;
  earlierEnd: string;
  recentStart: string;
  recentEnd: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const MAX_ROWS = 15;
const EARLIER_LABEL = "Earlier period";
const RECENT_LABEL = "Recent period";
const INCOME_RECENT = COL.income;
const INCOME_EARLIER = "#bbf7d0"; // tailwind emerald-200
const EXPENSE_RECENT = COL.expense;
const EXPENSE_EARLIER = "#fecdd3"; // tailwind rose-200

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

function monthRange(offset: number) {
  const today = new Date();
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const start = base.toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function monthPreset(): PeriodDraft {
  const recent = monthRange(0);
  const earlier = monthRange(-1);
  return {
    earlierStart: earlier.start,
    earlierEnd: earlier.end,
    recentStart: recent.start,
    recentEnd: recent.end,
  };
}

function yearPreset(): PeriodDraft {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const recentStart = isoDate(currentYear, 0, 1);
  const recentEnd = isoDate(currentYear, currentMonth, currentDay);
  const lastYear = currentYear - 1;
  const cappedDay = Math.min(currentDay, daysInMonth(lastYear, currentMonth));
  const earlierStart = isoDate(lastYear, 0, 1);
  const earlierEnd = isoDate(lastYear, currentMonth, cappedDay);
  return { earlierStart, earlierEnd, recentStart, recentEnd };
}

function toDisplayDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map((segment) => Number(segment));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

function formatRange(start?: string, end?: string) {
  if (!start && !end) return "—";
  if (start && !end) return toDisplayDate(start);
  if (!start && end) return toDisplayDate(end);
  if (start === end) return toDisplayDate(start);
  return `${toDisplayDate(start)} → ${toDisplayDate(end)}`;
}

const PRESETS: Array<{ key: PresetKey; label: string; compute: () => PeriodDraft }> = [
  { key: "month", label: "This month vs Last month", compute: monthPreset },
  { key: "year", label: "This year vs Last year", compute: yearPreset },
];

function hasChanges(a: PeriodDraft, b: PeriodDraft) {
  return (
    a.earlierStart !== b.earlierStart ||
    a.earlierEnd !== b.earlierEnd ||
    a.recentStart !== b.recentStart ||
    a.recentEnd !== b.recentEnd
  );
}

type PeriodEditorProps = {
  label: string;
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  invalid: boolean;
};

function PeriodEditor({ label, start, end, onChange, invalid }: PeriodEditorProps) {
  return (
    <div className="rounded border bg-slate-50 p-3">
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs uppercase text-slate-500">Start</span>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={start}
            onChange={(e) => onChange({ start: e.target.value, end })}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs uppercase text-slate-500">End</span>
          <input
            type="date"
            className="border rounded px-2 py-1"
            value={end}
            onChange={(e) => onChange({ start, end: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-2 text-xs text-slate-500">{formatRange(start, end)}</div>
      {invalid && <div className="mt-1 text-xs text-rose-600">End must be on or after start.</div>}
    </div>
  );
}

function ComparisonHighlights({ data }: { data: ComparisonResponse }) {
  const metrics = useMemo(
    () => [
      {
        key: "income",
        label: "Income",
        recent: data.periodB.totals.income,
        earlier: data.periodA.totals.income,
      },
      {
        key: "expense",
        label: "Expense",
        recent: data.periodB.totals.expense,
        earlier: data.periodA.totals.expense,
      },
      {
        key: "net",
        label: "Net",
        recent: data.periodB.totals.net,
        earlier: data.periodA.totals.net,
      },
    ],
    [data],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metrics.map(({ key, label, recent, earlier }) => {
        const delta = recent - earlier;
        const pct = earlier !== 0 ? delta / earlier : null;
        const tone = (() => {
          if (delta === 0) return 'text-slate-600';
          const positiveGood = key !== 'expense';
          const isPositive = delta > 0;
          return positiveGood === isPositive ? 'text-emerald-600' : 'text-rose-500';
        })();
        return (
          <div key={key} className="rounded border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{fmtUSD(recent)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {EARLIER_LABEL} {fmtUSD(earlier)}{pct != null ? ` (${percentFormatter(pct)})` : ""}
            </div>
            <div className={`mt-3 text-sm font-medium ${tone}`}>
              {delta > 0 ? "+" : ""}
              {fmtUSD(delta)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type ChartSource = {
  type: "income" | "expense";
  rows: ComparisonCategory[];
};

function ComparisonCategoryCharts({ data }: { data: ComparisonResponse }) {
  const sources: ChartSource[] = useMemo(
    () => [
      { type: "income", rows: data.categories.filter((row) => row.type === "income") },
      { type: "expense", rows: data.categories.filter((row) => row.type === "expense") },
    ],
    [data.categories],
  );

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {sources.map(({ type, rows }) => {
        if (rows.length === 0) {
          return (
            <div key={type} className="rounded border bg-white p-4 text-sm text-slate-500">
              {type === "income" ? "No income activity for either period yet." : "No expenses recorded for either period yet."}
            </div>
          );
        }

        const sorted = [...rows].sort(
          (a, b) => Math.abs(b.amountB) - Math.abs(a.amountB),
        );
        const limited = sorted.slice(0, MAX_ROWS);
        const chartData = limited.map((row) => ({
          category: row.category,
          recent: row.amountB,
          earlier: row.amountA,
        }));
        const maxLabelLen = Math.max(0, ...chartData.map((x) => x.category.length));
        const yAxisWidth = Math.max(90, Math.min(260, Math.round(maxLabelLen * 7.2 + 16)));
        const height = Math.max(260, Math.min(560, 32 * chartData.length + 60));
        const recentColor = type === "income" ? INCOME_RECENT : EXPENSE_RECENT;
        const earlierColor = type === "income" ? INCOME_EARLIER : EXPENSE_EARLIER;

        return (
          <div key={type} className="rounded border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-medium text-slate-800">{type === "income" ? "Income" : "Expense"} by category</h3>
              <span className="text-xs text-slate-500">Sorted by {RECENT_LABEL.toLowerCase()} amount.</span>
            </div>
            <div className="mt-4" style={{ height }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartData}
                  margin={{ left: 16, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value: number) => fmtUSD(value)} />
                  <YAxis type="category" dataKey="category" width={yAxisWidth} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value: number) => fmtUSD(Number(value))} />
                  <Legend />
                  <Bar dataKey="recent" name={RECENT_LABEL} fill={recentColor} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="earlier" name={EARLIER_LABEL} fill={earlierColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CategoryTable({ data }: { data: ComparisonResponse }) {
  const groups = useMemo(() => {
    const byType: Record<"income" | "expense", ComparisonCategory[]> = {
      income: [],
      expense: [],
    };
    for (const row of data.categories) byType[row.type].push(row);
    return [
      { key: "income" as const, label: "Income categories", rows: byType.income },
      { key: "expense" as const, label: "Expense categories", rows: byType.expense },
    ];
  }, [data.categories]);

  if (data.categories.length === 0) {
    return (
      <section className="rounded border bg-white p-4 text-sm text-slate-500">
        No category-level activity for the selected periods yet.
      </section>
    );
  }

  const totalsByType = {
    income: {
      recent: data.periodB.totals.income,
      earlier: data.periodA.totals.income,
    },
    expense: {
      recent: data.periodB.totals.expense,
      earlier: data.periodA.totals.expense,
    },
  } as const;

  return (
    <section className="rounded border bg-white p-4">
      <h3 className="font-medium text-slate-800">Category comparison</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4 text-right">{RECENT_LABEL}</th>
              <th className="py-2 pr-4 text-right">{EARLIER_LABEL}</th>
              <th className="py-2 pr-4 text-right">Delta</th>
              <th className="py-2 text-right">% diff</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, label, rows }) => {
              const total = totalsByType[key];
              const totalDelta = total.recent - total.earlier;
              const totalPct = total.earlier !== 0 ? totalDelta / total.earlier : null;
              return (
                <Fragment key={`${key}-group`}>
                  <tr key={`${key}-heading`}>
                    <td colSpan={5} className="pt-5 pb-2 text-xs font-semibold uppercase text-slate-500">
                      {label}
                    </td>
                  </tr>
                  {rows.map((row) => {
                    const delta = row.amountB - row.amountA;
                    const pct = row.amountA !== 0 ? delta / row.amountA : null;
                    const tone = (() => {
          if (delta === 0) return 'text-slate-600';
          const positiveGood = key !== 'expense';
          const isPositive = delta > 0;
          return positiveGood === isPositive ? 'text-emerald-600' : 'text-rose-500';
        })();
                    return (
                      <tr key={`${row.type}-${row.category}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 text-slate-800">
                          <div className="flex items-center gap-2">
                            <span>{row.category}</span>
                            <span className={`text-[11px] uppercase tracking-wide ${row.type === "income" ? "text-emerald-600" : "text-rose-500"}`}>
                              {row.type}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right text-slate-700">{fmtUSD(row.amountB)}</td>
                        <td className="py-2 pr-4 text-right text-slate-700">{fmtUSD(row.amountA)}</td>
                        <td className={`py-2 pr-4 text-right font-medium ${tone}`}>
                          {delta > 0 ? "+" : ""}
                          {fmtUSD(delta)}
                        </td>
                        <td className="py-2 text-right text-slate-600">
                          {pct != null ? percentFormatter(pct) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr key={`${key}-total`} className="font-medium">
                    <td className="py-2 pr-4 text-slate-800">Total {key}</td>
                    <td className="py-2 pr-4 text-right text-slate-800">{fmtUSD(total.recent)}</td>
                    <td className="py-2 pr-4 text-right text-slate-800">{fmtUSD(total.earlier)}</td>
                    <td className={`py-2 pr-4 text-right ${(() => {
                      if (totalDelta === 0) return 'text-slate-600';
                      const positiveGood = key !== 'expense';
                      const isPositive = totalDelta > 0;
                      return positiveGood === isPositive ? 'text-emerald-600' : 'text-rose-500';
                    })()}`}>
                      {totalDelta > 0 ? "+" : ""}
                      {fmtUSD(totalDelta)}
                    </td>
                    <td className="py-2 text-right text-slate-600">
                      {totalPct != null ? percentFormatter(totalPct) : "—"}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonTab() {
  const [preset, setPreset] = useState<PresetKey>("month");
  const [draft, setDraft] = useState<PeriodDraft>(() => monthPreset());
  const [applied, setApplied] = useState<PeriodDraft>(() => monthPreset());
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidEarlier = draft.earlierStart && draft.earlierEnd && draft.earlierStart > draft.earlierEnd;
  const invalidRecent = draft.recentStart && draft.recentEnd && draft.recentStart > draft.recentEnd;
  const canSubmit =
    !!draft.earlierStart &&
    !!draft.earlierEnd &&
    !!draft.recentStart &&
    !!draft.recentEnd &&
    !invalidEarlier &&
    !invalidRecent;
  const pendingChanges = hasChanges(draft, applied);

  useEffect(() => {
    let cancelled = false;
    if (!applied.earlierStart || !applied.earlierEnd || !applied.recentStart || !applied.recentEnd) return;
    setIsLoading(true);
    setError(null);
    void getComparison({
      aStart: applied.earlierStart,
      aEnd: applied.earlierEnd,
      bStart: applied.recentStart,
      bEnd: applied.recentEnd,
    })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to compare periods";
        setError(message);
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied.earlierStart, applied.earlierEnd, applied.recentStart, applied.recentEnd]);

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-lg border bg-white p-4">
        <div>
          <div className="text-sm font-medium text-slate-700">Preset</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setPreset(opt.key);
                  setDraft(opt.compute());
                }}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  preset === opt.key
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={preset === opt.key}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PeriodEditor
            label={EARLIER_LABEL}
            start={draft.earlierStart}
            end={draft.earlierEnd}
            invalid={Boolean(invalidEarlier)}
            onChange={(next) => {
              setPreset("custom");
              setDraft((prev) => ({ ...prev, earlierStart: next.start, earlierEnd: next.end }));
            }}
          />
          <PeriodEditor
            label={RECENT_LABEL}
            start={draft.recentStart}
            end={draft.recentEnd}
            invalid={Boolean(invalidRecent)}
            onChange={(next) => {
              setPreset("custom");
              setDraft((prev) => ({ ...prev, recentStart: next.start, recentEnd: next.end }));
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              if (!canSubmit) return;
              setApplied({ ...draft });
            }}
            className="rounded bg-slate-900 px-4 py-2 text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isLoading || !canSubmit || !pendingChanges}
          >
            {isLoading && !pendingChanges ? "Comparing…" : "Compare"}
          </button>
          <span className="text-xs text-slate-500">
            Adjust the periods and click Compare to refresh the analysis.
          </span>
        </div>
        {error && <div className="text-sm text-rose-600">{error}</div>}
      </section>

      {data && (
        <div className="space-y-4">
          <div className="rounded border bg-white p-4 text-sm text-slate-600">
            <div className="flex flex-wrap gap-4">
              <span>
                <span className="font-medium text-slate-800">{EARLIER_LABEL}:</span> {formatRange(data.periodA.start, data.periodA.end)}
              </span>
              <span>
                <span className="font-medium text-slate-800">{RECENT_LABEL}:</span> {formatRange(data.periodB.start, data.periodB.end)}
              </span>
            </div>
          </div>
          <ComparisonHighlights data={data} />
          <ComparisonCategoryCharts data={data} />
          <CategoryTable data={data} />
        </div>
      )}

      {!data && !isLoading && !error && (
        <div className="rounded border bg-white p-4 text-sm text-slate-500">
          Pick your periods and run Compare to see results here.
        </div>
      )}

      {isLoading && !data && (
        <div className="rounded border bg-white p-4 text-sm text-slate-500">Comparing periods…</div>
      )}
    </div>
  );
}

export default ComparisonTab;
