import { useEffect, useRef, useState } from "react";

export default function CurrencyInput({
  value,
  onChange,
  placeholder = "",
  className = "border p-2 rounded",
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<string>("");

  // render helper
  const formatNice = (n: number) =>
    Number.isFinite(n)
      ? n.toLocaleString(undefined, {
          minimumFractionDigits: n % 1 ? 2 : 0,
          maximumFractionDigits: 2,
        })
      : "";

  // keep internal string in sync when parent value changes (but don't fight the user while typing)
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setRaw(value ? formatNice(value) : "");
    }
  }, [value]);

  // parse "1,234.56" or "1.234,56" → 1234.56
  const parseToNumber = (s: string): number => {
    const cleaned = s.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
    // collapse extra dots (1.2.3 -> 1.23)
    const parts = cleaned.split(".");
    const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <input
      ref={inputRef}
      inputMode="decimal"
      placeholder={placeholder}
      className={className}
      value={raw}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        onChange(parseToNumber(s));
      }}
      onFocus={() => setRaw(value ? String(value) : "")}
      onBlur={() => setRaw(value ? formatNice(value) : "")}
    />
  );
}
