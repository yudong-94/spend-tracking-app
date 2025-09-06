import { useMemo, useState } from "react";
import { useDataCache, Tx } from "@/state/data-cache";
import RefreshButton from "@/components/RefreshButton";
import CategorySelect from "@/components/CategorySelect";
import { fmtUSDSigned } from "@/lib/format";

export default function TransactionsPage() {
  const { txns: rows, isLoading: loading, getCategories } = useDataCache();
  const catOptions = getCategories();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [category, setCategory] = useState("");

  // no fetching here – data comes from cache

  const filtered = useMemo<Tx[]>(() => {
   return (rows as Tx[]).filter((r: Tx) => {
       if (type && r.type !== type) return false;
       if (category && r.category !== category) return false;
       if (q && !(r.category + " " + (r.description || "")).toLowerCase().includes(q.toLowerCase())) return false;
       return true;
     });
   }, [rows, q, type, category]);

  const total = filtered.reduce(
    (s: number, r: Tx) => s + (r.type === "income" ? r.amount : -r.amount),
    0
  );
  const totalKind: "income" | "expense" = total >= 0 ? "income" : "expense";
  const totalClass =
    total > 0 ? "text-emerald-600" : total < 0 ? "text-rose-600" : "text-slate-600";

  return (
    <div>
      <div className="flex items-center mb-3">
        <h2 className="text-xl font-semibold">Transactions</h2>
       <RefreshButton />
      </div>
      <div className="flex gap-3 mb-3">
        <input className="border rounded px-3 py-2 flex-1" placeholder="Search by category or description..."
               value={q} onChange={e => setQ(e.target.value)} />
        <select className="border rounded px-3 py-2" value={type} onChange={e => setType(e.target.value as any)}>
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <CategorySelect
          value={category}
          onChange={setCategory}
          options={catOptions}
          className="w-56"
        />
      </div>

      <div className="ml-auto text-sm">
        Total:{" "}
        <span className={`font-semibold ${totalClass}`}>
          {fmtUSDSigned(Math.abs(total), totalKind)}
        </span>
      </div>

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
                <th className="py-2 px-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: Tx, i: number) => (
                <tr key={r.id || i} className="border-b last:border-0">
                  <td className="py-2 pr-4">{r.date}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                        r.type === "income" ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                      {r.type === "income" ? "Income" : "Expense"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{r.category}</td>
                  <td className="py-2 pr-4">{r.description}</td>
                  <td className="py-2 px-3 text-right font-medium">
                    <span
                      className={r.type === "income" ? "text-emerald-600" : "text-rose-600"}
                    >
                      {fmtUSDSigned(r.amount, r.type)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}