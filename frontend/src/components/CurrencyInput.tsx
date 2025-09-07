import { useEffect, useMemo, useState } from "react";

type Props = {
  value: number;                           // numeric cents not required; plain number OK
  onChange: (v: number) => void;           // will pass a Number (NaN -> 0)
  id?: string;
  name?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Controlled currency input.
 * - Lets user type freely (digits + one ".")
 * - Keeps <= 2 decimals
 * - Formats with thousands separators on every change
 * - Stores the numeric value via onChange
 */
export default function CurrencyInput({
  value,
  onChange,
  id,
  name,
  placeholder,
  className = "border p-2 rounded",
}: Props) {
  const [text, setText] = useState<string>("");

  // format helper
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        useGrouping: true,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    []
  );

  // sync external numeric -> text
  useEffect(() => {
    if (Number.isFinite(value)) {
      setText(formatFromNumber(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function normalize(raw: string): { num: number; display: string } {
    // keep digits and a single "."
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const int = parts[0].replace(/^0+(?=\d)/, "") || "0";
    const dec = parts[1] ? parts[1].slice(0, 2) : "";
    const num = Number(int + (dec ? "." + dec : ""));
    const display = dec === "" ? fmt.format(Number(int)) : `${fmt.format(Number(int))}.${dec}`;
    return { num: Number.isFinite(num) ? num : 0, display };
  }

  function formatFromNumber(n: number): string {
    const [i, d] = n.toString().split(".");
    if (d) return `${fmt.format(Number(i))}.${d.slice(0, 2)}`;
    return fmt.format(n);
  }

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      placeholder={placeholder ?? "0.00"}
      className={className}
      value={text}
      onChange={(e) => {
        const { num, display } = normalize(e.target.value);
        setText(display);
        onChange(num);
      }}
      onBlur={() => {
        // ensure two decimals on blur
        const n = Number.isFinite(value) ? value : 0;
        const fixed = n.toLocaleString("en-US", {
          useGrouping: true,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        setText(fixed);
      }}
    />
  );
}