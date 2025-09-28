import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  getComparison,
  type ComparisonCategory,
  type ComparisonResponse,
  type ComparisonWaterfallStep,
} from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import { percentFormatter } from "@/lib/chart";
import { COL } from "@/lib/colors";

type PresetKey = "month" | "year" | "custom";

type PeriodDraft = {
  aStart: string;
  aEnd: string;
  bStart: string;
  bEnd: string;
};

type ChartRow = {
  name: string;
  start: number;
  end: number;
  barStart: number;
  barValue: number;
  delta: number;
  net: number;
  fill: string;
  isTotal: boolean;
  type: "income" | "expense" | "net";
};

type WaterfallTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

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
  const current = monthRange(0);
  const previous = monthRange(-1);
  return {
    aStart: current.start,
    aEnd: current.end,
    bStart: previous.start,
    bEnd: previous.end,
  };
}

function yearPreset(): PeriodDraft {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const currentDay = now.getUTCDate();
  const aStart = isoDate(currentYear, 0, 1);
  const aEnd = isoDate(currentYear, currentMonth, currentDay);
  const lastYear = currentYear - 1;
  const cappedDay = Math.min(currentDay, daysInMonth(lastYear, currentMonth));
  const bStart = isoDate(lastYear, 0, 1);
  const bEnd = isoDate(lastYear, currentMonth, cappedDay);
  return { aStart, aEnd, bStart, bEnd };
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
    a.aStart !== b.aStart ||
    a.aEnd !== b.aEnd ||
    a.bStart !== b.bStart ||
    a.bEnd !== b.bEnd
  );
}

function buildChartRows(steps: ComparisonWaterfallStep[]): ChartRow[] {
  const rows: ChartRow[] = [];
  let previousNet = 0;
  for (const step of steps) {
    const isBaseline = step.kind === "baseline";
    const isResult = step.kind === "result";
    const start = isBaseline ? 0 : previousNet;
    const end = step.net;
    const lower = Math.min(start, end);
    const upper = Math.max(start, end);
    rows.push({
      name: step.label,
      start,
      end,
      barStart: lower,
      barValue: upper - lower,
      delta: step.delta,
      net: end,
      fill: isBaseline || isResult ? COL.net : step.type === "income" ? COL.income : COL.expense,
      isTotal: isBaseline || isResult,
      type: step.type,
    });
    previousNet = end;
  }
  return rows;
}

function ComparisonWaterfallTooltip({ active, payload }: WaterfallTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0]?.payload as ChartRow | undefined;
  if (!item) return null;
  const deltaLabel = item.delta >= 0 ? `+${fmtUSD(item.delta)}` : fmtUSD(item.delta);
  return (
    <div className="rounded border bg-white p-2 text-xs text-slate-700 shadow">
      <div className="font-medium text-slate-900">{item.name}</div>
      {item.isTotal ? (
        <div className="mt-1">Net: {fmtUSD(item.end)}</div>
      ) : (
        <>
          <div className="mt-1">Δ {deltaLabel}</div>
          <div className="mt-1">Net after: {fmtUSD(item.end)}</div>
        </>
      )}
    </div>
  );
}

