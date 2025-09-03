import { useEffect, useState } from "react";
import { getSummary, getBreakdown } from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

type Summary = { totalIncome: number; totalExpense: number; netCashFlow: number };
type CatAmt = { category: string; amount: number };

const monthBounds = (d = new Date()) => {
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [incomeCats, setIncomeCats] = useState<CatAmt[]>([]);
  const [expenseCats, setExpenseCats] = useState<CatAmt[]>([]);

  useEffect(() => {
    const period = monthBounds();
    getSummary(period).then(setSummary).catch(console.error);
    getBreakdown("income", period).then(setIncomeCats).catch(console.error);
    getBreakdown("expense", period).then(setExpenseCats).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div>Income: <strong>{fmtUSD(summary?.totalIncome ?? 0)}</strong></div>
        <div>Expense: <strong>{fmtUSD(summary?.totalExpense ?? 0)}</strong></div>
        <div>Net: <strong>{fmtUSD(summary?.netCashFlow ?? 0)}</strong></div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {/* Income categories */}
        <div className="p-4 rounded-lg border bg-white">
          <h3 className="font-medium mb-2">Income by category (this month)</h3>
          {incomeCats.length === 0 ? (
            <div className="text-sm text-neutral-500">No income yet.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={incomeCats.map(x => ({ name: x.category, amount: x.amount }))}
                  margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50}/>
                  <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
                  <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
                  <Bar dataKey="amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Expense categories */}
        <div className="p-4 rounded-lg border bg-white">
          <h3 className="font-medium mb-2">Expense by category (this month)</h3>
          {expenseCats.length === 0 ? (
            <div className="text-sm text-neutral-500">No expenses yet.</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={expenseCats.map(x => ({ name: x.category, amount: x.amount }))}
                  margin={{ left: 8, right: 8, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50}/>
                  <YAxis tickFormatter={(v: number) => fmtUSD(v)} />
                  <Tooltip formatter={(v: any) => fmtUSD(Number(v))} />
                  <Bar dataKey="amount" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}