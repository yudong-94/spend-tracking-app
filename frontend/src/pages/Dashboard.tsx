import { useEffect, useState } from "react";
import { getSummary, getBreakdown } from "@/lib/api";

type Summary = { totalIncome: number; totalExpense: number; netCashFlow: number };
type CatAmt = { category: string; amount: number };

const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topExpenses, setTopExpenses] = useState<CatAmt[]>([]);

  useEffect(() => {
    const period = monthBounds();
    getSummary(period).then(setSummary).catch(console.error);
    getBreakdown("expense", period).then(setTopExpenses).catch(console.error);
  }, []);

  return (
    <div>
      <section className="grid gap-3 sm:grid-cols-3">
        <div>Income: {summary ? summary.totalIncome.toLocaleString() : "-"}</div>
        <div>Expense: {summary ? summary.totalExpense.toLocaleString() : "-"}</div>
        <div>Net: {summary ? summary.netCashFlow.toLocaleString() : "-"}</div>
      </section>

      <section className="mt-6">
        <h3 className="font-medium mb-2">Top expense categories (this month)</h3>
        <ul className="space-y-1 text-sm">
          {topExpenses.slice(0, 5).map((x) => (
            <li key={x.category} className="flex justify-between">
              <span>{x.category}</span>
              <span>{x.amount.toLocaleString()}</span>
            </li>
          ))}
          {topExpenses.length === 0 && <li className="text-neutral-500">No expenses yet.</li>}
        </ul>
      </section>
    </div>
  );
}