function PeriodEditor({
  label,
  start,
  end,
  onChange,
  invalid,
}: {
  label: string;
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  invalid: boolean;
}) {
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
        current: data.periodA.totals.income,
        previous: data.periodB.totals.income,
      },
      {
        key: "expense",
        label: "Expense",
        current: data.periodA.totals.expense,
        previous: data.periodB.totals.expense,
      },
      {
        key: "net",
        label: "Net",
        current: data.periodA.totals.net,
        previous: data.periodB.totals.net,
      },
    ],
    [data],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {metrics.map(({ key, label, current, previous }) => {
        const delta = current - previous;
        const pct = previous !== 0 ? delta / previous : null;
        const tone = delta === 0 ? "text-slate-600" : delta > 0 ? "text-emerald-600" : "text-rose-500";
        return (
          <div key={key} className="rounded border bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{fmtUSD(current)}</div>
            <div className="mt-1 text-xs text-slate-500">
              vs {fmtUSD(previous)}{pct != null ? ` (${percentFormatter(pct)})` : ""}
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

function WaterfallView({ data }: { data: ComparisonResponse }) {
  const chartData = useMemo(() => buildChartRows(data.waterfall), [data.waterfall]);
  if (chartData.length === 0) return null;
  return (
    <section className="rounded border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium text-slate-800">Net change waterfall</h3>
        <span className="text-xs text-slate-500">Shows how categories bridge Period B to Period A net.</span>
      </div>
      <div className="mt-4" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: 16, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval={0}
              height={70}
              angle={-20}
              textAnchor="end"
              tick={{ fontSize: 12 }}
            />
            <YAxis tickFormatter={(value: number) => fmtUSD(value)} />
            <Tooltip content={<ComparisonWaterfallTooltip />} />
            <Bar dataKey="barStart" stackId="a" fill="transparent" />
            <Bar dataKey="barValue" stackId="a" isAnimationActive={false}>
              {chartData.map((item) => (
                <Cell key={item.name} fill={item.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
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
      current: data.periodA.totals.income,
      previous: data.periodB.totals.income,
    },
    expense: {
      current: data.periodA.totals.expense,
      previous: data.periodB.totals.expense,
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
              <th className="py-2 pr-4 text-right">Period A</th>
              <th className="py-2 pr-4 text-right">Period B</th>
              <th className="py-2 pr-4 text-right">Delta</th>
              <th className="py-2 text-right">% diff</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, label, rows }) => {
              const total = totalsByType[key];
              const totalDelta = total.current - total.previous;
              const totalPct = total.previous !== 0 ? totalDelta / total.previous : null;
              return (
                <Fragment key={key}>
                  <tr>
                    <td colSpan={5} className="pt-5 pb-2 text-xs font-semibold uppercase text-slate-500">
                      {label}
                    </td>
                  </tr>
                  {rows.map((row) => {
                    const delta = row.amountA - row.amountB;
                    const tone = delta === 0 ? "text-slate-600" : delta > 0 ? "text-emerald-600" : "text-rose-500";
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
                        <td className="py-2 pr-4 text-right text-slate-700">{fmtUSD(row.amountA)}</td>
                        <td className="py-2 pr-4 text-right text-slate-700">{fmtUSD(row.amountB)}</td>
                        <td className={`py-2 pr-4 text-right font-medium ${tone}`}>
                          {delta > 0 ? "+" : ""}
                          {fmtUSD(delta)}
                        </td>
                        <td className="py-2 text-right text-slate-600">
                          {row.pct != null ? percentFormatter(row.pct) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="font-medium">
                    <td className="py-2 pr-4 text-slate-800">Total {key}</td>
                    <td className="py-2 pr-4 text-right text-slate-800">{fmtUSD(total.current)}</td>
                    <td className="py-2 pr-4 text-right text-slate-800">{fmtUSD(total.previous)}</td>
                    <td className={`py-2 pr-4 text-right ${totalDelta === 0 ? "text-slate-600" : totalDelta > 0 ? "text-emerald-600" : "text-rose-500"}`}>
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

  const invalidA = draft.aStart && draft.aEnd && draft.aStart > draft.aEnd;
  const invalidB = draft.bStart && draft.bEnd && draft.bStart > draft.bEnd;
  const canSubmit =
    !!draft.aStart &&
    !!draft.aEnd &&
    !!draft.bStart &&
    !!draft.bEnd &&
    !invalidA &&
    !invalidB;
  const pendingChanges = hasChanges(draft, applied);

  useEffect(() => {
    let cancelled = false;
    if (!applied.aStart || !applied.aEnd || !applied.bStart || !applied.bEnd) return;
    setIsLoading(true);
    setError(null);
    void getComparison({
      aStart: applied.aStart,
      aEnd: applied.aEnd,
      bStart: applied.bStart,
      bEnd: applied.bEnd,
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
  }, [applied.aStart, applied.aEnd, applied.bStart, applied.bEnd]);

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
            label="Period A"
            start={draft.aStart}
            end={draft.aEnd}
            invalid={Boolean(invalidA)}
            onChange={(next) => {
              setPreset("custom");
              setDraft((prev) => ({ ...prev, aStart: next.start, aEnd: next.end }));
            }}
          />
          <PeriodEditor
            label="Period B"
            start={draft.bStart}
            end={draft.bEnd}
            invalid={Boolean(invalidB)}
            onChange={(next) => {
              setPreset("custom");
              setDraft((prev) => ({ ...prev, bStart: next.start, bEnd: next.end }));
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
                <span className="font-medium text-slate-800">Period A:</span> {formatRange(data.periodA.start, data.periodA.end)}
              </span>
              <span>
                <span className="font-medium text-slate-800">Period B:</span> {formatRange(data.periodB.start, data.periodB.end)}
              </span>
            </div>
          </div>
          <ComparisonHighlights data={data} />
          <WaterfallView data={data} />
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
