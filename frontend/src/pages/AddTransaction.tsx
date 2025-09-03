// frontend/src/pages/AddTransaction.tsx
import { useState } from "react";
import { createTransaction, Transaction } from "@/lib/api";

const makeDefault = (): Transaction => ({
  Date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD
  Type: "Expense",
  Category: "",
  Amount: 0,
  Account: "",
  Description: "",
});

export default function AddTransaction() {
  const [form, setForm] = useState<Transaction>(makeDefault());
  const [saving, setSaving] = useState(false);
  const canSubmit =
    form.Date && form.Type && form.Category && !Number.isNaN(Number(form.Amount));

  const onChange =
    (field: keyof Transaction) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      setForm((f) => ({
        ...f,
        [field]: field === "Amount" ? Number(v) : v,
      }));
    };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    try {
      await createTransaction(form);
      setForm(makeDefault());
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
        <input type="date" value={form.Date} onChange={onChange("Date")} className="border p-2 rounded" required />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Type</label>
        <select value={form.Type} onChange={onChange("Type")} className="border p-2 rounded">
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Category</label>
        <input value={form.Category} onChange={onChange("Category")} className="border p-2 rounded" placeholder="Groceries, Rent, Salary..." required />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Amount</label>
        <input type="number" step="0.01" value={form.Amount} onChange={onChange("Amount")} className="border p-2 rounded" required />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Account (optional)</label>
        <input value={form.Account ?? ""} onChange={onChange("Account")} className="border p-2 rounded" />
      </div>

      <div className="grid gap-1">
        <label className="text-sm">Description (optional)</label>
        <textarea value={form.Description ?? ""} onChange={onChange("Description")} className="border p-2 rounded" rows={2} />
      </div>

      <button type="submit" disabled={!canSubmit || saving} className="px-4 py-2 rounded bg-sky-600 text-white disabled:opacity-50">
        {saving ? "Saving…" : "Add"}
      </button>
    </form>
  );
}