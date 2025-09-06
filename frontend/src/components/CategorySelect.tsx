import { useEffect, useMemo, useRef, useState } from "react";

export type Cat = { id: string; name: string; type: "income" | "expense" };

function Dot({ type }: { type: "income" | "expense" }) {
  return (
    <span
      className={`inline-block rounded-full align-middle ${
        type === "income" ? "bg-emerald-500" : "bg-rose-500"
      }`}
      style={{ width: 8, height: 8 }} // 8px = small & tidy
    />
  );
}

export default function CategorySelect({
  value,
  onChange,
  options,
  placeholder = "Category",
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Cat[];              // pass getCategories() here (already sorted exp->inc)
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = !needle
      ? options
      : options.filter((c) => c.name.toLowerCase().includes(needle));
    // options from cache are already expense-first; keep that order
    return arr;
  }, [q, options]);

  const selected = options.find((c) => c.name === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full border rounded px-3 py-2 text-left bg-white disabled:opacity-50`}
      >
        {selected ? (
          <span className="inline-flex items-center gap-2">
            <Dot type={selected.type} />
            <span>{selected.name}</span>
          </span>
        ) : (
          <span className="text-slate-500">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[min(28rem,90vw)] rounded-lg border bg-white shadow-lg">
          <div className="p-2 border-b">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search categories…"
              className="w-full px-2 py-1.5 rounded border"
            />
          </div>

          <div className="max-h-72 overflow-auto py-1">
            <Group
              title="Expenses"
              items={filtered.filter((c) => c.type === "expense")}
              onPick={(n) => {
                onChange(n);
                setOpen(false);
                setQ("");
              }}
            />
            <Group
              title="Income"
              items={filtered.filter((c) => c.type === "income")}
              onPick={(n) => {
                onChange(n);
                setOpen(false);
                setQ("");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  onPick,
}: {
  title: string;
  items: Cat[];
  onPick: (name: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-xs font-medium text-slate-500">{title}</div>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.name)}
          className="w-full px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 flex items-center gap-2"
        >
          <Dot type={c.type} />
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
}