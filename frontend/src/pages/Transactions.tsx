import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useDataCache, Tx } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import CategorySelect from "@/components/CategorySelect";
import AmountCalculatorInput from "@/components/AmountCalculatorInput";
import { fmtUSD, fmtUSDSigned } from "@/lib/format";
import {
  QUICK_RANGE_OPTIONS,
  computeQuickRange,
  isQuickRangeKey,
  type QuickRangeKey,
} from "@/lib/date-range";
import {
  updateTransaction,
  deleteTransaction,
  updateSubscription,
  logSubscriptionTransaction,
  type CadenceType,
  type Subscription,
} from "@/lib/api";
import {
  getNextDueDate,
  previousOccurrenceFrom,
  todayLocalISO,
} from "@/lib/subscriptions";

const describeCadence = (sub: Subscription) => {
  switch (sub.cadenceType) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "yearly":
      return "Yearly";
    case "custom":
      return sub.cadenceIntervalDays ? `Every ${sub.cadenceIntervalDays} days` : "Custom cadence";
    default:
      return "";
  }
};

const parseTypeValue = (value: string): "" | "income" | "expense" =>
  value === "income" || value === "expense" ? value : "";

const isValidIsoDate = (value: string) => {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed);
};

export default function TransactionsPage() {
  const {
    txns: rows,
    isLoading: loading,
    getCategories,
    refresh,
    removeLocal,
    getSubscriptionById,
    getSubscriptionMisses,
    upsertSubscription,
    subscriptions,
  } = useDataCache();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"" | "income" | "expense">("");
  const [categories, setCategories] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState<
    "date" | "type" | "category" | "description" | "subscription" | "amount"
  >(
    "date",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [editingId, setEditingId] = useState<string | null>(null);
  type DraftTx = {
    date: string;
    type: "income" | "expense";
    category: string;
    description?: string;
    amount: number;
    subscriptionId?: string | null;
  };
  const [draft, setDraft] = useState<DraftTx | null>(null);
  type SubscriptionEditState = {
    id: string;
    name: string;
    amount: string;
    cadenceType: CadenceType;
    cadenceIntervalDays: string;
    categoryId: string;
    categoryName: string;
    startDate: string;
    nextDueDate: string;
    endDate: string;
    notes: string;
  };
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [quickRange, setQuickRange] = useState<QuickRangeKey | "custom">("all");
  const [showRecurringOnly, setShowRecurringOnly] = useState(false);
  const [activeSubscriptionId, setActiveSubscriptionId] = useState<string | null>(null);
  const [subEdit, setSubEdit] = useState<SubscriptionEditState | null>(null);
  const [subEditErrors, setSubEditErrors] = useState<{
    name?: string;
    amount?: string;
    category?: string;
    cadenceInterval?: string;
    nextDueDate?: string;
  } | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [subLogging, setSubLogging] = useState(false);
  const categoryOptions = useMemo(() => getCategories(), [getCategories]);
  const activeSubscription = useMemo(
    () => (activeSubscriptionId ? getSubscriptionById(activeSubscriptionId) : null),
    [activeSubscriptionId, getSubscriptionById],
  );
  const subscriptionMisses = useMemo(
    () => (activeSubscription ? getSubscriptionMisses(activeSubscription) : []),
    [activeSubscription, getSubscriptionMisses],
  );
  const todayValue = useMemo(() => todayLocalISO(), []);
  const subscriptionOptions = useMemo(
    () =>
      subscriptions
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((sub) => ({ id: sub.id, name: sub.name })),
    [subscriptions],
  );
  const subscriptionNameById = useMemo(() => {
    const map = new Map<string, string>();
    subscriptionOptions.forEach((opt) => map.set(opt.id, opt.name));
    return map;
  }, [subscriptionOptions]);

  const updateDraft = (patch: Partial<DraftTx>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  useEffect(() => {
    if (!activeSubscription) return;
    const category = categoryOptions.find((c) => c.id === activeSubscription.categoryId);
    const nextDue =
      subscriptionMisses.length > 0
        ? subscriptionMisses[0]
        : getNextDueDate(activeSubscription) ??
          activeSubscription.lastLoggedDate ??
          activeSubscription.startDate ??
          "";
    setSubEdit({
      id: activeSubscription.id,
      name: activeSubscription.name,
      amount: activeSubscription.amount.toFixed(2),
      cadenceType: activeSubscription.cadenceType,
      cadenceIntervalDays:
        activeSubscription.cadenceType === "custom" && activeSubscription.cadenceIntervalDays
          ? String(activeSubscription.cadenceIntervalDays)
          : "",
      categoryId: activeSubscription.categoryId,
      categoryName: category?.name ?? "",
      startDate: activeSubscription.startDate,
      nextDueDate: nextDue ?? "",
      endDate: activeSubscription.endDate ?? "",
      notes: activeSubscription.notes ?? "",
    });
    setSubEditErrors(null);
  }, [activeSubscription, categoryOptions, subscriptionMisses]);

  useEffect(() => {
    if (!activeSubscriptionId) {
      setSubEdit(null);
      setSubEditErrors(null);
      setSubSaving(false);
      setSubLogging(false);
    }
  }, [activeSubscriptionId]);

  const updateSubEdit = (patch: Partial<SubscriptionEditState>) => {
    setSubEdit((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const closeSubscriptionPanel = () => {
    setActiveSubscriptionId(null);
  };

  const saveSubscriptionEdit = async () => {
    if (!subEdit) return;
    const errors: {
      name?: string;
      amount?: string;
      category?: string;
      cadenceInterval?: string;
      nextDueDate?: string;
    } = {};

    const name = subEdit.name.trim();
    if (!name) errors.name = "Name is required";

    const amountValue = Number(subEdit.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.amount = "Enter a positive amount";
    }

    if (!subEdit.categoryId) {
      errors.category = "Pick a category";
    }

    let cadenceIntervalNumber: number | undefined;
    if (subEdit.cadenceType === "custom") {
      const parsed = Number(subEdit.cadenceIntervalDays);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.cadenceInterval = "Custom cadence requires a positive day interval";
      } else {
        cadenceIntervalNumber = parsed;
      }
    }

    const nextDueDateValue = subEdit.nextDueDate.trim();
    const cadenceIntervalForNextDue =
      subEdit.cadenceType === "custom" ? cadenceIntervalNumber : undefined;
    let lastLoggedDateToPersist: string | undefined;

    if (!nextDueDateValue) {
      errors.nextDueDate = "Next due date is required";
    } else if (!isValidIsoDate(nextDueDateValue)) {
      errors.nextDueDate = "Enter a valid date";
    } else if (subEdit.startDate && subEdit.startDate > nextDueDateValue) {
      errors.nextDueDate = "Next due date must be on or after the start date";
    } else if (subEdit.cadenceType === "custom" && cadenceIntervalForNextDue === undefined) {
      errors.cadenceInterval =
        errors.cadenceInterval ?? "Custom cadence requires a positive day interval";
    } else if (!subEdit.startDate) {
      errors.nextDueDate = "Subscription is missing a start date";
    } else if (nextDueDateValue === subEdit.startDate) {
      lastLoggedDateToPersist = "";
    } else {
      const previousOccurrence = previousOccurrenceFrom(
        nextDueDateValue,
        subEdit.cadenceType,
        cadenceIntervalForNextDue,
      );
      if (!previousOccurrence) {
        errors.nextDueDate = "Unable to calculate a previous occurrence for that date";
      } else {
        lastLoggedDateToPersist = previousOccurrence;
      }
    }

    if (Object.keys(errors).length > 0) {
      setSubEditErrors(errors);
      return;
    }

    setSubSaving(true);
    try {
      const updated = await updateSubscription({
        id: subEdit.id,
        name,
        amount: amountValue,
        cadenceType: subEdit.cadenceType,
        cadenceIntervalDays: cadenceIntervalNumber,
        categoryId: subEdit.categoryId,
        lastLoggedDate: lastLoggedDateToPersist,
        endDate: subEdit.endDate || undefined,
        notes: subEdit.notes.trim() ? subEdit.notes.trim() : undefined,
      });
      upsertSubscription(updated);
      setActiveSubscriptionId(null);
      await refresh();
      alert("Subscription updated.");
    } catch (error) {
      console.error(error);
      alert("Failed to update subscription.");
    } finally {
      setSubSaving(false);
    }
  };

  const handleSubscriptionLog = async () => {
    if (!activeSubscription) return;
    if (subscriptionMisses.length === 0) return;
    const occurrenceDate = subscriptionMisses[0];
    setSubLogging(true);
    try {
      const result = await logSubscriptionTransaction({
        subscriptionId: activeSubscription.id,
        occurrenceDate,
      });
      upsertSubscription(result.subscription);
      await refresh();
      alert("Recurring transaction logged.");
    } catch (error) {
      console.error(error);
      alert("Failed to log subscription transaction.");
    } finally {
      setSubLogging(false);
    }
  };

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
        recurringOnly?: boolean;
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
      if (typeof s.recurringOnly === "boolean") setShowRecurringOnly(s.recurringOnly);
    } catch (error) {
      console.debug("Unable to load transactions table state", error);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({
          sortBy,
          sortDir,
          pageSize,
          start,
          end,
          quickRange,
          recurringOnly: showRecurringOnly,
        }),
      );
    } catch (error) {
      console.debug("Unable to persist transactions table state", error);
    }
  }, [sortBy, sortDir, pageSize, start, end, quickRange, showRecurringOnly]);

  const applyQuickRange = (key: QuickRangeKey) => {
    const { start: nextStart, end: nextEnd } = computeQuickRange(key);
    setQuickRange(key);
    setStart(nextStart);
    setEnd(nextEnd);
    setPage(1);
  };
  const clearFilters = () => {
    setQ("");
    setType("");
    setCategories([]);
    setShowRecurringOnly(false);
    applyQuickRange("all");
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
      if (showRecurringOnly && !r.subscriptionId) return false;
      if (q && !(r.category + " " + (r.description || "")).toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [rows, q, type, categories, start, end, showRecurringOnly]);

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
        case "subscription": {
          const nameA = a.subscriptionId ? subscriptionNameById.get(a.subscriptionId) ?? "" : "";
          const nameB = b.subscriptionId ? subscriptionNameById.get(b.subscriptionId) ?? "" : "";
          return nameA.localeCompare(nameB) * dir;
        }
        case "amount":
          return (a.amount - b.amount) * dir;
        default:
          return 0;
      }
    });
    return arr;
  }, [filtered, sortBy, sortDir, subscriptionNameById]);

  // Reset/adjust pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [q, type, categories, sortBy, sortDir, pageSize, start, end, showRecurringOnly]);

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
      <div className="hidden md:flex flex-wrap items-end gap-3 mb-3">
        <div className="flex-1 min-w-[220px]">
          <input
            className="w-full border rounded px-3 py-2"
            placeholder="Search by category or description..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="w-44">
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={start}
            onChange={(e) => {
              setQuickRange("custom");
              setStart(e.target.value);
            }}
          />
        </div>
        <div className="w-44">
          <input
            type="date"
            className="w-full border rounded px-3 py-2"
            value={end}
            onChange={(e) => {
              setQuickRange("custom");
              setEnd(e.target.value);
            }}
          />
        </div>
        <div className="w-40">
          <select
            className="w-full border rounded px-3 py-2"
            value={type}
            onChange={(e) => setType(parseTypeValue(e.target.value))}
          >
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="w-56">
          <CategorySelect
            multiple
            value={categories}
            onChange={setCategories}
            options={getCategories()} // expense first, then income
            className="w-full"
            placeholder="All Categories"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <input
            id="recurring-only"
            type="checkbox"
            checked={showRecurringOnly}
            onChange={(e) => setShowRecurringOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
          />
          <label htmlFor="recurring-only">Recurring only</label>
        </div>
        <div className="flex flex-wrap items-center gap-2 basis-full">
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
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Clear filters
          </button>
        </div>
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
        recurringOnly={showRecurringOnly}
        setRecurringOnly={setShowRecurringOnly}
        onClearFilters={clearFilters}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              r.type === "income" ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          <span className="font-medium">{r.category}</span>
                          {r.subscriptionId ? (
                            <button
                              type="button"
                              onClick={() => setActiveSubscriptionId(r.subscriptionId!)}
                              className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600"
                            >
                              Recurring
                            </button>
                          ) : null}
                        </div>
                        {r.description ? (
                          <div className="text-sm text-slate-600 mt-1">{r.description}</div>
                        ) : null}
                        {r.subscriptionId ? (
                          <button
                            type="button"
                            onClick={() => setActiveSubscriptionId(r.subscriptionId!)}
                            className="mt-1 text-xs text-slate-600 underline decoration-dotted underline-offset-4 hover:text-slate-800"
                          >
                            {subscriptionNameById.get(r.subscriptionId) ?? "View subscription"}
                          </button>
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
                          onChange={(e) => updateDraft({ date: e.target.value })}
                        />
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={draft?.type || r.type}
                          onChange={(e) => {
                            const value = e.target.value === "income" ? "income" : "expense";
                            updateDraft({ type: value });
                          }}
                        >
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                        </select>
                      </div>
                      <CategorySelect
                        multiple={false}
                        value={draft?.category || r.category}
                        onChange={(val) => {
                          if (typeof val === "string") updateDraft({ category: val });
                        }}
                        options={getCategories()}
                        className="w-full"
                        placeholder="Category"
                      />
                      <select
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={draft?.subscriptionId ?? r.subscriptionId ?? ""}
                        onChange={(e) => updateDraft({ subscriptionId: e.target.value })}
                      >
                        <option value="">No subscription</option>
                        {subscriptionOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={draft?.description ?? r.description ?? ""}
                        onChange={(e) => updateDraft({ description: e.target.value })}
                        placeholder="Description"
                      />
                      <AmountCalculatorInput
                        value={draft?.amount ?? r.amount}
                        onChange={(val) => updateDraft({ amount: val })}
                        wrapperClassName="w-full"
                        inputClassName="border rounded px-2 py-1 text-sm w-full text-right"
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
                                subscriptionId: r.subscriptionId ?? "",
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
                                await updateTransaction({
                                  id: r.id!,
                                  ...draft,
                                  subscriptionId: draft.subscriptionId ?? "",
                                });
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
                  ["subscription", "Subscription"],
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
                          onChange={(e) => updateDraft({ date: e.target.value })}
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
                          onChange={(e) => {
                            const value = e.target.value === "income" ? "income" : "expense";
                            updateDraft({ type: value });
                          }}
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
                          onChange={(val) => {
                            if (typeof val === "string") updateDraft({ category: val });
                          }}
                          options={getCategories()}
                          className="w-48"
                          placeholder="Category"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span>{r.category}</span>
                          {r.subscriptionId ? (
                            <button
                              type="button"
                              onClick={() => setActiveSubscriptionId(r.subscriptionId!)}
                              className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-600"
                            >
                              Recurring
                            </button>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {isEdit ? (
                        <input
                          className="border rounded px-2 py-1 text-sm w-60"
                          value={draft?.description ?? r.description ?? ""}
                          onChange={(e) => updateDraft({ description: e.target.value })}
                        />
                      ) : (
                        r.description
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {isEdit ? (
                        <select
                          className="border rounded px-2 py-1 text-sm w-48"
                          value={draft?.subscriptionId ?? r.subscriptionId ?? ""}
                          onChange={(e) => updateDraft({ subscriptionId: e.target.value })}
                        >
                          <option value="">No subscription</option>
                          {subscriptionOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                        </select>
                      ) : r.subscriptionId ? (
                        <button
                          type="button"
                          onClick={() => setActiveSubscriptionId(r.subscriptionId!)}
                          className="text-xs text-slate-600 underline decoration-dotted underline-offset-4 hover:text-slate-800"
                        >
                          {subscriptionNameById.get(r.subscriptionId) ?? "View subscription"}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {isEdit ? (
                        <AmountCalculatorInput
                          value={draft?.amount ?? r.amount}
                          onChange={(val) => updateDraft({ amount: val })}
                          wrapperClassName="w-full"
                          inputClassName="border rounded px-2 py-1 text-sm w-28 text-right"
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
                                await updateTransaction({
                                  id: r.id!,
                                  ...draft,
                                  subscriptionId: draft.subscriptionId ?? "",
                                });
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
                                  subscriptionId: r.subscriptionId ?? "",
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
      {activeSubscriptionId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSubscriptionPanel();
          }}
        >
          <div className="relative w-full max-w-xl rounded-lg bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={closeSubscriptionPanel}
              className="absolute right-3 top-3 rounded-md p-1 text-slate-500 hover:text-slate-700"
              aria-label="Close subscription panel"
            >
              <X className="h-4 w-4" />
            </button>
            {activeSubscription && subEdit ? (
              <div className="space-y-5">
                {(() => {
                  const nextDue =
                    subscriptionMisses.length > 0
                      ? subscriptionMisses[0]
                      : getNextDueDate(activeSubscription) ?? activeSubscription.lastLoggedDate ?? null;
                  const isCanceled = Boolean(
                    activeSubscription.endDate && activeSubscription.endDate < todayValue,
                  );
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-900">{subEdit.name}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            isCanceled
                              ? "bg-slate-200 text-slate-600"
                              : subscriptionMisses.length
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {isCanceled ? "Canceled" : subscriptionMisses.length ? "Needs log" : "Active"}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600">
                        {fmtUSD(activeSubscription.amount, 2)} · {describeCadence(activeSubscription)}
                      </div>
                      <div className="text-xs text-slate-500">
                        Last logged: {activeSubscription.lastLoggedDate ?? "—"} · Next due: {nextDue ?? "—"}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <label className="text-sm">Name</label>
                    <input
                      type="text"
                      value={subEdit.name}
                      onChange={(e) => {
                        updateSubEdit({ name: e.target.value });
                        setSubEditErrors((prev) => (prev ? { ...prev, name: undefined } : prev));
                      }}
                      className="border rounded p-2"
                    />
                    {subEditErrors?.name ? (
                      <p className="text-xs text-rose-600">{subEditErrors.name}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm">Amount</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={subEdit.amount}
                        onChange={(e) => {
                          updateSubEdit({ amount: e.target.value });
                          setSubEditErrors((prev) => (prev ? { ...prev, amount: undefined } : prev));
                        }}
                        className="border rounded p-2"
                      />
                      {subEditErrors?.amount ? (
                        <p className="text-xs text-rose-600">{subEditErrors.amount}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-1">
                      <label className="text-sm">Category</label>
                      <CategorySelect
                        multiple={false}
                        value={subEdit.categoryName}
                        onChange={(name: string) => {
                          const match = categoryOptions.find((opt) => opt.name === name);
                          updateSubEdit({ categoryName: name, categoryId: match?.id ?? "" });
                          setSubEditErrors((prev) => (prev ? { ...prev, category: undefined } : prev));
                        }}
                        options={categoryOptions}
                        className="w-full"
                        placeholder="Select category"
                      />
                      {subEditErrors?.category ? (
                        <p className="text-xs text-rose-600">{subEditErrors.category}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-1">
                    <label className="text-sm">Cadence</label>
                    <div className="flex flex-col gap-2 md:flex-row">
                      <select
                        value={subEdit.cadenceType}
                        onChange={(e) => {
                          const nextCadence = e.target.value as CadenceType;
                          updateSubEdit({
                            cadenceType: nextCadence,
                            cadenceIntervalDays:
                              nextCadence === "custom" ? subEdit.cadenceIntervalDays || "30" : "",
                          });
                          setSubEditErrors((prev) =>
                            prev ? { ...prev, cadenceInterval: undefined } : prev,
                          );
                        }}
                        className="border rounded p-2 md:w-60"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="custom">Custom days interval</option>
                      </select>
                      {subEdit.cadenceType === "custom" ? (
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={subEdit.cadenceIntervalDays}
                          onChange={(e) => {
                            updateSubEdit({ cadenceIntervalDays: e.target.value });
                            setSubEditErrors((prev) =>
                              prev ? { ...prev, cadenceInterval: undefined } : prev,
                            );
                          }}
                          className="border rounded p-2 md:w-40"
                          placeholder="Days"
                        />
                      ) : null}
                    </div>
                    {subEditErrors?.cadenceInterval ? (
                      <p className="text-xs text-rose-600">{subEditErrors.cadenceInterval}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-1">
                      <label className="text-sm">Next due date</label>
                      <input
                        type="date"
                        value={subEdit.nextDueDate}
                        onChange={(e) => {
                          updateSubEdit({ nextDueDate: e.target.value });
                          setSubEditErrors((prev) =>
                            prev ? { ...prev, nextDueDate: undefined } : prev,
                          );
                        }}
                        className="border rounded p-2"
                      />
                      {subEditErrors?.nextDueDate ? (
                        <p className="text-xs text-rose-600">{subEditErrors.nextDueDate}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-1">
                      <label className="text-sm">End date (optional)</label>
                      <input
                        type="date"
                        value={subEdit.endDate}
                        onChange={(e) => updateSubEdit({ endDate: e.target.value })}
                        className="border rounded p-2"
                      />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm">Notes (optional)</label>
                    <textarea
                      value={subEdit.notes}
                      onChange={(e) => updateSubEdit({ notes: e.target.value })}
                      className="border rounded p-2"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {subscriptionMisses.length > 0 ? (
                    <button
                      type="button"
                      onClick={handleSubscriptionLog}
                      disabled={subLogging}
                      className="inline-flex items-center justify-center rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {subLogging ? "Logging…" : `Log ${subscriptionMisses[0]}`}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">No pending occurrences.</span>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/subscriptions"
                      className="text-xs text-slate-500 hover:text-slate-700 underline"
                      onClick={() => setActiveSubscriptionId(null)}
                    >
                      Open subscriptions page
                    </Link>
                    <button
                      type="button"
                      onClick={closeSubscriptionPanel}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveSubscriptionEdit}
                      disabled={subSaving}
                      className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {subSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Subscription details not available.</p>
            )}
          </div>
        </div>
      ) : null}
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
  recurringOnly,
  setRecurringOnly,
  onClearFilters,
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
  recurringOnly: boolean;
  setRecurringOnly: (v: boolean) => void;
  onClearFilters: () => void;
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
            onChange={(e) => setType(parseTypeValue(e.target.value))}
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={recurringOnly}
              onChange={(e) => setRecurringOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Recurring only
          </label>
          <button
            type="button"
            onClick={() => {
              onClearFilters();
              setOpen(false);
            }}
            className="w-full rounded border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            Clear filters
          </button>
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
