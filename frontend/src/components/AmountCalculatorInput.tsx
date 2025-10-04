import { useEffect, useRef, useState } from "react";
import CurrencyInput from "./CurrencyInput";

type Operation = "+" | "-" | "*" | "/";

type AmountCalculatorInputProps = {
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  wrapperClassName?: string;
  inputClassName?: string;
};

export default function AmountCalculatorInput({
  value,
  onChange,
  placeholder,
  wrapperClassName = "inline-block",
  inputClassName,
}: AmountCalculatorInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);

  const isOpen = isHovering || isFocusWithin;

  return (
    <div
      ref={wrapperRef}
      className={`relative ${wrapperClassName}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocus={() => setIsFocusWithin(true)}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && wrapperRef.current?.contains(next)) return;
        setIsFocusWithin(false);
      }}
    >
      <CurrencyInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClassName}
      />
      {isOpen ? (
        <div className="absolute left-0 mt-2 z-20 w-52 rounded border border-slate-200 bg-white p-3 shadow-lg">
          <CalculatorPanel value={value} onValueChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}

type ButtonConfig = {
  label: string;
  onPress: () => void;
  className?: string;
};

function CalculatorPanel({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const [entry, setEntry] = useState<string>(() => formatValue(value));
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Operation | null>(null);
  const [repeatOp, setRepeatOp] = useState<Operation | null>(null);
  const [lastOperand, setLastOperand] = useState<number | null>(null);
  const [overwriteEntry, setOverwriteEntry] = useState(false);

  useEffect(() => {
    setEntry(formatValue(value));
  }, [value]);

  useEffect(() => {
    const parsed = parseEntry(entry);
    if (parsed !== null) {
      onValueChange(parsed);
    }
  }, [entry, onValueChange]);

  const handleDigit = (digit: string) => {
    if (overwriteEntry) {
      setEntry(digit);
      setOverwriteEntry(false);
      setRepeatOp(null);
      setLastOperand(null);
      return;
    }
    setEntry((prev) => (prev === "0" ? digit : prev + digit));
    setRepeatOp(null);
    setLastOperand(null);
  };

  const handleDecimal = () => {
    if (overwriteEntry) {
      setEntry("0.");
      setOverwriteEntry(false);
      setRepeatOp(null);
      setLastOperand(null);
      return;
    }
    setEntry((prev) => {
      if (prev.includes(".")) return prev;
      return prev + ".";
    });
    setRepeatOp(null);
    setLastOperand(null);
  };

  const handleToggleSign = () => {
    setEntry((prev) => {
      if (prev.startsWith("-")) return prev.slice(1) || "0";
      if (prev === "0" || prev === "") return prev;
      return "-" + prev;
    });
  };

  const handleOperator = (nextOp: Operation) => {
    const current = parseEntry(entry) ?? 0;
    if (accumulator === null || pendingOp === null) {
      setAccumulator(current);
    } else {
      const result = compute(accumulator, current, pendingOp);
      setAccumulator(result);
      setEntry(formatValue(result));
      onValueChange(result);
    }
    setPendingOp(nextOp);
    setRepeatOp(null);
    setLastOperand(null);
    setOverwriteEntry(true);
  };

  const handleEquals = () => {
    const current = parseEntry(entry);

    if (pendingOp !== null) {
      const left = accumulator ?? current ?? 0;
      const right = current ?? lastOperand ?? 0;
      const result = compute(left, right, pendingOp);
      setEntry(formatValue(result));
      onValueChange(result);
      setAccumulator(result);
      setRepeatOp(pendingOp);
      setLastOperand(right);
      setPendingOp(null);
      setOverwriteEntry(true);
      return;
    }

    if (repeatOp !== null && lastOperand !== null) {
      const right = lastOperand;
      const left = parseEntry(entry) ?? value;
      const result = compute(left, right, repeatOp);
      setEntry(formatValue(result));
      onValueChange(result);
      setAccumulator(result);
      setOverwriteEntry(true);
    }
  };

  const handleClear = () => {
    setEntry("0");
    setAccumulator(null);
    setPendingOp(null);
    setRepeatOp(null);
    setLastOperand(null);
    setOverwriteEntry(false);
  };

  const handleBackspace = () => {
    setEntry((prev) => {
      if (overwriteEntry) {
        setOverwriteEntry(false);
        return "0";
      }
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith("-"))) return "0";
      return prev.slice(0, -1);
    });
  };

  const buttons: ButtonConfig[] = [
    { label: "C", onPress: handleClear, className: "bg-slate-100" },
    { label: "Bksp", onPress: handleBackspace },
    { label: "/", onPress: () => handleOperator("/") },
    { label: "x", onPress: () => handleOperator("*") },
    { label: "7", onPress: () => handleDigit("7") },
    { label: "8", onPress: () => handleDigit("8") },
    { label: "9", onPress: () => handleDigit("9") },
    { label: "-", onPress: () => handleOperator("-") },
    { label: "4", onPress: () => handleDigit("4") },
    { label: "5", onPress: () => handleDigit("5") },
    { label: "6", onPress: () => handleDigit("6") },
    { label: "+", onPress: () => handleOperator("+") },
    { label: "1", onPress: () => handleDigit("1") },
    { label: "2", onPress: () => handleDigit("2") },
    { label: "3", onPress: () => handleDigit("3") },
    { label: "=", onPress: handleEquals, className: "bg-slate-900 text-white" },
    { label: "0", onPress: () => handleDigit("0"), className: "col-span-2" },
    { label: ".", onPress: handleDecimal },
    { label: "+/-", onPress: handleToggleSign },
  ];

  return (
    <div>
      <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-semibold tracking-wide">
        {entry}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-sm">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            className={`rounded border border-slate-200 px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 ${
              btn.className ?? ""
            }`}
            onClick={btn.onPress}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function compute(left: number, right: number, op: Operation): number {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? left : left / right;
    default:
      return right;
  }
}

function parseEntry(value: string): number | null {
  if (value === "" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return String(value);
}
