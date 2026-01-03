import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDataCache } from "@/state/data-cache";
import PageHeader from "@/components/PageHeader";
import {
  createBenefit,
  updateBenefit,
  deleteBenefit,
  type BenefitCadenceType,
  type Benefit,
  type NewBenefit,
} from "@/lib/api";
import { fmtUSD } from "@/lib/format";

type EditState = {
  id: string;
  name: string;
  amount: string;
  cadenceType: BenefitCadenceType;
  cadenceIntervalDays: string;
  startDate: string;
  creditCard: string;
};

const generateBenefitId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `benefit-${crypto.randomUUID()}`
    : `benefit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cadenceLabel = (benefit: Benefit) => {
  switch (benefit.cadenceType) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "quarterly":
      return "Quarterly";
    case "semi-annual":
      return "Semi-annual";
    case "yearly":
      return "Yearly";
    case "custom":
      return benefit.cadenceIntervalDays ? `Every ${benefit.cadenceIntervalDays} days` : "Custom cadence";
    default:
      return "";
  }
};

const formatPeriod = (start: string, end: string) => {
  return `${start} to ${end}`;
};

export default function BenefitsPage() {
  const { refresh } = useDataCache();

  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<EditState | null>(null);
  const [editErrors, setEditErrors] = useState<{
    name?: string;
    amount?: string;
    cadenceInterval?: string;
    startDate?: string;
  } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadBenefits = async () => {
    try {
      setIsLoading(true);
      const { listBenefits } = await import("@/lib/api");
      const data = await listBenefits();
      setBenefits(data);
    } catch (error) {
      console.error("Failed to load benefits", error);
      alert("Failed to load benefits.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBenefits();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const creditCardSummary = useMemo(() => {
    const byCard = new Map<
      string,
      {
        cardName: string;
        used: { count: number; total: number };
        unused: { count: number; total: number };
      }
    >();

    benefits.forEach((benefit) => {
      const cardName = benefit.creditCard || "No card";
      const isInValidPeriod =
        benefit.validPeriodStart &&
        benefit.validPeriodEnd &&
        today >= benefit.validPeriodStart &&
        today <= benefit.validPeriodEnd;

      if (!isInValidPeriod) return; // Only count benefits within their valid period

      if (!byCard.has(cardName)) {
        byCard.set(cardName, {
          cardName,
          used: { count: 0, total: 0 },
          unused: { count: 0, total: 0 },
        });
      }

      const cardData = byCard.get(cardName)!;
      if (benefit.used) {
        cardData.used.count += 1;
        cardData.used.total += benefit.amount;
      } else {
        cardData.unused.count += 1;
        cardData.unused.total += benefit.amount;
      }
    });

    return Array.from(byCard.values()).sort((a, b) => {
      // Sort by card name, but put "No card" last
      if (a.cardName === "No card") return 1;
      if (b.cardName === "No card") return -1;
      return a.cardName.localeCompare(b.cardName);
    });
  }, [benefits, today]);

  const startEdit = (benefit: Benefit) => {
    setEditingId(benefit.id);
    setEditForm({
      id: benefit.id,
      name: benefit.name,
      amount: benefit.amount.toFixed(2),
      cadenceType: benefit.cadenceType,
      cadenceIntervalDays:
        benefit.cadenceType === "custom" && benefit.cadenceIntervalDays
          ? String(benefit.cadenceIntervalDays)
          : "",
      startDate: benefit.startDate,
      creditCard: benefit.creditCard || "",
    });
    setEditErrors(null);
  };

  const startAdd = () => {
    const today = new Date().toISOString().slice(0, 10);
    setIsAdding(true);
    setEditForm({
      id: generateBenefitId(),
      name: "",
      amount: "",
      cadenceType: "monthly",
      cadenceIntervalDays: "",
      startDate: today,
      creditCard: "",
    });
    setEditErrors(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
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
      cadenceInterval?: string;
      startDate?: string;
    } = {};
    const name = editForm.name.trim();
    if (!name) errors.name = "Name is required";

    const amountValue = Number(editForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      errors.amount = "Enter a positive amount";
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

    if (!editForm.startDate) {
      errors.startDate = "Start date is required";
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setSavingId(editForm.id);
    try {
      if (isAdding) {
        const newBenefit: NewBenefit = {
          id: editForm.id,
          name,
          amount: amountValue,
          cadenceType: editForm.cadenceType,
          cadenceIntervalDays: cadenceIntervalNumber,
          startDate: editForm.startDate,
          creditCard: editForm.creditCard.trim() || undefined,
        };
        await createBenefit(newBenefit);
        await loadBenefits();
        setIsAdding(false);
      } else {
        await updateBenefit({
          id: editForm.id,
          name,
          amount: amountValue,
          cadenceType: editForm.cadenceType,
          cadenceIntervalDays: cadenceIntervalNumber,
          startDate: editForm.startDate,
          creditCard: editForm.creditCard.trim() || undefined,
        });
        await loadBenefits();
        setEditingId(null);
      }
      setEditForm(null);
      setEditErrors(null);
    } catch (error) {
      console.error(error);
      alert(isAdding ? "Failed to create benefit." : "Failed to update benefit.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this benefit?")) return;
    setDeletingId(id);
    try {
      await deleteBenefit(id);
      await loadBenefits();
    } catch (error) {
      console.error(error);
      alert("Failed to delete benefit.");
    } finally {
      setDeletingId(null);
    }
  };

  const navigate = useNavigate();

  const handleToggleUsed = async (benefit: Benefit) => {
    const newUsedState = !benefit.used;
    
    try {
      await updateBenefit({
        id: benefit.id,
        used: newUsedState,
      });
      await loadBenefits();

      // If marking as used, navigate to Add Transaction with pre-filled data
      if (newUsedState) {
        const description = benefit.creditCard
          ? `${benefit.creditCard} - ${benefit.name}`
          : benefit.name;
        const params = new URLSearchParams({
          type: "income",
          category: "Credit Card Rewards",
          amount: benefit.amount.toFixed(2),
          description: description,
        });
        navigate(`/add?${params.toString()}`);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to update benefit.");
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadBenefits();
      await refresh();
      setLastUpdated(Date.now());
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <p className="text-sm text-slate-500">Loading benefits...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader lastUpdated={lastUpdated} onRefresh={onRefresh} isRefreshing={isRefreshing} />

      {creditCardSummary.length > 0 && (
        <section className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Benefits by Credit Card</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Credit Card
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Used
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Unused
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {creditCardSummary.map((card) => {
                  const totalUsed = card.used.total;
                  const totalUnused = card.unused.total;
                  const totalAmount = totalUsed + totalUnused;
                  const totalBenefits = card.used.count + card.unused.count;

                  return (
                    <tr key={card.cardName} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-900">
                        {card.cardName}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <div className="font-medium text-slate-900">{fmtUSD(totalUsed, 2)}</div>
                        <div className="text-xs text-slate-500">
                          {card.used.count} benefit{card.used.count !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <div className="font-medium text-emerald-600">{fmtUSD(totalUnused, 2)}</div>
                        <div className="text-xs text-slate-500">
                          {card.unused.count} benefit{card.unused.count !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <div className="font-semibold text-slate-900">{fmtUSD(totalAmount, 2)}</div>
                        <div className="text-xs text-slate-500">
                          {totalBenefits} benefit{totalBenefits !== 1 ? "s" : ""}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Benefits</h2>
          {!isAdding && (
            <button
              type="button"
              onClick={startAdd}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Add Benefit
            </button>
          )}
        </div>

        {isAdding && editForm ? (
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <div className="grid gap-4">
              <div className="grid gap-1">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => {
                    handleEditChange({ name: e.target.value });
                    setEditErrors((prev) => (prev ? { ...prev, name: undefined } : prev));
                  }}
                  className="rounded border border-slate-300 p-2"
                  placeholder="e.g., $25 Uber Credits"
                />
                {editErrors?.name ? <p className="text-xs text-rose-600">{editErrors.name}</p> : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-sm font-medium">Amount</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editForm.amount}
                    onChange={(e) => {
                      handleEditChange({ amount: e.target.value });
                      setEditErrors((prev) => (prev ? { ...prev, amount: undefined } : prev));
                    }}
                    className="rounded border border-slate-300 p-2"
                    placeholder="25.00"
                  />
                  {editErrors?.amount ? (
                    <p className="text-xs text-rose-600">{editErrors.amount}</p>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <label className="text-sm font-medium">Start Date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={(e) => {
                      handleEditChange({ startDate: e.target.value });
                      setEditErrors((prev) => (prev ? { ...prev, startDate: undefined } : prev));
                    }}
                    className="rounded border border-slate-300 p-2"
                  />
                  {editErrors?.startDate ? (
                    <p className="text-xs text-rose-600">{editErrors.startDate}</p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-1">
                <label className="text-sm font-medium">Credit Card (optional)</label>
                <input
                  type="text"
                  value={editForm.creditCard}
                  onChange={(e) => {
                    handleEditChange({ creditCard: e.target.value });
                  }}
                  className="rounded border border-slate-300 p-2"
                  placeholder="e.g., Chase Sapphire Reserve"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-sm font-medium">Cadence</label>
                <div className="flex flex-col gap-2 md:flex-row">
                  <select
                    value={editForm.cadenceType}
                    onChange={(e) => {
                      const nextCadence = e.target.value as BenefitCadenceType;
                      handleEditChange({
                        cadenceType: nextCadence,
                        cadenceIntervalDays: nextCadence === "custom" ? editForm.cadenceIntervalDays || "30" : "",
                      });
                      setEditErrors((prev) => (prev ? { ...prev, cadenceInterval: undefined } : prev));
                    }}
                    className="rounded border border-slate-300 p-2 md:w-60"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="semi-annual">Semi-annual</option>
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
                        setEditErrors((prev) => (prev ? { ...prev, cadenceInterval: undefined } : prev));
                      }}
                      className="rounded border border-slate-300 p-2 md:w-40"
                      placeholder="Days"
                    />
                  ) : null}
                </div>
                {editErrors?.cadenceInterval ? (
                  <p className="text-xs text-rose-600">{editErrors.cadenceInterval}</p>
                ) : null}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  disabled={savingId === editForm.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingId === editForm.id}
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingId === editForm.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {benefits.length === 0 && !isAdding ? (
          <p className="text-sm text-slate-500">No benefits yet. Add one to get started.</p>
        ) : (
          <div className="space-y-3">
            {benefits.map((benefit) => {
              const isEditing = editingId === benefit.id && editForm;
              const isUsed = benefit.used;

              return (
                <div key={benefit.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1">
                      {isEditing && editForm?.id === benefit.id ? (
                        <div className="grid gap-4">
                          <div className="grid gap-1">
                            <label className="text-sm font-medium">Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => {
                                handleEditChange({ name: e.target.value });
                                setEditErrors((prev) => (prev ? { ...prev, name: undefined } : prev));
                              }}
                              className="rounded border border-slate-300 p-2"
                            />
                            {editErrors?.name ? (
                              <p className="text-xs text-rose-600">{editErrors.name}</p>
                            ) : null}
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <label className="text-sm font-medium">Amount</label>
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={editForm.amount}
                                onChange={(e) => {
                                  handleEditChange({ amount: e.target.value });
                                  setEditErrors((prev) => (prev ? { ...prev, amount: undefined } : prev));
                                }}
                                className="rounded border border-slate-300 p-2"
                              />
                              {editErrors?.amount ? (
                                <p className="text-xs text-rose-600">{editErrors.amount}</p>
                              ) : null}
                            </div>
                            <div className="grid gap-1">
                              <label className="text-sm font-medium">Start Date</label>
                              <input
                                type="date"
                                value={editForm.startDate}
                                onChange={(e) => {
                                  handleEditChange({ startDate: e.target.value });
                                  setEditErrors((prev) => (prev ? { ...prev, startDate: undefined } : prev));
                                }}
                                className="rounded border border-slate-300 p-2"
                              />
                              {editErrors?.startDate ? (
                                <p className="text-xs text-rose-600">{editErrors.startDate}</p>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid gap-1">
                            <label className="text-sm font-medium">Cadence</label>
                            <div className="flex flex-col gap-2 md:flex-row">
                              <select
                                value={editForm.cadenceType}
                                onChange={(e) => {
                                  const nextCadence = e.target.value as BenefitCadenceType;
                                  handleEditChange({
                                    cadenceType: nextCadence,
                                    cadenceIntervalDays:
                                      nextCadence === "custom" ? editForm.cadenceIntervalDays || "30" : "",
                                  });
                                  setEditErrors((prev) =>
                                    prev ? { ...prev, cadenceInterval: undefined } : prev,
                                  );
                                }}
                                className="rounded border border-slate-300 p-2 md:w-60"
                              >
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
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
                                      prev ? { ...prev, cadenceInterval: undefined } : prev,
                                    );
                                  }}
                                  className="rounded border border-slate-300 p-2 md:w-40"
                                  placeholder="Days"
                                />
                              ) : null}
                            </div>
                            {editErrors?.cadenceInterval ? (
                              <p className="text-xs text-rose-600">{editErrors.cadenceInterval}</p>
                            ) : null}
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                              disabled={savingId === benefit.id}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={savingId === benefit.id}
                              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
                            >
                              {savingId === benefit.id ? "Saving…" : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{benefit.name}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                isUsed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {isUsed ? "Used" : "Available"}
                            </span>
                          </div>
                          <div className="text-sm text-slate-600">
                            {fmtUSD(benefit.amount, 2)} · {cadenceLabel(benefit)}
                            {benefit.creditCard ? ` · ${benefit.creditCard}` : ""}
                          </div>
                          <div className="text-xs text-slate-500">
                            Valid Period: {formatPeriod(benefit.validPeriodStart, benefit.validPeriodEnd)}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {!isEditing && (
                        <>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={isUsed}
                                onChange={() => handleToggleUsed(benefit)}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              <span>Used</span>
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(benefit)}
                              className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(benefit.id)}
                              disabled={deletingId === benefit.id}
                              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === benefit.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </>
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

