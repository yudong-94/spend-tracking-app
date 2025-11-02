import { useEffect, useRef, useState } from "react";
import CurrencyInput from "./CurrencyInput";

const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 320;
const PANEL_MARGIN = 32;

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  if ("maxTouchPoints" in navigator && navigator.maxTouchPoints > 0) return true;
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  return "ontouchstart" in window;
}

function getResponsivePanelWidth() {
  if (typeof window === "undefined") return PANEL_MAX_WIDTH;
  const available = Math.max(window.innerWidth - PANEL_MARGIN, 160);
  const minAllowed = Math.min(PANEL_MIN_WIDTH, available);
  const clamped = Math.min(PANEL_MAX_WIDTH, available);
  return Math.max(minAllowed, clamped);
}

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number>(() => getResponsivePanelWidth());
  const [isTouch, setIsTouch] = useState<boolean>(() => isTouchDevice());
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    setIsTouch(isTouchDevice());
  }, []);

  useEffect(() => {
    if (!isTouch) setManualOpen(false);
  }, [isTouch]);

  useEffect(() => {
    if (!isTouch) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setManualOpen(false);
        setIsFocusWithin(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isTouch]);

  const isOpen = isTouch ? manualOpen : isHovering || isFocusWithin;
  const isCompact = panelWidth <= 240;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setPanelWidth(getResponsivePanelWidth());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isOpen) setPanelWidth(getResponsivePanelWidth());
  }, [isOpen]);

  return (
    <div
      ref={wrapperRef}
      className={`relative ${wrapperClassName}`}
      onMouseEnter={() => !isTouch && setIsHovering(true)}
      onMouseLeave={() => !isTouch && setIsHovering(false)}
      onFocus={() => {
        setIsFocusWithin(true);
        if (isTouch) setManualOpen(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && wrapperRef.current?.contains(next)) return;
        setIsFocusWithin(false);
        if (!isTouch) setManualOpen(false);
      }}
    >
      <CurrencyInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClassName}
        inputMode={isTouch ? "none" : "decimal"}
        readOnly={isTouch}
        inputRef={inputRef}
        onPointerDown={(event) => {
          if (!isTouch) return;
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
          setManualOpen(true);
        }}
      />
      {isOpen ? (
        isTouch ? (
          <>
            <div
              className="fixed inset-0 z-[998] bg-slate-900/25"
              onClick={() => {
                setManualOpen(false);
                setIsFocusWithin(false);
                inputRef.current?.blur();
              }}
            />
            <div className="fixed inset-x-0 bottom-0 z-[999] px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
              <div
                className={`mx-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl ${
                  isCompact ? "p-3" : "p-4"
                }`}
              >
                <div className="mb-2 flex justify-between items-center text-xs text-slate-500">
                  <span>Calculator</span>
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-700"
                    onClick={() => {
                      setManualOpen(false);
                      setIsFocusWithin(false);
                      inputRef.current?.blur();
                    }}
                  >
                    Close
                  </button>
                </div>
                <CalculatorPanel value={value} onValueChange={onChange} isCompact={isCompact} />
              </div>
            </div>
          </>
        ) : (
          <div
            className={`absolute left-0 mt-2 z-20 rounded border border-slate-200 bg-white shadow-lg ${
              isCompact ? "p-2" : "p-3"
            }`}
            style={{ width: panelWidth, maxWidth: "calc(100vw - 16px)" }}
          >
            <CalculatorPanel value={value} onValueChange={onChange} isCompact={isCompact} />
          </div>
        )
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
  isCompact,
}: {
  value: number;
  onValueChange: (value: number) => void;
  isCompact: boolean;
}) {
  const [entry, setEntry] = useState<string>(() => formatValue(value, { pad: true }));
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [pendingOp, setPendingOp] = useState<Operation | null>(null);
  const [repeatOp, setRepeatOp] = useState<Operation | null>(null);
  const [lastOperand, setLastOperand] = useState<number | null>(null);
  const [overwriteEntry, setOverwriteEntry] = useState(true);
  const skipEcho = useRef(false);
  const padNextValue = useRef(true);

  useEffect(() => {
    skipEcho.current = true;
    const pad = padNextValue.current;
    padNextValue.current = false;
    setEntry(formatValue(value, { pad }));
  }, [value]);

  useEffect(() => {
    if (skipEcho.current) {
      skipEcho.current = false;
      return;
    }
    const parsed = parseEntry(entry);
    if (parsed !== null) {
      onValueChange(parsed);
    }
  }, [entry, onValueChange]);

  const handleDigit = (digit: string) => {
    if (overwriteEntry) {
      padNextValue.current = false;
      setEntry(digit);
      setOverwriteEntry(false);
      setRepeatOp(null);
      setLastOperand(null);
      return;
    }
    padNextValue.current = false;
    setEntry((prev) => (isZeroString(prev) ? digit : prev + digit));
    setRepeatOp(null);
    setLastOperand(null);
  };

  const handleDecimal = () => {
    if (overwriteEntry) {
      padNextValue.current = false;
      setEntry("0.");
      setOverwriteEntry(false);
      setRepeatOp(null);
      setLastOperand(null);
      return;
    }
    padNextValue.current = false;
    setEntry((prev) => {
      if (prev.includes(".")) return prev;
      return prev + ".";
    });
    setRepeatOp(null);
    setLastOperand(null);
  };

  const handleToggleSign = () => {
    padNextValue.current = false;
    setEntry((prev) => {
      if (prev.startsWith("-")) return prev.slice(1) || "0";
      if (prev === "0" || prev === "") return prev;
      return "-" + prev;
    });
  };

  const handleOperator = (nextOp: Operation) => {
    const current = parseEntry(entry) ?? 0;
    if (accumulator === null || pendingOp === null) {
      setAccumulator(roundToCents(current));
    } else {
      const result = compute(accumulator, current, pendingOp);
      const rounded = roundToCents(result);
      setAccumulator(rounded);
      padNextValue.current = true;
      setEntry(formatValue(rounded, { pad: true }));
      onValueChange(rounded);
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
      const rounded = roundToCents(result);
      padNextValue.current = true;
      setEntry(formatValue(rounded, { pad: true }));
      onValueChange(rounded);
      setAccumulator(rounded);
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
      const rounded = roundToCents(result);
      padNextValue.current = true;
      setEntry(formatValue(rounded, { pad: true }));
      onValueChange(rounded);
      setAccumulator(rounded);
      setOverwriteEntry(true);
    }
  };

  const handleClear = () => {
    padNextValue.current = true;
    setEntry("0.00");
    setAccumulator(null);
    setPendingOp(null);
    setRepeatOp(null);
    setLastOperand(null);
    setOverwriteEntry(true);
  };

  const handleBackspace = () => {
    padNextValue.current = false;
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
      <div
        className={`rounded border border-slate-200 bg-slate-50 text-right font-semibold tracking-wide ${
          isCompact ? "px-2 py-1 text-sm" : "px-3 py-2 text-base"
        }`}
      >
        {entry}
      </div>
      <div className={`mt-2 grid grid-cols-4 ${isCompact ? "gap-1 text-xs" : "gap-2 text-sm"}`}>
        {buttons.map((btn) => (
          <button
            key={btn.label}
            type="button"
            className={`rounded border border-slate-200 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 ${
              isCompact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
            } ${btn.className ?? ""}`}
            onMouseDown={(event) => {
              // Keep focus on the input so it doesn't briefly reformat while clicking buttons.
              event.preventDefault();
            }}
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

function roundToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function isZeroString(value: string): boolean {
  return /^-?0(?:\.0*)?$/.test(value);
}

function formatValue(value: number, options: { pad?: boolean } = {}): string {
  if (!Number.isFinite(value)) return options.pad ? "0.00" : "0";
  if (options.pad) {
    return roundToCents(value).toFixed(2);
  }
  return String(value);
}
