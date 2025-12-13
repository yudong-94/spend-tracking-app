import { useDataCache, Tx } from "@/state/data-cache";
import { fmtUSD, fmtUSDSigned } from "@/lib/format";
import { COL } from "@/lib/colors";
import PageHeader from "@/components/PageHeader";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { X } from "lucide-react";

type Summary = { totalIncome: number; totalExpense: number; netCashFlow: number };
type CatAmt = { category: string; amount: number };
type CategorySelection = {
  label: string;
  type: "income" | "expense";
  start: string;
  end: string;
  rangeLabel: string;
};
// (no fixed Y-axis width needed for vertical charts)

const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};

const ytdBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10); // year-to-date (today)
  return { start, end };
};

const normalizeCategory = (value?: string | null) => {
  const trimmed = (value ?? "").trim();
  return trimmed || "Uncategorized";
};

function KPIRow({ summary }: { summary: Summary | null }) {
  const net = summary?.netCashFlow ?? 0;
  const netClass = net > 0 ? "text-emerald-600" : net < 0 ? "text-rose-600" : "text-slate-600";
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <div>
        Income: <strong className="text-emerald-600">{fmtUSD(summary?.totalIncome ?? 0)}</strong>
      </div>
      <div>
        Expense: <strong className="text-rose-600">{fmtUSD(summary?.totalExpense ?? 0)}</strong>
      </div>
      <div>
        Net: <strong className={netClass}>{fmtUSD(net)}</strong>
      </div>
    </section>
  );
}

