import { useEffect, useState } from "react";
import { listTransactions } from "@/lib/api";
type Point = { month: string; income: number; expense: number; net: number };

export default function Analytics() {
  const [series, setSeries] = useState<Point[]>([]);
  useEffect(() => {
    listTransactions({}).then(rows => {
      const byMonth = new Map<string, Point>();
      for (const r of rows) {
        const ym = r.date.slice(0,7);
        const p = byMonth.get(ym) ?? { month: ym, income: 0, expense: 0, net: 0 };
        if (r.type === "income") p.income += r.amount; else p.expense += r.amount;
        p.net = p.income - p.expense;
        byMonth.set(ym, p);
      }
      setSeries([...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month)));
    });
  }, []);
  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Monthly Trend</h2>
      <ul className="text-sm space-y-1">
        {series.map(p => (
          <li key={p.month}>
            {p.month}: income {p.income.toLocaleString()} • expense {p.expense.toLocaleString()} • net {p.net.toLocaleString()}
          </li>
        ))}
        {series.length === 0 && <li className="text-neutral-500">No data.</li>}
      </ul>
    </div>
  );
}