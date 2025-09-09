import { useDataCache } from "@/state/data-cache";
import { fmtUSD } from "@/lib/format";
import { COL } from "@/lib/colors";
import RefreshButton from "@/components/RefreshButton";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Summary = { totalIncome: number; totalExpense: number; netCashFlow: number };
type CatAmt = { category: string; amount: number };
const Y_AXIS_WIDTH = 80; // prevent tick labels from being clipped

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

function CategoryChart({ title, data, color }: { title: string; data: CatAmt[]; color: string }) {
  return (
    <div className="p-4 rounded-lg border bg-white">
      <h3 className="font-medium mb-2">{title}</h3>
      {data.length === 0 ? (
        <div className="text-sm text-neutral-500">No data yet.</div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data.map((x) => ({ name: x.category, amount: x.amount }))}
              margin={{ left: 16, right: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis width={Y_AXIS_WIDTH} tickFormatter={(v: number) => fmtUSD(Number(v))} />
              <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
              <Bar dataKey="amount" fill={color} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { getSummary, getBreakdown, refresh } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
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

  return (
    <div className="space-y-8">
      <div className="flex items-center">
        <div className="ml-auto flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-500">
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
          <RefreshButton
            onClick={onRefresh}
            disabled={isRefreshing}
            label={isRefreshing ? "Refreshing..." : "Refresh"}
          />
        </div>
      </div>
      {/* This Month */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">This Month</h2>
        <KPIRow summary={mSummary} />
        <section className="grid gap-6 lg:grid-cols-2">
          <CategoryChart
            title="Income by category (this month)"
            data={mIncomeCats}
            color={COL.income}
          />
          <CategoryChart
            title="Expense by category (this month)"
            data={mExpenseCats}
            color={COL.expense}
          />
        </section>
      </div>

      {/* This Year (YTD) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">This Year</h2>
        <KPIRow summary={ySummary} />
        <section className="grid gap-6 lg:grid-cols-2">
          <CategoryChart title="Income by category (YTD)" data={yIncomeCats} color={COL.income} />
          <CategoryChart
            title="Expense by category (YTD)"
            data={yExpenseCats}
            color={COL.expense}
          />
        </section>
      </div>
    </div>
  );
}
