// frontend/src/pages/AddTransaction.tsx
import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import AmountCalculatorInput from "@/components/AmountCalculatorInput";
import CategorySelect from "@/components/CategorySelect";
import { createTransaction } from "@/lib/api";

type FormTx = {
  Date: string;
  Type: "income" | "expense";
  Category: string;
  Amount: number;
  Description?: string;
};

export default function AddTransaction() {
  const { categories, txns, refresh, addLocal } = useDataCache();

  // Sort: expenses A→Z, then income A→Z
  const sortedOptions = useMemo(() => {
    const exp = categories
      .filter((c) => c.type === "expense")
      .sort((a, b) => a.name.localeCompare(b.name));
    const inc = categories
      .filter((c) => c.type === "income")
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...exp, ...inc];
  }, [categories]);

  // Helper to get YYYY-MM-DD in local time (not UTC)
  const todayLocal = () => {
    const d = new Date();
    const tz = d.getTimezoneOffset();
    const local = new Date(d.getTime() - tz * 60 * 1000);
    return local.toISOString().slice(0, 10);
  };

  const [form, setForm] = useState<FormTx>({
    Date: todayLocal(),
    Type: "expense",
    Category: "",
    Amount: 0,
    Description: "",
  });
  const [errors, setErrors] = useState<{ category?: string; amount?: string }>({});

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
    const nextErrors: { category?: string; amount?: string } = {};
    const category = form.Category.trim();
    if (!category) nextErrors.category = "Category is required";

    const Amount = Math.round((form.Amount || 0) * 100) / 100; // 2dp
    if (!Number.isFinite(form.Amount) || Amount <= 0) {
      nextErrors.amount = "Enter an amount greater than zero";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    const { id } = await createTransaction({
      date: form.Date,
      type: form.Type,
      category,
      amount: Amount,
      description: form.Description || undefined,
    });
    // Optimistic local cache add with returned id
    addLocal({
      id,
      date: form.Date,
      type: form.Type,
      category,
      amount: Amount,
      description: form.Description || undefined,
    });
    setForm((f) => ({ ...f, Amount: 0, Description: "" }));
    // Background refresh to sync with server state
    void refresh?.();
    alert("Saved!");
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
