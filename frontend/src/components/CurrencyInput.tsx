import { useEffect, useRef, useState } from "react";
import type { FocusEventHandler, InputHTMLAttributes, MouseEventHandler, PointerEventHandler, RefObject } from "react";

type CurrencyInputProps = {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  className?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  readOnly?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onClick?: MouseEventHandler<HTMLInputElement>;
  onPointerDown?: PointerEventHandler<HTMLInputElement>;
  inputRef?: RefObject<HTMLInputElement>;
};

export default function CurrencyInput({
  value,
  onChange,
  placeholder = "",
  className = "border p-2 rounded",
  inputMode = "decimal",
  readOnly = false,
  onFocus,
  onBlur,
  onClick,
  onPointerDown,
  inputRef,
}: CurrencyInputProps) {
  const ownRef = useRef<HTMLInputElement>(null);
  const mergedRef = inputRef ?? ownRef;
  const [raw, setRaw] = useState<string>("");

  const formatNice = (n: number) =>
    Number.isFinite(n)
      ? n.toLocaleString(undefined, {
          minimumFractionDigits: n % 1 ? 2 : 0,
          maximumFractionDigits: 2,
        })
      : "";

  useEffect(() => {
    if (document.activeElement !== mergedRef.current) {
      setRaw(value ? formatNice(value) : "");
    }
  }, [value, mergedRef]);

  const parseToNumber = (s: string): number => {
    const cleaned = s.replace(/[^\d.,-]/g, "").replace(/,/g, ".");
    const parts = cleaned.split(".");
    const normalized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <input
      ref={mergedRef}
      inputMode={inputMode}
      placeholder={placeholder}
      className={className}
      value={raw}
      readOnly={readOnly}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        onChange(parseToNumber(s));
      }}
      onFocus={(event) => {
        setRaw(value ? String(value) : "");
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setRaw(value ? formatNice(value) : "");
        onBlur?.(event);
      }}
    />
  );
}
