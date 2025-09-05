import { useEffect, useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import RefreshButton from "@/components/RefreshButton";

type Tx = { id?: string; date: string; type: "income"|"expense"; category: string; description?: string; amount: number };

export default function TransactionsPage() {
  const { txns: rows, isLoading: loading } = useDataCache();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [category, setCategory] = useState("");

  // no fetching here – data comes from cache

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (type && r.type !== type) return false;
      if (category && r.category !== category) return false;
      if (q && !(r.category + " " + (r.description || "")).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [rows, q, type, category]);

  const total = filtered.reduce((s, r) => s + (r.type === "income" ? r.amount : -r.amount), 0);

  const cats = useMemo(() => Array.from(new Set(rows.map(r => r.category))).sort(), [rows]);

  return (
    <div>
      <div className="flex items-center mb-3">
        <h2 className="text-xl font-semibold">Transactions</h2>
       <RefreshButton />
      </div>
      <h2 className="text-xl font-semibold mb-3">Transactions</h2>

      <div className="flex gap-3 mb-3">
        <input className="border rounded px-3 py-2 flex-1" placeholder="Search by category or description..."
               value={q} onChange={e => setQ(e.target.value)} />
        <select className="border rounded px-3 py-2" value={type} onChange={e => setType(e.target.value as any)}>
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <select className="border rounded px-3 py-2" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All Categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="text-right mb-2 text-sm">Total: {total.toLocaleString()}</div>

      {loading ? (
        <div className="text-neutral-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-neutral-500">No transactions found</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id || i} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.date}</td>
                  <td className="py-2 pr-4 capitalize">{r.type}</td>
                  <td className="py-2 pr-4">{r.category}</td>
                  <td className="py-2 pr-4">{r.description}</td>
                  <td className="py-2">{r.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}