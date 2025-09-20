import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { useDataCache, Tx } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import CategorySelect from "@/components/CategorySelect";
import { fmtUSDSigned } from "@/lib/format";
import {
  QUICK_RANGE_OPTIONS,
  computeQuickRange,
  isQuickRangeKey,
  type QuickRangeKey,
} from "@/lib/date-range";
import { updateTransaction, deleteTransaction } from "@/lib/api";

export default function TransactionsPage() {
  const { txns: rows, isLoading: loading, getCategories, refresh, removeLocal } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [categories, setCategories] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<"date" | "type" | "category" | "description" | "amount">(
    "date",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    | null
    | {
        date: string;
        type: "income" | "expense";
        category: string;
        description?: string;
        amount: number;
      }
  >(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickRange, setQuickRange] = useState<QuickRangeKey | "custom">("all");

  // Persist sort + page size
  const LS_KEY = "tx-table-state-v1";
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as {
        sortBy?: typeof sortBy;
        sortDir?: typeof sortDir;
        pageSize?: number;
        start?: string;
        end?: string;
        quickRange?: string;
      };
      if (s.sortBy) setSortBy(s.sortBy);
      if (s.sortDir === "asc" || s.sortDir === "desc") setSortDir(s.sortDir);
      if (s.pageSize && [25, 50, 100, 200].includes(Number(s.pageSize))) {
        setPageSize(Number(s.pageSize));
      }
      if (isQuickRangeKey(s.quickRange)) {
        const range = computeQuickRange(s.quickRange);
        setQuickRange(s.quickRange);
        setStart(range.start);
        setEnd(range.end);
      } else {
        if (typeof s.start === "string") setStart(s.start);
        if (typeof s.end === "string") setEnd(s.end);
        setQuickRange("custom");
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ sortBy, sortDir, pageSize, start, end, quickRange }),
      );
    } catch {}
  }, [sortBy, sortDir, pageSize, start, end, quickRange]);

  const applyQuickRange = (key: QuickRangeKey) => {
    const { start: nextStart, end: nextEnd } = computeQuickRange(key);
    setQuickRange(key);
    setStart(nextStart);
    setEnd(nextEnd);
    setPage(1);
  };

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleDelete(id: string) {
    if (!id) return;
    const confirmed = window.confirm("Delete this transaction? This cannot be undone.");
    if (!confirmed) return;
    setDeletingId(id);
    try {
      await deleteTransaction(id);
      removeLocal(id);
      if (editingId === id) {
        setEditingId(null);
        setDraft(null);
      }
    } catch (e) {
      alert("Failed to delete transaction");
      console.error(e);
    } finally {
      setDeletingId(null);
    }
  }

  // no fetching here – data comes from cache

  const filtered = useMemo<Tx[]>(() => {
    return (rows as Tx[]).filter((r: Tx) => {
      if (start && r.date < start) return false;
      if (end && r.date > end) return false;
      if (type && r.type !== type) return false;
      if (categories.length && !categories.includes(r.category)) return false;
      if (q && !(r.category + " " + (r.description || "")).toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, q, type, categories, start, end]);

  const sorted = useMemo<Tx[]>(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortBy) {
        case "date":
          return a.date.localeCompare(b.date) * dir;
        case "type":
          return a.type.localeCompare(b.type) * dir;
        case "category":
          return a.category.localeCompare(b.category) * dir;
        case "description":
          return (a.description || "").localeCompare(b.description || "") * dir;
        case "amount":
          return (a.amount - b.amount) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortBy, sortDir]);

  // Reset/adjust pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [q, type, categories, sortBy, sortDir, pageSize, start, end]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(total, startIdx + pageSize);
  const pageRows = useMemo(() => sorted.slice(startIdx, endIdx), [sorted, startIdx, endIdx]);

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
      {/* Filters – desktop */}
      <div className="hidden md:flex gap-3 mb-3">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Search by category or description..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={start}
          onChange={(e) => {
            setQuickRange("custom");
            setStart(e.target.value);
          }}
        />
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={end}
          onChange={(e) => {
            setQuickRange("custom");
            setEnd(e.target.value);
          }}
        />
        <div className="flex flex-wrap gap-2 items-center">
          {QUICK_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => applyQuickRange(opt.key)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                quickRange === opt.key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
              aria-pressed={quickRange === opt.key}
            >
              {opt.label}
            </button>
          ))}
        </div>
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

      {/* Filters – mobile toggle */}
      <MobileFilters
        q={q}
        setQ={setQ}
        type={type}
        setType={setType}
        categories={categories}
        setCategories={setCategories}
        getCategories={getCategories}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        quickRange={quickRange}
        setQuickRange={setQuickRange}
        applyQuickRange={applyQuickRange}
      />

      {/* Totals */}
      <div className="mt-2 hidden md:flex justify-end text-sm">
        <div>
          Total:{" "}
          <span className={`font-semibold ${totalClass}`}>
            {fmtUSDSigned(Math.abs(totalAmount), totalKind)}
          </span>
        </div>
      </div>
      <div className="md:hidden mt-2 text-sm">
        Total:{" "}
        <span className={`font-semibold ${totalClass}`}>
          {fmtUSDSigned(Math.abs(totalAmount), totalKind)}
        </span>
      </div>

      {loading ? (
        <div className="text-neutral-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-neutral-500">No transactions found</div>
      ) : (
        <>
          {/* Mobile list */}
          <div className="md:hidden space-y-2">
            {pageRows.map((r: Tx, i: number) => {
              const isEdit = editingId === r.id;
              const isDeleting = deletingId === r.id;
              return (
                <div key={r.id || i} className="rounded border bg-white p-3">
                  {!isEdit ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <div className="text-xs text-slate-500">{r.date}</div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              r.type === "income" ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          <span className="font-medium">{r.category}</span>
                        </div>
                        {r.description ? (
                          <div className="text-sm text-slate-600 mt-1">{r.description}</div>
                        ) : null}
                      </div>
                      <div className={`text-right font-semibold ${
                        r.type === "income" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {fmtUSDSigned(r.amount, r.type)}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          className="border rounded px-2 py-1 text-sm"
                          value={draft?.date || r.date}
                          onChange={(e) => setDraft((d) => ({ ...(d as any), date: e.target.value }))}
                        />
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={draft?.type || r.type}
                          onChange={(e) => setDraft((d) => ({ ...(d as any), type: e.target.value as any }))}
                        >
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                      </div>
                      <CategorySelect
                        multiple={false}
                        value={draft?.category || r.category}
                        onChange={(val: any) => setDraft((d) => ({ ...(d as any), category: val }))}
                        options={getCategories()}
                        className="w-full"
                        placeholder="Category"
                      />
                      <input
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={draft?.description ?? r.description ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...(d as any), description: e.target.value }))}
                        placeholder="Description"
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded px-2 py-1 text-sm w-full text-right"
                        value={draft?.amount ?? r.amount}
                        onChange={(e) => setDraft((d) => ({ ...(d as any), amount: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                  {r.id && (
                    <div className="mt-2 text-right">
                      {!isEdit ? (
                        <div className="inline-flex gap-2">
                          <button
                            className="px-2 py-1 rounded border text-xs"
                            onClick={() => {
                              setEditingId(r.id!);
                              setDraft({
                                date: r.date,
                                type: r.type,
                                category: r.category,
                                description: r.description,
                                amount: r.amount,
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="px-2 py-1 rounded border text-xs text-rose-600 border-rose-200 disabled:opacity-50"
                            disabled={isDeleting}
                            onClick={() => handleDelete(r.id!)}
                          >
                            {isDeleting ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-2">
                          <button
                            className="px-2 py-1 rounded bg-slate-900 text-white text-xs disabled:opacity-50"
                            disabled={saving}
                            onClick={async () => {
                              if (!draft) return;
                              setSaving(true);
                              try {
                                await updateTransaction({ id: r.id!, ...draft });
                                await refresh();
                                setEditingId(null);
                                setDraft(null);
                              } catch (e) {
                                alert("Failed to save changes");
                                console.error(e);
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Save
                          </button>
                          <button
                            className="px-2 py-1 rounded border text-xs"
                            onClick={() => {
                              setEditingId(null);
                              setDraft(null);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="px-2 py-1 rounded border text-xs text-rose-600 border-rose-200 disabled:opacity-50"
                            disabled={isDeleting || saving}
                            onClick={() => handleDelete(r.id!)}
                          >
                            {isDeleting ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="min-w-full text-sm">
            <thead className="text-left border-b">
              <tr>
                {([
                  ["date", "Date"],
                  ["type", "Type"],
                  ["category", "Category"],
                  ["description", "Description"],
                  ["amount", "Amount"],
                ] as Array<[typeof sortBy, string]>).map(([key, label]) => (
                  <th key={key} className={`py-2 ${key === "amount" ? "px-3 text-right" : "pr-4"}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setPage(1);
                        setSortBy(key);
                        setSortDir((d) => (key === sortBy ? (d === "asc" ? "desc" : "asc") : d));
                        if (key !== sortBy) setSortDir(key === "date" ? "desc" : "asc");
                      }}
                      className="inline-flex items-center gap-1 text-left hover:text-slate-900 text-slate-700"
                    >
                      <span>{label}</span>
                      <span className="inline-flex">
                        {sortBy !== key ? (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : sortDir === "asc" ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="py-2 pl-3 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r: Tx, i: number) => {
                const isEdit = editingId === r.id;
                const isDeleting = deletingId === r.id;
                return (
                  <tr key={r.id || i} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      {isEdit ? (
                        <input
                          type="date"
                          className="border rounded px-2 py-1 text-sm"
                          value={draft?.date || r.date}
                          onChange={(e) => setDraft((d) => ({ ...(d as any), date: e.target.value }))}
                        />
                      ) : (
                        r.date
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {isEdit ? (
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={draft?.type || r.type}
                          onChange={(e) =>
                            setDraft((d) => ({ ...(d as any), type: e.target.value as any }))
                          }
                        >
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              r.type === "income" ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          {r.type === "income" ? "Income" : "Expense"}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {isEdit ? (
                        <CategorySelect
                          multiple={false}
                          value={draft?.category || r.category}
                          onChange={(val: any) => setDraft((d) => ({ ...(d as any), category: val }))}
                          options={getCategories()}
                          className="w-48"
                          placeholder="Category"
                        />
                      ) : (
                        r.category
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 text-sm w-60"
                          value={draft?.description ?? r.description ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...(d as any), description: e.target.value }))
                          }
                        />
                      ) : (
                        r.description
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {isEdit ? (
                        <input
                          type="number"
                          step="0.01"
                          className="border rounded px-2 py-1 text-sm w-28 text-right"
                          value={draft?.amount ?? r.amount}
                          onChange={(e) =>
                            setDraft((d) => ({ ...(d as any), amount: Number(e.target.value) }))
                          }
                        />
                      ) : (
                        <span className={r.type === "income" ? "text-emerald-600" : "text-rose-600"}>
                          {fmtUSDSigned(r.amount, r.type)}
                        </span>
                      )}
                    </td>
                    {/* Actions */}
                    <td className="py-2 pl-3 pr-2 text-right">
                      {r.id ? (
                        isEdit ? (
                          <div className="inline-flex gap-2">
                            <button
                              className="px-2 py-1 rounded bg-slate-900 text-white text-xs disabled:opacity-50"
                              disabled={saving}
                              onClick={async () => {
                                if (!draft) return;
                                setSaving(true);
                                try {
                                  await updateTransaction({ id: r.id!, ...draft });
                                  await refresh();
                                  setEditingId(null);
                                  setDraft(null);
                                } catch (e) {
                                  alert("Failed to save changes");
                                  console.error(e);
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              Save
                            </button>
                            <button
                              className="px-2 py-1 rounded border text-xs"
                              onClick={() => {
                                setEditingId(null);
                                setDraft(null);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              className="px-2 py-1 rounded border text-xs text-rose-600 border-rose-200 disabled:opacity-50"
                              disabled={isDeleting || saving}
                              onClick={() => handleDelete(r.id!)}
                            >
                              {isDeleting ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex gap-2 justify-end">
                            <button
                              className="px-2 py-1 rounded border text-xs"
                              onClick={() => {
                                setEditingId(r.id!);
                                setDraft({
                                  date: r.date,
                                  type: r.type,
                                  category: r.category,
                                  description: r.description,
                                  amount: r.amount,
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="px-2 py-1 rounded border text-xs text-rose-600 border-rose-200 disabled:opacity-50"
                              disabled={isDeleting}
                              onClick={() => handleDelete(r.id!)}
                            >
                              {isDeleting ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          <PaginationControls
            total={total}
            startIdx={startIdx}
            endIdx={endIdx}
            page={page}
            totalPages={totalPages}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
          />
        </>
      )}
    </div>
  );
}

// Collapsible mobile filter controls
function MobileFilters({
  q,
  setQ,
  type,
  setType,
  categories,
  setCategories,
  getCategories,
  start,
  setStart,
  end,
  setEnd,
  quickRange,
  setQuickRange,
  applyQuickRange,
}: {
  q: string;
  setQ: (v: string) => void;
  type: "" | "income" | "expense";
  setType: (t: "" | "income" | "expense") => void;
  categories: string[];
  setCategories: (v: string[]) => void;
  getCategories: () => { id: string; name: string; type: "income" | "expense" }[];
  start: string;
  setStart: (v: string) => void;
  end: string;
  setEnd: (v: string) => void;
  quickRange: QuickRangeKey | "custom";
  setQuickRange: (key: QuickRangeKey | "custom") => void;
  applyQuickRange: (key: QuickRangeKey) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden mb-3">
      <button
        className="px-3 py-2 border rounded w-full text-left bg-white"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Hide filters" : "Show filters"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="date"
            className="border rounded px-3 py-2 w-full"
            value={start}
            onChange={(e) => {
              setQuickRange("custom");
              setStart(e.target.value);
            }}
          />
          <input
            type="date"
            className="border rounded px-3 py-2 w-full"
            value={end}
            onChange={(e) => {
              setQuickRange("custom");
              setEnd(e.target.value);
            }}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => applyQuickRange(opt.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  quickRange === opt.key
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
                aria-pressed={quickRange === opt.key}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Search by category or description..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="border rounded px-3 py-2 w-full"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
          >
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <CategorySelect
            multiple
            value={categories}
            onChange={setCategories}
            options={getCategories()}
            className="w-full"
            placeholder="All Categories"
          />
        </div>
      )}
    </div>
  );
}

function PaginationControls({
  total,
  startIdx,
  endIdx,
  page,
  totalPages,
  setPage,
  pageSize,
  setPageSize,
}: {
  total: number;
  startIdx: number;
  endIdx: number;
  page: number;
  totalPages: number;
  setPage: (value: number | ((prev: number) => number)) => void;
  pageSize: number;
  setPageSize: (value: number) => void;
}) {
  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-slate-500 md:text-sm">
          Showing {total === 0 ? 0 : startIdx + 1}–{endIdx} of {total}
        </div>
        <div className="flex items-center justify-between gap-2 md:justify-end">
          <button
            className="px-2 py-1 border rounded disabled:opacity-50 text-xs md:text-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <span className="text-xs text-slate-600 px-1 md:text-sm">
            {page} / {totalPages}
          </span>
          <button
            className="px-2 py-1 border rounded disabled:opacity-50 text-xs md:text-sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </button>
          <select
            aria-label="Rows per page"
            className="ml-2 border rounded px-1.5 py-1 text-xs md:text-sm md:px-2"
            value={pageSize}
            onChange={(e) => {
              const size = Number(e.target.value);
              setPageSize(size);
              setPage(1);
            }}
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
