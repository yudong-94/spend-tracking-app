import { useEffect, useMemo, useState } from "react";
import { useDataCache, Tx } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import CategorySelect from "@/components/CategorySelect";
import { fmtUSDSigned } from "@/lib/format";

export default function TransactionsPage() {
  const { txns: rows, isLoading: loading, getCategories, refresh } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }

  // no fetching here – data comes from cache

  const filtered = useMemo<Tx[]>(() => {
    return (rows as Tx[]).filter((r: Tx) => {
      if (type && r.type !== type) return false;
      if (categories.length && !categories.includes(r.category)) return false;
      if (q && !(r.category + " " + (r.description || "")).toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, q, type, categories]);

  // Reset/adjust pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [q, type, categories]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const pageRows = useMemo(() => filtered.slice(startIdx, endIdx), [filtered, startIdx, endIdx]);

  const totalAmount = filtered.reduce(
    (s: number, r: Tx) => s + (r.type === "income" ? r.amount : -r.amount),
    0,
  );
  const totalKind: "income" | "expense" = totalAmount >= 0 ? "income" : "expense";
  const totalClass =
    totalAmount > 0 ? "text-emerald-600" : totalAmount < 0 ? "text-rose-600" : "text-slate-600";

  return (
    <div>
      <div className="mb-3">
        <PageHeader lastUpdated={lastUpdated} onRefresh={onRefresh} isRefreshing={isRefreshing} />
      </div>
      <div className="flex gap-3 mb-3">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Search by category or description..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="border rounded px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value as any)}
        >
          <option value="">All Types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        {/* Category select (multi) */}
        <CategorySelect
          multiple
          value={categories}
          onChange={setCategories}
          options={getCategories()} // expense first, then income
          className="w-56"
          placeholder="All Categories"
        />
      </div>

      <div className="ml-auto text-sm flex items-center gap-3">
        <div>
          Total:{" "}
          <span className={`font-semibold ${totalClass}`}>
            {fmtUSDSigned(Math.abs(totalAmount), totalKind)}
          </span>
        </div>
        <div className="text-slate-500">
          Showing {total === 0 ? 0 : startIdx + 1}–{endIdx} of {total}
        </div>
        <div className="inline-flex items-center gap-1">
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-sm text-slate-600 px-1">
            {page} / {totalPages}
          </span>
          <button
            className="px-2 py-1 border rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
          <select
            className="ml-2 border rounded px-2 py-1 text-sm"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
        </div>
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
              {pageRows.map((r: Tx, i: number) => (
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
                    <span className={r.type === "income" ? "text-emerald-600" : "text-rose-600"}>
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
