import { useEffect, useMemo, useRef, useState } from "react";

export type Cat = { id: string; name: string; type: "income" | "expense" };

function Dot({ type, size = 8 }: { type: "income" | "expense"; size?: number }) {
  return (
    <span
      className={`inline-block rounded-full align-middle ${
        type === "income" ? "bg-emerald-500" : "bg-rose-500"
      }`}
      style={{ width: size, height: size }}
    />
  );
}

type BaseProps = {
  options: Cat[]; // pass getCategories() or getCategories(type)
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string; // category name
  onChange: (v: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[]; // category names
  onChange: (v: string[]) => void;
};

export default function CategorySelect(props: SingleProps | MultiProps) {
  const isMulti = (props as MultiProps).multiple === true;
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

  const selectedNames: string[] = useMemo(
    () => (isMulti ? (props as MultiProps).value : [(props as SingleProps).value].filter(Boolean)),
    [isMulti, props],
  );

  const selected = useMemo(
    () =>
      !isMulti ? props.options.find((c) => c.name === (props as SingleProps).value) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMulti, (props as SingleProps).value, props.options],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = !needle
      ? props.options
      : props.options.filter((c) => c.name.toLowerCase().includes(needle));
    // options already come expense-first from cache; preserve order
    return arr;
  }, [q, props.options]);

  const allNames = useMemo(() => props.options.map((c) => c.name), [props.options]);

  const isSelected = (name: string) => selectedNames.includes(name);

  const toggleMulti = (name: string) => {
    if (!isMulti) return;
    const cur = (props as MultiProps).value;
    const next = isSelected(name) ? cur.filter((n) => n !== name) : [...cur, name];
    (props as MultiProps).onChange(next);
  };

  const pickSingle = (name: string) => {
    if (isMulti) return;
    (props as SingleProps).onChange(name);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={ref} className={`relative ${props.className || ""}`}>
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-full border rounded px-3 py-2 text-left bg-white disabled:opacity-50"
      >
        {isMulti ? (
          selectedNames.length ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-slate-900">{selectedNames.length} selected</span>
            </span>
          ) : (
            <span className="text-slate-500">{props.placeholder ?? "All Categories"}</span>
          )
        ) : selected ? (
          <span className="inline-flex items-center gap-2">
            <Dot type={selected.type} />
            <span>{selected.name}</span>
          </span>
        ) : (
          <span className="text-slate-500">{props.placeholder ?? "Category"}</span>
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
              renderItem={(c) =>
                isMulti ? (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleMulti(c.name)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                  >
                    <input type="checkbox" readOnly checked={isSelected(c.name)} className="mr-1" />
                    <Dot type={c.type} />
                    <span>{c.name}</span>
                  </button>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickSingle(c.name)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Dot type={c.type} />
                    <span>{c.name}</span>
                  </button>
                )
              }
            />
            <Group
              title="Income"
              items={filtered.filter((c) => c.type === "income")}
              renderItem={(c) =>
                isMulti ? (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleMulti(c.name)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                  >
                    <input type="checkbox" readOnly checked={isSelected(c.name)} className="mr-1" />
                    <Dot type={c.type} />
                    <span>{c.name}</span>
                  </button>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pickSingle(c.name)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Dot type={c.type} />
                    <span>{c.name}</span>
                  </button>
                )
              }
            />
          </div>

          {isMulti && (
            <div className="flex justify-between items-center p-2 border-t">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => (props as MultiProps).onChange(allNames)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:underline"
                  onClick={() => (props as MultiProps).onChange([])}
                >
                  Clear
                </button>
              </div>
              <button
                type="button"
                className="px-2 py-1 rounded bg-slate-900 text-white text-sm"
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group<T>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  if (!items.length) return null;
  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-xs font-medium text-slate-500">{title}</div>
      {items.map((it) => renderItem(it))}
    </div>
  );
}
