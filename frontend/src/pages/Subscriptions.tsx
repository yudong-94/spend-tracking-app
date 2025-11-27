import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import CategorySelect from "@/components/CategorySelect";
import {
  logSubscriptionTransaction,
  updateSubscription,
  type CadenceType,
  type Subscription,
} from "@/lib/api";
import { fmtUSD } from "@/lib/format";
import {
  getNextDueDate,
  previousOccurrenceFrom,
  todayLocalISO,
} from "@/lib/subscriptions";

type EditState = {
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

const cadenceLabel = (sub: Subscription) => {
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

const isValidIsoDate = (value: string) => {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed);
};

export default function SubscriptionsPage() {
  const {
    subscriptions,
    getSubscriptionMisses,
    upsertSubscription,
    addLocal,
    refresh,
    categories,
    getCategories,
  } = useDataCache();
  const categoryOptions = useMemo(() => getCategories(), [getCategories]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [loggingKey, setLoggingKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [editErrors, setEditErrors] = useState<{
    name?: string;
    amount?: string;
    category?: string;
    cadenceInterval?: string;
    nextDueDate?: string;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const today = todayLocalISO();

  const missesById = useMemo(() => {
    const map = new Map<string, string[]>();
    subscriptions.forEach((sub) => {
      const misses = getSubscriptionMisses(sub);
      if (misses.length) map.set(sub.id, misses);
    });
    return map;
  }, [subscriptions, getSubscriptionMisses]);

  const sortedSubscriptions = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      const missesA = missesById.get(a.id) ?? [];
      const missesB = missesById.get(b.id) ?? [];
      const nextA = missesA[0] ?? getNextDueDate(a) ?? a.lastLoggedDate ?? a.startDate ?? "";
      const nextB = missesB[0] ?? getNextDueDate(b) ?? b.lastLoggedDate ?? b.startDate ?? "";
      const tsA = nextA ? Date.parse(nextA) : Number.POSITIVE_INFINITY;
      const tsB = nextB ? Date.parse(nextB) : Number.POSITIVE_INFINITY;
      return tsA - tsB;
    });
  }, [subscriptions, missesById]);

  const monthlySummary = useMemo(() => {
    let total = 0;
    const byCategory = new Map<string, number>();
    sortedSubscriptions.forEach((sub) => {
      if (sub.cadenceType !== "monthly") return;
      if (sub.endDate && sub.endDate < today) return;
      const categoryName =
        categories.find((c) => c.id === sub.categoryId)?.name ?? "Uncategorized";
      byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + sub.amount);
      total += sub.amount;
    });
    const breakdown = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    return { total, breakdown };
  }, [sortedSubscriptions, categories, today]);

  const yearlySummary = useMemo(() => {
    let total = 0;
    const byCategory = new Map<string, number>();
    sortedSubscriptions.forEach((sub) => {
      if (sub.cadenceType !== "yearly") return;
      if (sub.endDate && sub.endDate < today) return;
      const categoryName =
        categories.find((c) => c.id === sub.categoryId)?.name ?? "Uncategorized";
      byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + sub.amount);
      total += sub.amount;
    });
    const breakdown = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
    return { total, breakdown };
  }, [sortedSubscriptions, categories, today]);

  const needsLogging = useMemo(
    () =>
      sortedSubscriptions
        .map((sub) => {
          const misses = missesById.get(sub.id);
          if (!misses || misses.length === 0) return null;
          return { sub, misses };
        })
        .filter((x): x is { sub: Subscription; misses: string[] } => Boolean(x))
        .sort((a, b) => a.misses[0].localeCompare(b.misses[0])),
    [sortedSubscriptions, missesById],
  );

  const startEdit = (sub: Subscription) => {
    const category = categories.find((c) => c.id === sub.categoryId);
    const misses = missesById.get(sub.id) ?? [];
    const nextDue =
      misses.length > 0
        ? misses[0]
        : getNextDueDate(sub) ?? sub.lastLoggedDate ?? sub.startDate ?? "";
    setEditingId(sub.id);
    setEditForm({
      id: sub.id,
      name: sub.name,
      amount: sub.amount.toFixed(2),
      cadenceType: sub.cadenceType,
      cadenceIntervalDays:
        sub.cadenceType === "custom" && sub.cadenceIntervalDays
          ? String(sub.cadenceIntervalDays)
          : "",
      categoryId: sub.categoryId,
      categoryName: category?.name ?? "",
      startDate: sub.startDate,
      nextDueDate: nextDue ?? "",
      endDate: sub.endDate ?? "",
      notes: sub.notes ?? "",
    });
    setEditErrors(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditErrors(null);
  };

  const handleEditChange = (patch: Partial<EditState>) => {
    setEditForm((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const saveEdit = async () => {
    if (!editForm) return;
    const errors: {
      name?: string;
      amount?: string;
      category?: string;
      cadenceInterval?: string;
      nextDueDate?: string;
    } = {};
    const name = editForm.name.trim();
    if (!name) errors.name = "Name is required";

    const amountValue = Number(editForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.amount = "Enter a positive amount";
    }

    if (!editForm.categoryId) {
      errors.category = "Pick a category";
    }

    let cadenceIntervalNumber: number | undefined;
    if (editForm.cadenceType === "custom") {
      const parsed = Number(editForm.cadenceIntervalDays);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        errors.cadenceInterval = "Custom cadence requires a positive day interval";
      } else {
        cadenceIntervalNumber = parsed;
      }
    }

    const nextDueDateValue = editForm.nextDueDate.trim();
    const cadenceIntervalForNextDue =
      editForm.cadenceType === "custom" ? cadenceIntervalNumber : undefined;
    let lastLoggedDateToPersist: string | undefined;

    if (!nextDueDateValue) {
      errors.nextDueDate = "Next due date is required";
    } else if (!isValidIsoDate(nextDueDateValue)) {
      errors.nextDueDate = "Enter a valid date";
    } else if (editForm.startDate && editForm.startDate > nextDueDateValue) {
      errors.nextDueDate = "Next due date must be on or after the start date";
    } else if (editForm.cadenceType === "custom" && cadenceIntervalForNextDue === undefined) {
      errors.cadenceInterval =
        errors.cadenceInterval ?? "Custom cadence requires a positive day interval";
    } else if (!editForm.startDate) {
      errors.nextDueDate = "Subscription is missing a start date";
    } else if (nextDueDateValue === editForm.startDate) {
      lastLoggedDateToPersist = "";
    } else {
      const previousOccurrence = previousOccurrenceFrom(
        nextDueDateValue,
        editForm.cadenceType,
        cadenceIntervalForNextDue,
      );
      if (!previousOccurrence) {
        errors.nextDueDate = "Unable to calculate a previous occurrence for that date";
      } else {
        lastLoggedDateToPersist = previousOccurrence;
      }
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setSavingId(editForm.id);
    try {
      const updated = await updateSubscription({
        id: editForm.id,
        name,
        amount: amountValue,
        cadenceType: editForm.cadenceType,
        cadenceIntervalDays: cadenceIntervalNumber,
        categoryId: editForm.categoryId,
        lastLoggedDate: lastLoggedDateToPersist,
        endDate: editForm.endDate || undefined,
        notes: editForm.notes.trim() ? editForm.notes.trim() : undefined,
      });
      upsertSubscription(updated);
      setEditingId(null);
      setEditForm(null);
      setEditErrors(null);
    } catch (error) {
      console.error(error);
      alert("Failed to update subscription.");
    } finally {
      setSavingId(null);
    }
  };

  const handleLog = async (sub: Subscription) => {
    const misses = missesById.get(sub.id);
    if (!misses || misses.length === 0) return;
    const occurrenceDate = misses[0];
    const key = `${sub.id}:${occurrenceDate}`;
    setLoggingKey(key);
    try {
      const result = await logSubscriptionTransaction({
        subscriptionId: sub.id,
        occurrenceDate,
      });
      addLocal(result.transaction);
      upsertSubscription(result.subscription);
      alert("Recurring transaction logged.");
    } catch (error) {
      console.error(error);
      alert("Failed to log subscription transaction.");
    } finally {
      setLoggingKey(null);
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader lastUpdated={lastUpdated} onRefresh={onRefresh} isRefreshing={isRefreshing} />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Monthly commitments</span>
            <span>{monthlySummary.breakdown.length} categories</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {fmtUSD(monthlySummary.total, 2)}
          </div>
          {monthlySummary.breakdown.length ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {monthlySummary.breakdown.map(([name, amount]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span>{fmtUSD(amount, 2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No active monthly subscriptions.</p>
          )}
        </div>
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Yearly commitments</span>
            <span>{yearlySummary.breakdown.length} categories</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            {fmtUSD(yearlySummary.total, 2)}
          </div>
          {yearlySummary.breakdown.length ? (
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {yearlySummary.breakdown.map(([name, amount]) => (
                <li key={name} className="flex justify-between">
                  <span>{name}</span>
                  <span>{fmtUSD(amount, 2)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No active yearly subscriptions.</p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Needs logging</h2>
        {needsLogging.length === 0 ? (
          <p className="text-sm text-slate-500">All recurring transactions are logged.</p>
        ) : (
          <div className="space-y-3">
            {needsLogging.map(({ sub, misses }) => {
              const nextDate = misses[0];
              const loggingDisabled = loggingKey === `${sub.id}:${nextDate}`;
              return (
                <div
                  key={`${sub.id}-miss`}
                  className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        {sub.name}
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium">
                          {cadenceLabel(sub)}
                        </span>
                      </div>
                      <div className="text-sm text-amber-800">
                        {fmtUSD(sub.amount, 2)} due for {nextDate}
                        {misses.length > 1 ? ` · ${misses.length} charges pending` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLog(sub)}
                      disabled={loggingDisabled}
                      className="inline-flex items-center justify-center rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
                    >
                      {loggingDisabled ? "Logging…" : `Log ${nextDate}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">All subscriptions</h2>
        {sortedSubscriptions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Create a subscription by adding a recurring transaction.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedSubscriptions.map((sub) => {
              const misses = missesById.get(sub.id) ?? [];
              const nextDue =
                misses.length > 0 ? misses[0] : getNextDueDate(sub) ?? sub.lastLoggedDate ?? null;
              const isCanceled = Boolean(sub.endDate && sub.endDate < today);
              const statusLabel = isCanceled ? "Canceled" : "Active";
              const category = categories.find((c) => c.id === sub.categoryId);
              const isEditing = editingId === sub.id && editForm;
              const loggingDisabled =
                misses.length === 0 || loggingKey === `${sub.id}:${misses[0]}`;

              return (
                <div key={sub.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1">
                      {isEditing && editForm?.id === sub.id ? (
                        <div className="grid gap-4">
                          <div className="grid gap-1">
                            <label className="text-sm">Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => {
                                handleEditChange({ name: e.target.value });
                                setEditErrors((prev) =>
                                  prev ? { ...prev, name: undefined } : prev,
                                );
                              }}
                              className="border rounded p-2"
                            />
                            {editErrors?.name ? (
                              <p className="text-xs text-rose-600">{editErrors.name}</p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <label className="text-sm">Amount</label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={editForm.amount}
                                onChange={(e) => {
                                  handleEditChange({ amount: e.target.value });
                                  setEditErrors((prev) =>
                                    prev ? { ...prev, amount: undefined } : prev,
                                  );
                                }}
                                className="border rounded p-2"
                              />
                              {editErrors?.amount ? (
                                <p className="text-xs text-rose-600">{editErrors.amount}</p>
                              ) : null}
                            </div>
                            <div className="grid gap-1">
                              <label className="text-sm">Category</label>
                              <CategorySelect
                                multiple={false}
                                options={categoryOptions}
                                value={editForm.categoryName}
                                onChange={(name: string) => {
                                  const match = categoryOptions.find((opt) => opt.name === name);
                                  handleEditChange({
                                    categoryName: name,
                                    categoryId: match?.id ?? "",
                                  });
                                  setEditErrors((prev) =>
                                    prev ? { ...prev, category: undefined } : prev,
                                  );
                                }}
                              />
                              {editErrors?.category ? (
                                <p className="text-xs text-rose-600">{editErrors.category}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-1">
                            <label className="text-sm">Cadence</label>
                            <div className="flex flex-col gap-2 md:flex-row">
                              <select
                                value={editForm.cadenceType}
                                onChange={(e) => {
                                  const nextCadence = e.target.value as CadenceType;
                                  handleEditChange({
                                    cadenceType: nextCadence,
                                    cadenceIntervalDays:
                                      nextCadence === "custom"
                                        ? editForm.cadenceIntervalDays || "30"
                                        : "",
                                  });
                                  setEditErrors((prev) =>
                                    prev
                                      ? { ...prev, cadenceInterval: undefined }
                                      : prev,
                                  );
                                }}
                                className="border rounded p-2 md:w-60"
                              >
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                                <option value="custom">Custom days interval</option>
                              </select>
                              {editForm.cadenceType === "custom" ? (
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={editForm.cadenceIntervalDays}
                                  onChange={(e) => {
                                    handleEditChange({ cadenceIntervalDays: e.target.value });
                                    setEditErrors((prev) =>
                                      prev
                                        ? { ...prev, cadenceInterval: undefined }
                                        : prev,
                                    );
                                  }}
                                  className="border rounded p-2 md:w-40"
                                  placeholder="Days"
                                />
                              ) : null}
                            </div>
                            {editErrors?.cadenceInterval ? (
                              <p className="text-xs text-rose-600">{editErrors.cadenceInterval}</p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <label className="text-sm">Next due date</label>
                              <input
                                type="date"
                                value={editForm.nextDueDate}
                                onChange={(e) => {
                                  handleEditChange({ nextDueDate: e.target.value });
                                  setEditErrors((prev) =>
                                    prev ? { ...prev, nextDueDate: undefined } : prev,
                                  );
                                }}
                                className="border rounded p-2"
                              />
                              {editErrors?.nextDueDate ? (
                                <p className="text-xs text-rose-600">{editErrors.nextDueDate}</p>
                              ) : null}
                            </div>
                            <div className="grid gap-1">
                              <label className="text-sm">End date (optional)</label>
                              <input
                                type="date"
                                value={editForm.endDate}
                                onChange={(e) => handleEditChange({ endDate: e.target.value })}
                                className="border rounded p-2"
                              />
                            </div>
                          </div>
                          <div className="grid gap-1">
                            <label className="text-sm">Notes (optional)</label>
                            <textarea
                              value={editForm.notes}
                              onChange={(e) => handleEditChange({ notes: e.target.value })}
                              className="border rounded p-2"
                              rows={2}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{sub.name}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                isCanceled
                                  ? "bg-slate-200 text-slate-600"
                                  : misses.length
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600">
                            {fmtUSD(sub.amount, 2)} · {cadenceLabel(sub)}
                          </div>
                          <div className="text-xs text-slate-500">
                            Category: {category?.name ?? "—"} · Last logged:{" "}
                            {sub.lastLoggedDate ?? "—"} · Next due: {nextDue ?? "—"}
                          </div>
                          {sub.notes ? (
                            <div className="text-xs text-slate-500">Notes: {sub.notes}</div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {misses.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleLog(sub)}
                          disabled={loggingDisabled}
                          className="inline-flex items-center justify-center rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          {loggingDisabled ? "Logging…" : `Log ${misses[0]}`}
                        </button>
                      ) : null}

                      {isEditing && editForm?.id === sub.id ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                            disabled={savingId === sub.id}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={savingId === sub.id}
                            className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                          >
                            {savingId === sub.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(sub)}
                          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
