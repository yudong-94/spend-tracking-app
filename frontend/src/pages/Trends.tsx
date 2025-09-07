import { useEffect, useState } from "react";
import { listTransactions } from "@/lib/api";

type Point = { month: string; income: number; expense: number; net: number };

const lastTwelveMonths = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};

const fmtMonth = (ym: string) => {
  // ym = "YYYY-MM"
  const d = new Date(`${ym}-01T00:00:00`);
  return d.toLocaleString(undefined, { month: "short", year: "numeric" });
};

export default function Trends() {
  const [series, setSeries] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { start, end } = lastTwelveMonths();
    setLoading(true);
    setError(null);

    listTransactions({ start, end })
      .then((rows) => {
        const byMonth = new Map<string, Point>();
        for (const r of rows) {
          const dateStr = String(r.Date ?? r.date ?? "");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
          const ym = dateStr.slice(0, 7); // YYYY-MM
          const p = byMonth.get(ym) ?? { month: ym, income: 0, expense: 0, net: 0 };
          const amt = Number(r.Amount ?? r.amount ?? 0) || 0;
          const type = String(r.Type ?? r.type ?? "").toLowerCase();
          if (type === "income") p.income += amt;
          else if (type === "expense") p.expense += amt;
          p.net = p.income - p.expense;
          byMonth.set(ym, p);
        }
        setSeries([...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Monthly Trend (last 12 months)</h2>

      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2 pr-4">Month</th>
                <th className="py-2 pr-4">Income</th>
                <th className="py-2 pr-4">Expense</th>
                <th className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {series.map((p) => (
                <tr key={p.month} className="border-b last:border-0">
                  <td className="py-2 pr-4">{fmtMonth(p.month)}</td>
                  <td className="py-2 pr-4">{p.income.toLocaleString()}</td>
                  <td className="py-2 pr-4">{p.expense.toLocaleString()}</td>
                  <td className="py-2">{p.net.toLocaleString()}</td>
                </tr>
              ))}
              {series.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-neutral-500">
                    No data in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}