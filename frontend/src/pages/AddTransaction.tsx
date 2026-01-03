// frontend/src/pages/AddTransaction.tsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataCache } from "@/state/data-cache";
import AmountCalculatorInput from "@/components/AmountCalculatorInput";
import CategorySelect from "@/components/CategorySelect";
import { createTransaction, createSubscription, type CadenceType } from "@/lib/api";

type FormTx = {
  Date: string;
  Type: "income" | "expense";
  Category: string;
  Amount: number;
  Description?: string;
};

type SubscriptionDraft = {
  name: string;
  cadenceType: CadenceType;
  cadenceIntervalDays: string;
  endDate: string;
  notes: string;
};

const makeSubscriptionDefaults = (): SubscriptionDraft => ({
  name: "",
  cadenceType: "monthly",
  cadenceIntervalDays: "",
  endDate: "",
  notes: "",
});

const generateSubscriptionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function AddTransaction() {
  const { categories: categoryList, txns, refresh, addLocal, upsertSubscription } = useDataCache();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sort: expenses A→Z, then income A→Z
  const sortedOptions = useMemo(() => {
    const exp = categoryList
      .filter((c) => c.type === "expense")
      .sort((a, b) => a.name.localeCompare(b.name));
    const inc = categoryList
      .filter((c) => c.type === "income")
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...exp, ...inc];
  }, [categoryList]);

  // Helper to get YYYY-MM-DD in local time (not UTC)
  const todayLocal = () => {
    const d = new Date();
    const tz = d.getTimezoneOffset();
    const local = new Date(d.getTime() - tz * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  // Pre-fill form from URL parameters (e.g., when coming from Benefits page)
  const urlType = searchParams.get("type");
  const urlCategory = searchParams.get("category");
  const urlAmount = searchParams.get("amount");
  const urlDescription = searchParams.get("description");

  const [form, setForm] = useState<FormTx>({
    Date: todayLocal(),
    Type: (urlType === "income" ? "income" : "expense") as "income" | "expense",
    Category: urlCategory || "",
    Amount: urlAmount ? parseFloat(urlAmount) || 0 : 0,
    Description: urlDescription || "",
  });

  // Clear URL params after reading them
  useEffect(() => {
    if (urlType || urlCategory || urlAmount || urlDescription) {
      setSearchParams({}, { replace: true });
    }
  }, [urlType, urlCategory, urlAmount, urlDescription, setSearchParams]);
  const [errors, setErrors] = useState<{
    category?: string;
    amount?: string;
    subscriptionName?: string;
    subscriptionCadence?: string;
    subscriptionInterval?: string;
  }>({});
  const [isRecurring, setIsRecurring] = useState(false);
  const [subscriptionForm, setSubscriptionForm] = useState<SubscriptionDraft>(() =>
    makeSubscriptionDefaults(),
  );
  const [subscriptionNameDirty, setSubscriptionNameDirty] = useState(false);

  useEffect(() => {
    if (!isRecurring) return;
    if (subscriptionNameDirty) return;
    const inferred =
      (form.Description || "").trim() || (form.Category ? form.Category.trim() : "");
    if (!inferred) return;
    setSubscriptionForm((prev) => (prev.name === inferred ? prev : { ...prev, name: inferred }));
  }, [form.Description, form.Category, isRecurring, subscriptionNameDirty]);

  useEffect(() => {
    if (!isRecurring) {
      setSubscriptionNameDirty(false);
    }
  }, [isRecurring]);

  const updateSubscriptionForm = (patch: Partial<SubscriptionDraft>) => {
    setSubscriptionForm((prev) => ({ ...prev, ...patch }));
  };

  const toggleRecurring = (next: boolean) => {
    setIsRecurring(next);
    if (next) {
      const inferred =
        (form.Description || "").trim() || (form.Category ? form.Category.trim() : "");
      setSubscriptionForm((prev) => ({
        ...prev,
        name: prev.name || inferred,
      }));
    } else {
      setSubscriptionForm(makeSubscriptionDefaults());
      setSubscriptionNameDirty(false);
      setErrors((prev) => ({
        ...prev,
        subscriptionName: undefined,
        subscriptionCadence: undefined,
        subscriptionInterval: undefined,
      }));
    }
  };

  // Quick presets: keep top categories per type, fall back to alphabetical per-type lists
  const frequentPresets = useMemo(() => {
    const counts: Record<"income" | "expense", Map<string, { name: string; count: number }>> = {
      income: new Map(),
      expense: new Map(),
    };

    for (const tx of txns) {
      if (tx.type !== "income" && tx.type !== "expense") continue;
      const rawName = tx.category ?? "";
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) continue;
      const mapForType = counts[tx.type];
      const key = name.toLowerCase();
      const existing = mapForType.get(key);
      if (existing) {
        existing.count += 1;
        continue;
      }
      mapForType.set(key, { name, count: 1 });
    }

    const toPresetList = (type: "income" | "expense") =>
      Array.from(counts[type].values())
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.name.localeCompare(b.name);
        })
        .slice(0, 6)
        .map(({ name }) => ({ name, type }));

    return {
      income: toPresetList("income"),
      expense: toPresetList("expense"),
    };
  }, [txns]);

  const fallbackPresets = useMemo(
    () => ({
      income: sortedOptions
        .filter((c) => c.type === "income")
        .slice(0, 6)
        .map((c) => ({ name: c.name, type: c.type })),
      expense: sortedOptions
        .filter((c) => c.type === "expense")
        .slice(0, 6)
        .map((c) => ({ name: c.name, type: c.type })),
    }),
    [sortedOptions],
  );

  const selectedType = form.Type;
  const presets = useMemo(() => {
    const frequent = frequentPresets[selectedType];
    if (frequent.length) return frequent;
    return fallbackPresets[selectedType];
  }, [fallbackPresets, frequentPresets, selectedType]);

  const setType = (t: "income" | "expense") => setForm((f) => ({ ...f, Type: t }));
  const setCategory = (name: string) => {
    setForm((f) => ({ ...f, Category: name }));
    setErrors((prev) => ({ ...prev, category: undefined }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: {
      category?: string;
      amount?: string;
      subscriptionName?: string;
      subscriptionCadence?: string;
      subscriptionInterval?: string;
    } = {};
    const categoryName = form.Category.trim();
    if (!categoryName) nextErrors.category = "Category is required";

    const Amount = Math.round((form.Amount || 0) * 100) / 100; // 2dp
    if (!Number.isFinite(form.Amount) || Amount <= 0) {
      nextErrors.amount = "Enter an amount greater than zero";
    }

    const categoryRecord = categoryName
      ? categoryList.find((c) => c.name === categoryName && c.type === form.Type)
      : undefined;
    if (categoryName && !categoryRecord) {
      nextErrors.category = "Choose a valid category";
    }

    let cadenceIntervalValue: number | undefined;
    if (isRecurring) {
      if (!subscriptionForm.name.trim()) {
        nextErrors.subscriptionName = "Subscription name is required";
      }
      if (!subscriptionForm.cadenceType) {
        nextErrors.subscriptionCadence = "Select a cadence";
      }
      if (subscriptionForm.cadenceType === "custom") {
        const parsed = Number(subscriptionForm.cadenceIntervalDays);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          nextErrors.subscriptionInterval = "Enter a days interval greater than zero";
        } else {
          cadenceIntervalValue = parsed;
        }
      }
      if (!categoryRecord) {
        nextErrors.category = "Unable to resolve the selected category";
      }
    }

    if (
      nextErrors.category ||
      nextErrors.amount ||
      nextErrors.subscriptionName ||
      nextErrors.subscriptionCadence ||
      nextErrors.subscriptionInterval
    ) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});

    let subscriptionId: string | undefined;
    if (isRecurring) {
      subscriptionId = generateSubscriptionId();
      try {
        const created = await createSubscription({
          id: subscriptionId,
          name: subscriptionForm.name.trim(),
          amount: Amount,
          cadenceType: subscriptionForm.cadenceType,
          cadenceIntervalDays: cadenceIntervalValue,
          categoryId: categoryRecord?.id ?? "",
          startDate: form.Date,
          lastLoggedDate: form.Date,
          endDate: subscriptionForm.endDate || undefined,
          notes: subscriptionForm.notes.trim() ? subscriptionForm.notes.trim() : undefined,
        });
        upsertSubscription(created);
      } catch (error) {
        console.error(error);
        alert("Failed to create subscription. Please try again.");
        return;
      }
    }

    try {
      const { id } = await createTransaction({
        date: form.Date,
        type: form.Type,
        category: categoryName,
        amount: Amount,
        description: form.Description || undefined,
        subscriptionId,
      });
      addLocal({
        id,
        date: form.Date,
        type: form.Type,
        category: categoryName,
        amount: Amount,
        description: form.Description || undefined,
        subscriptionId,
      });
      setForm((f) => ({ ...f, Amount: 0, Description: "" }));
      if (isRecurring) {
        toggleRecurring(false);
      }
      void refresh?.();
      alert(isRecurring ? "Saved recurring transaction!" : "Saved!");
    } catch (error) {
      console.error(error);
      alert("Failed to save transaction. Please try again.");
    }
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={onSubmit} className="grid gap-4">
        {/* Date */}
        <div className="grid gap-1">
          <label className="text-sm">Date</label>
          <input
            type="date"
            value={form.Date}
            onChange={(e) => setForm((f) => ({ ...f, Date: e.target.value }))}
            className="border p-2 rounded"
          />
        </div>

        {/* Type (segmented) */}
        <div className="grid gap-1">
          <label className="text-sm">Type</label>
          <div className="inline-flex w-fit border rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setType("expense")}
              className={`px-3 py-2 ${form.Type === "expense" ? "bg-red-50 text-red-700" : "bg-white"}`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("income")}
              className={`px-3 py-2 border-l ${form.Type === "income" ? "bg-green-50 text-green-700" : "bg-white"}`}
            >
              Income
            </button>
          </div>
        </div>

        {/* Category (single-select) */}
        <div className="grid gap-1">
          <label className="text-sm">Category</label>
          <CategorySelect
            multiple={false}
            options={sortedOptions}
            value={form.Category}
            onChange={(name: string) => setCategory(name)}
            placeholder="Choose a category…"
          />
          {errors.category ? <p className="text-xs text-rose-600">{errors.category}</p> : null}
        </div>

        {/* Quick add presets (moved below Category) */}
        {presets.length > 0 && (
          <div className="grid gap-2 mt-1">
            <div className="text-sm text-slate-500">Quick add</div>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={`${p.type}:${p.name}`}
                  type="button"
                  onClick={() => {
                    setType(p.type);
                    setCategory(p.name);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border hover:bg-slate-50"
                  title={`${p.type === "income" ? "Income" : "Expense"} · ${p.name}`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      p.type === "income" ? "bg-green-600" : "bg-red-500"
                    }`}
                  />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount */}
        <div className="grid gap-1">
          <label className="text-sm">Amount</label>
          <AmountCalculatorInput
            value={form.Amount || 0}
            onChange={(v) => {
              setForm((f) => ({ ...f, Amount: v }));
              setErrors((prev) => ({ ...prev, amount: undefined }));
            }}
            wrapperClassName="w-full"
            inputClassName="w-full border p-2 rounded"
          />
          {errors.amount ? <p className="text-xs text-rose-600">{errors.amount}</p> : null}
        </div>

        {/* Description (optional) */}
        <div className="grid gap-1">
          <label className="text-sm">Description (optional)</label>
          <textarea
            value={form.Description || ""}
            onChange={(e) => setForm((f) => ({ ...f, Description: e.target.value }))}
            className="border p-2 rounded"
            rows={3}
          />
        </div>

        <div className="border rounded-lg p-4 bg-slate-50">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              id="recurring-toggle"
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => toggleRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
            />
            Log as recurring subscription
          </label>

          {isRecurring ? (
            <div className="mt-4 grid gap-4">
              <div className="grid gap-1">
                <label className="text-sm">Subscription name</label>
                <input
                  type="text"
                  value={subscriptionForm.name}
                  onChange={(e) => {
                    updateSubscriptionForm({ name: e.target.value });
                    setSubscriptionNameDirty(true);
                    setErrors((prev) => ({ ...prev, subscriptionName: undefined }));
                  }}
                  placeholder="Netflix, Rent, Gym membership…"
                  className="border p-2 rounded"
                />
                {errors.subscriptionName ? (
                  <p className="text-xs text-rose-600">{errors.subscriptionName}</p>
                ) : null}
              </div>

              <div className="grid gap-1">
                <label className="text-sm">Cadence</label>
                <div className="flex flex-col gap-2 md:flex-row">
                  <select
                    value={subscriptionForm.cadenceType}
                    onChange={(e) => {
                      const nextCadence = e.target.value as CadenceType;
                      updateSubscriptionForm({
                        cadenceType: nextCadence,
                        cadenceIntervalDays:
                          nextCadence === "custom"
                            ? subscriptionForm.cadenceIntervalDays || "30"
                            : "",
                      });
                      setErrors((prev) => ({
                        ...prev,
                        subscriptionCadence: undefined,
                        subscriptionInterval: undefined,
                      }));
                    }}
                    className="border p-2 rounded md:w-60"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="custom">Custom days interval</option>
                  </select>
                  {subscriptionForm.cadenceType === "custom" ? (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={subscriptionForm.cadenceIntervalDays}
                      onChange={(e) => {
                        updateSubscriptionForm({ cadenceIntervalDays: e.target.value });
                        setErrors((prev) => ({ ...prev, subscriptionInterval: undefined }));
                      }}
                      className="border p-2 rounded md:w-40"
                      placeholder="Days"
                    />
                  ) : null}
                </div>
                {errors.subscriptionCadence ? (
                  <p className="text-xs text-rose-600">{errors.subscriptionCadence}</p>
                ) : null}
                {errors.subscriptionInterval ? (
                  <p className="text-xs text-rose-600">{errors.subscriptionInterval}</p>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-sm">End date (optional)</label>
                  <input
                    type="date"
                    value={subscriptionForm.endDate}
                    onChange={(e) => updateSubscriptionForm({ endDate: e.target.value })}
                    className="border p-2 rounded"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-sm">Notes (optional)</label>
                  <textarea
                    value={subscriptionForm.notes}
                    onChange={(e) => updateSubscriptionForm({ notes: e.target.value })}
                    className="border p-2 rounded"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Enable to create a recurring subscription linked to this transaction.
            </p>
          )}
        </div>

        <div>
          <button
            className="bg-slate-900 text-white rounded px-4 py-2 disabled:opacity-50"
            disabled={!form.Category.trim() || !Number.isFinite(form.Amount) || form.Amount <= 0}
          >
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
