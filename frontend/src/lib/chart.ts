// Heuristics to estimate Y-axis width so currency/percent labels don't clip.

export function estimateYAxisWidthFromMax(
  maxValue: number,
  formatter: (n: number) => string,
  {
    min = 56,
    max = 120,
    charPx = 8.2,
    pad = 12,
  }: { min?: number; max?: number; charPx?: number; pad?: number } = {},
): number {
  const sample = formatter(Number.isFinite(maxValue) ? maxValue : 0);
  const len = (sample || "").length;
  const approx = Math.ceil(len * charPx + pad);
  return Math.max(min, Math.min(max, approx));
}

export function percentFormatter(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${Math.round(v * 100).toLocaleString()}%`;
}
