import { useMemo, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import CurrencyInput from "@/components/CurrencyInput";
import CategorySelect from "@/components/CategorySelect";
import { createTransaction } from "@/lib/api";

// Explicit local form type to avoid TS drift with API types
type FormTx = {
  Date: string;
  Type: "income" | "expense";
  Category: string;
  Amount: number;
  Account?: string;
  Description?: string;
};

export default function AddTransaction() {
  // NOTE: categories isn't used directly here (CategorySelect reads from its own context/logic)
  const { categories, txns, refresh } = useDataCache();

  const [form, setForm] = useState<FormTx>({
    Date: new Date().toISOString().slice(0, 10),
    Type: "expense",
    Category: "",
    Amount: 0,
    Account: "",
    Description: "",
  });

  // Build quick presets = latest 6 distinct categories you've used
  const presets = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; type: "income" | "expense" }> = [];

    for (const r of txns as any[]) {
      const name = String(r?.Category ?? "").trim();
      const type = String(r?.Type ?? "").trim().toLowerCase();
      if (!name || (type !== "income" && type !== "expense")) continue;
      if (!seen.has(name)) {
        seen.add(name);
        out.push({ name, type: type as "income" | "expense" });
      }
      if (out.length >= 6) break;
    }
    return out;
  }, [txns]);

  const setType = (t: "income" | "expense") => setForm((f) => ({ ...f, Type: t }));
  const setCategory = (name: string) => setForm((f) => ({ ...f, Category: name }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Normalize to 2 decimals; keep key exactly "Amount" to match your sheet header
    const Amount = Math.round((form.Amount || 0) * 100) / 100;

    // Cast to any to satisfy API param typing while keeping the correct sheet keys
    await createTransaction({ ...form, Amount } as any);

    // Optimistic reset + refresh cache
    setForm((f) => ({ ...f, Amount: 0, Description: "" }));
    refresh?.();
    alert("Saved!");
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-4">Add Transaction</h2>

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
          <div className="inline-flex border rounded overflow-hidden">
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

        {/* Category (pill, single-select) */}
        <div className="grid gap-1">
          <label className="text-sm">Category</label>
          <CategorySelect
            multiple={false}                 // single select
            options={categories}             // <-- REQUIRED
            value={form.Category}            // <-- string, not string[]
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