function CategoryChart({
  title,
  data,
  color,
  onCategoryClick,
}: {
  title: string;
  data: CatAmt[];
  color: string;
  onCategoryClick?: (category: string) => void;
}) {
  type ChartDatum = CatAmt & { isAggregate?: boolean };
  type NormalizedRow = { label: string; amount: number; rawCategory: string; isAggregate: boolean };
  // Prepare data: sort desc, cap to top N, group the rest as "Other"
  const MAX_BARS = 15;
  const sorted = [...data].sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const othersTotal = sorted.slice(MAX_BARS - 1).reduce((s, x) => s + (x.amount || 0), 0);
  const chartData: ChartDatum[] =
    sorted.length > MAX_BARS
      ? [...sorted.slice(0, MAX_BARS - 1), { category: "Other", amount: othersTotal, isAggregate: true }]
      : sorted;
  const shownCount = chartData.length;
  // Category labels on the left; compute a reasonable width and height
  const normalizedData: NormalizedRow[] = chartData.map((item) => {
    const normalized = normalizeCategory(item.category);
    const isAggregate = Boolean(item.isAggregate);
    const label = isAggregate ? "Other" : normalized;
    return { label, amount: item.amount || 0, rawCategory: normalized, isAggregate };
  });
  const maxLabelLen = Math.max(0, ...normalizedData.map((x) => x.label.length));
  const yCatWidth = Math.max(90, Math.min(260, Math.round(maxLabelLen * 7.2 + 16)));
  const containerHeight = Math.max(260, Math.min(560, 28 * shownCount + 40));
  const maxAmount = Math.max(0, ...normalizedData.map((x) => x.amount));
  const chartRows = normalizedData.map((row) => ({
    ...row,
    name: row.label,
  }));
  const handleRowClick = (row: NormalizedRow) => {
    if (!onCategoryClick || row.isAggregate) return;
    onCategoryClick(row.rawCategory);
  };
  return (
    <div className="p-4 rounded-lg border bg-white">
      <h3 className="font-medium mb-2">{title}</h3>
      {normalizedData.length === 0 ? (
        <div className="text-sm text-neutral-500">No data yet.</div>
      ) : (
        <>
          <div className="hidden md:block" style={{ height: containerHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartRows}
                margin={{ left: 16, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v: number) => fmtUSD(Number(v))} />
                <YAxis type="category" dataKey="name" width={yCatWidth} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number | string) =>
                    fmtUSD(typeof value === "number" ? value : Number(value))
                  }
                />
                <Bar
                  dataKey="amount"
                  fill={color}
                  radius={[0, 4, 4, 0]}
                  cursor={onCategoryClick ? "pointer" : undefined}
                  onClick={(barData: { payload?: (typeof chartRows)[number] }) => {
                    if (!onCategoryClick) return;
                    const payload = barData?.payload;
                    if (!payload || payload.isAggregate) return;
                    onCategoryClick(payload.rawCategory);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="md:hidden">
            <ul className="space-y-3">
              {normalizedData.map((row, idx) => {
                const pct = maxAmount > 0 ? Math.min(100, (row.amount / maxAmount) * 100) : 0;
                return (
                  <li key={`${row.label.toLowerCase().replace(/\s+/g, "-")}-${idx}`}>
                    <button
                      type="button"
                      className={`w-full space-y-1 text-left ${onCategoryClick && !row.isAggregate ? "cursor-pointer" : "cursor-default"}`}
                      onClick={() => handleRowClick(row)}
                      disabled={!onCategoryClick || row.isAggregate}
                    >
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="font-medium tabular-nums text-slate-700">
                          {fmtUSD(row.amount)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded bg-slate-200">
                        <div
                          aria-hidden="true"
                          className="h-full rounded"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { getSummary, getBreakdown, refresh, txns } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategorySelection | null>(null);
  const m = monthBounds();
  const y = ytdBounds();
  const mSummary = getSummary(m.start, m.end);
  const mIncomeCats = getBreakdown("income", m.start, m.end);
  const mExpenseCats = getBreakdown("expense", m.start, m.end);
  const ySummary = getSummary(y.start, y.end);
  const yIncomeCats = getBreakdown("income", y.start, y.end);
  const yExpenseCats = getBreakdown("expense", y.start, y.end);

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }

  const openCategoryTransactions = (
    category: string,
    type: "income" | "expense",
    bounds: { start: string; end: string; label: string },
  ) => {
    setSelectedCategory({
      label: normalizeCategory(category),
      type,
      start: bounds.start,
      end: bounds.end,
      rangeLabel: bounds.label,
    });
  };

  const closeSelection = () => setSelectedCategory(null);

  const filteredTransactions = useMemo(() => {
    if (!selectedCategory) return [];
    return txns
      .filter((tx) => {
        if (tx.type !== selectedCategory.type) return false;
        if (selectedCategory.start && tx.date < selectedCategory.start) return false;
        if (selectedCategory.end && tx.date > selectedCategory.end) return false;
        return normalizeCategory(tx.category) === selectedCategory.label;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [txns, selectedCategory]);

  return (
    <div className="space-y-8">
      <PageHeader lastUpdated={lastUpdated} onRefresh={onRefresh} isRefreshing={isRefreshing} />
      {/* This Month */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">This Month</h2>
        <KPIRow summary={mSummary} />
        <section className="grid gap-6 lg:grid-cols-2">
          <CategoryChart
            title="Income by category (this month)"
            data={mIncomeCats}
            color={COL.income}
            onCategoryClick={(category) =>
              openCategoryTransactions(category, "income", {
                start: m.start,
                end: m.end,
                label: "This Month",
              })
            }
          />
          <CategoryChart
            title="Expense by category (this month)"
            data={mExpenseCats}
            color={COL.expense}
            onCategoryClick={(category) =>
              openCategoryTransactions(category, "expense", {
                start: m.start,
                end: m.end,
                label: "This Month",
              })
            }
          />
        </section>
      </div>

      {/* This Year (YTD) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">This Year</h2>
        <KPIRow summary={ySummary} />
        <section className="grid gap-6 lg:grid-cols-2">
          <CategoryChart
            title="Income by category (YTD)"
            data={yIncomeCats}
            color={COL.income}
            onCategoryClick={(category) =>
              openCategoryTransactions(category, "income", {
                start: y.start,
                end: y.end,
                label: "Year to Date",
              })
            }
          />
          <CategoryChart
            title="Expense by category (YTD)"
            data={yExpenseCats}
            color={COL.expense}
            onCategoryClick={(category) =>
              openCategoryTransactions(category, "expense", {
                start: y.start,
                end: y.end,
                label: "Year to Date",
              })
            }
          />
        </section>
      </div>
      {selectedCategory ? (
        <TransactionsModal
          selection={selectedCategory}
          transactions={filteredTransactions}
          onClose={closeSelection}
        />
      ) : null}
    </div>
  );
}

function TransactionsModal({
  selection,
  transactions,
  onClose,
}: {
  selection: CategorySelection;
  transactions: Tx[];
  onClose: () => void;
}) {
  const total = useMemo(
    () => transactions.reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );
  const rangeDescription = `${selection.start} to ${selection.end}`;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-slate-500 hover:text-slate-700"
          aria-label="Close category transactions"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="border-b px-6 py-4 space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">{selection.label}</h3>
          <p className="text-sm text-slate-600">
            {selection.rangeLabel} · {selection.type === "income" ? "Income" : "Expense"}
          </p>
          <p className="text-xs text-slate-500">
            {rangeDescription} · {transactions.length}{" "}
            {transactions.length === 1 ? "transaction" : "transactions"}
          </p>
          <p className="text-sm font-medium text-slate-800">
            Total: {fmtUSDSigned(total, selection.type)}
          </p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {transactions.length === 0 ? (
            <p className="text-sm text-slate-600">No transactions match this category and range yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Category</th>
                  <th className="pb-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id ?? `${tx.date}-${tx.category}-${tx.amount}`} className="border-t border-slate-100">
                    <td className="py-2 text-slate-600 tabular-nums">{tx.date}</td>
                    <td className="py-2 text-slate-700">
                      <div className="text-sm">{tx.description || "—"}</div>
                      <div className="text-xs text-slate-500 sm:hidden">{normalizeCategory(tx.category)}</div>
                    </td>
                    <td className="py-2 text-slate-600 hidden sm:table-cell">{normalizeCategory(tx.category)}</td>
                    <td className="py-2 text-right font-medium text-slate-900 tabular-nums">
                      {fmtUSDSigned(tx.amount, tx.type)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
