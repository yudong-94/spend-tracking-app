// frontend/src/pages/AddTransaction.tsx
import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import CurrencyInput from "@/components/CurrencyInput";
import CategorySelect from "@/components/CategorySelect";
import { createTransaction } from "@/lib/api";

type FormTx = {
  Date: string;
  Type: "income" | "expense";
  Category: string;
  Amount: number;
  Account?: string;
  Description?: string;
};

export default function AddTransaction() {
  const { categories, txns, refresh } = useDataCache();

  // Sort: expenses A→Z, then income A→Z
  const sortedOptions = useMemo(() => {
    const exp = categories.filter((c) => c.type === "expense").sort((a, b) => a.name.localeCompare(b.name));
    const inc = categories.filter((c) => c.type === "income").sort((a, b) => a.name.localeCompare(b.name));
    return [...exp, ...inc];
  }, [categories]);

  const [form, setForm] = useState<FormTx>({
    Date: new Date().toISOString().slice(0, 10),
    Type: "expense",
    Category: "",
    Amount: 0,
    Account: "",
    Description: "",
  });

  // Quick presets: last 6 used categories; fallback to first 6 expense cats if no history
  const presets = useMemo(() => {
    const recent: Array<{ name: string; type: "income" | "expense" }> = [];
    const seen = new Set<string>();

    for (const r of txns as any[]) {
      const name = String(r?.Category ?? "").trim();
      const type = String(r?.Type ?? "").trim().toLowerCase() as "income" | "expense";
      if (!name || (type !== "income" && type !== "expense")) continue;
      if (!seen.has(name)) {
        seen.add(name);
        recent.push({ name, type });
      }
      if (recent.length >= 6) break;
    }

    if (recent.length) return recent;

    // fallback – top expense categories A→Z
    return sortedOptions
      .filter((c) => c.type === "expense")
      .slice(0, 6)
      .map((c) => ({ name: c.name, type: c.type }));
  }, [txns, sortedOptions]);

  const setType = (t: "income" | "expense") => setForm((f) => ({ ...f, Type: t }));
  const setCategory = (name: string) => setForm((f) => ({ ...f, Category: name }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const Amount = Math.round((form.Amount || 0) * 100) / 100; // 2dp
    await createTransaction({ ...form, Amount } as any); // keep "Amount" (capital A) for sheet
    setForm((f) => ({ ...f, Amount: 0, Description: "" }));
    refresh?.();
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

        {/* Quick add presets */}
        {presets.length > 0 && (
          <div className="grid gap-2">
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
        </div>

        {/* Amount */}
        <div className="grid gap-1">
          <label className="text-sm">Amount</label>
          <CurrencyInput
            value={form.Amount || 0}
            onChange={(v) => setForm((f) => ({ ...f, Amount: v }))}
          />
        </div>

        {/* Account (optional) */}
        <div className="grid gap-1">
          <label className="text-sm">Account (optional)</label>
          <input
            type="text"
            value={form.Account || ""}
            onChange={(e) => setForm((f) => ({ ...f, Account: e.target.value }))}
            className="border p-2 rounded"
          />
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
          <button className="bg-slate-900 text-white rounded px-4 py-2">Add</button>
        </div>
      </form>
    </div>
  );
}
