import { useState } from "react";
import { createTransaction, NewTransaction } from "@/lib/api";
import { useDataCache } from "@/state/data-cache"; 
import CategorySelect from "@/components/CategorySelect";

const makeDefault = (): NewTransaction => ({
  date: new Date().toISOString().slice(0, 10),
  type: "expense",
  category: "",
  amount: 0,
  description: "",
  });

export default function AddTransaction() {
  const [form, setForm] = useState<NewTransaction>(makeDefault());
  const [amountInput, setAmountInput] = useState<string>("0");
  const [saving, setSaving] = useState(false);
  const { refresh, addLocal, getCategories } = useDataCache();
  const catOptions = getCategories(form.type);
  const canSubmit =
    form.date && form.type && form.category && Number.isFinite(form.amount);

  const onChange =
    (field: keyof NewTransaction) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setForm((f) => ({
        ...f,
        [field]: v as any,
      }));
    };

  const onAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setAmountInput(raw);
    // allow 1,234.56 or 1234,56 or negatives
    const cleaned = raw.replace(/[^\d,.\-]/g, "");
    const normalized = cleaned.replace(/,/g, "."); // unify decimal to dot
    const val = parseFloat(normalized);
    setForm((f) => ({ ...f, amount: Number.isFinite(val) ? val : 0 }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
     const { id } = await createTransaction(form);
     // optimistic local add with the real ID from the server
     addLocal({
       id,
       date: form.date,
       type: form.type,
       category: form.category,
       description: form.description,
       amount: form.amount,
     });
      setForm(makeDefault());
      setAmountInput("0");
      // silent refresh to reconcile any server-side changes
      void refresh();
      alert("Saved!");
    } catch (err) {
      console.error(err);
      alert("Failed to save. See console.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-md">
      <div className="grid gap-1">
        <label className="text-sm">Date</label>
        <input type="date" value={form.date} onChange={onChange("date")} className="border p-2 rounded" required />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Type</label>
        <select value={form.type} onChange={(e)=>setForm(f=>({...f, type: e.target.value as "income"|"expense"}))} className="border p-2 rounded">
         <option value="income">Income</option>
         <option value="expense">Expense</option>
        </select>
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Category</label>
          <CategorySelect
            value={form.category}
            onChange={(name) => setForm((f) => ({ ...f, category: name }))}
            options={catOptions}
            className="w-full"
            placeholder="Select category"
          />
       <p className="text-xs text-slate-500">
         Showing {form.type} categories from your “Categories” sheet.
       </p>
     </div>

      <div className="grid gap-1">
        <label className="text-sm">Amount</label>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          value={amountInput}
          onChange={onAmountChange}
          className="border p-2 rounded"
          placeholder="0.00"
       />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Description (optional)</label>
        <textarea value={form.description ?? ""} onChange={onChange("description")} className="border p-2 rounded" rows={2} />
      </div>

      <button type="submit" disabled={!canSubmit || saving} className="px-4 py-2 rounded bg-sky-600 text-white disabled:opacity-50">
        {saving ? "Saving…" : "Add"}
      </button>
    </form>
  );
}