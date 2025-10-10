import type { Tx } from "@/state/data-cache";

export type RunnerDifficulty = {
  savingsRate: number;
  difficultyFactor: number;
  worldSpeed: number;
  spawnIntervalMs: number;
  lives: number;
  incomeSpawnEvery: number;
  sizeMultiplier: number;
};

export type RunnerStats = {
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
};

export type ObstacleMeta = {
  severity: "small" | "medium" | "large";
  width: number;
  height: number;
  color: string;
};

export type PowerUpMeta = {
  effect: "shield" | "slow" | "coins";
};

export type RunnerEvent =
  | ({
      kind: "obstacle";
      sizeMult: number;
    } & BaseEvent &
      ObstacleMeta)
  | ({
      kind: "powerup";
    } & BaseEvent &
      PowerUpMeta);

type BaseEvent = {
  id: string;
  spawnAtMs: number;
  amount: number;
  category: string;
  description?: string;
  lane: number;
  date: string;
};

export type RunnerData = {
  stats: RunnerStats;
  difficulty: RunnerDifficulty;
  events: RunnerEvent[];
  empty: boolean;
};

const MS_PER_DAY = 86_400_000;
const RUN_DURATION_MS = 60_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hashLane = (category: string) => {
  let hash = 0;
  for (let i = 0; i < category.length; i += 1) {
    hash = (hash << 5) - hash + category.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 3;
};

const categorizeExpense = (amount: number) => {
  if (amount < 30) return "small";
  if (amount < 120) return "medium";
  return "large";
};

const colorForCategory = (category: string) => {
  const palette = ["#f59e0b", "#3b82f6", "#ef4444", "#10b981", "#6366f1", "#9333ea", "#ec4899"];
  return palette[hashLane(category) % palette.length];
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
};

const buildObstacleMeta = (
  amount: number,
  category: string,
  sizeMultiplier: number,
): ObstacleMeta & { sizeMult: number } => {
  const severity = categorizeExpense(amount);
  const base =
    severity === "small" ? { width: 42, height: 36 } : severity === "medium" ? { width: 58, height: 50 } : { width: 78, height: 68 };
  return {
    severity,
    width: Math.round(base.width * sizeMultiplier),
    height: Math.round(base.height * sizeMultiplier),
    color: colorForCategory(category),
    sizeMult: sizeMultiplier,
  };
};

const pickPowerUpEffect = (amount: number, thresholds: { small: number; medium: number }) => {
  if (amount >= thresholds.medium) return "shield";
  if (amount >= thresholds.small) return "slow";
  return "coins";
};

export function buildSavingsRunnerData(txns: Tx[], now = new Date()): RunnerData {
  const endDate = new Date(now);
  const startDate = new Date(endDate.getTime() - 29 * MS_PER_DAY);
  const startStr = startDate.toISOString().slice(0, 10);
  const endStr = endDate.toISOString().slice(0, 10);

  const periodTxns = txns.filter((tx) => tx.date >= startStr && tx.date <= endStr);
  if (periodTxns.length === 0) {
    const difficulty: RunnerDifficulty = {
      savingsRate: 0,
      difficultyFactor: 0.4,
      worldSpeed: lerp(2.8, 6.5, 0.4),
      spawnIntervalMs: lerp(950, 450, 0.4),
      lives: 1,
      incomeSpawnEvery: lerp(4, 9, 0.4),
      sizeMultiplier: lerp(0.9, 1.25, 0.4),
    };
    return {
      stats: {
        periodStart: startStr,
        periodEnd: endStr,
        totalIncome: 0,
        totalExpense: 0,
        netCashFlow: 0,
      },
      difficulty,
      events: [],
      empty: true,
    };
  }

  let income = 0;
  let expense = 0;
  const expenseAmounts: number[] = [];
  const incomeAmounts: number[] = [];

  for (const tx of periodTxns) {
    if (tx.type === "income") {
      income += tx.amount;
      incomeAmounts.push(tx.amount);
    } else {
      expense += tx.amount;
      expenseAmounts.push(tx.amount);
    }
  }

  const net = income - expense;
  const savingsRate = clamp((income ? net / Math.max(income, 1) : 0) || 0, -0.5, 0.9);
  const difficultyFactor = 1 - Math.max(savingsRate, 0);
  const worldSpeed = lerp(2.8, 6.5, clamp(difficultyFactor, 0, 1));
  const spawnIntervalMs = lerp(950, 450, clamp(difficultyFactor, 0, 1));
  const lives = 1 + (savingsRate > 0.25 ? 2 : savingsRate > 0 ? 1 : 0);
  const incomeSpawnEvery = lerp(4, 9, clamp(difficultyFactor, 0, 1));
  const sizeMultiplier = lerp(0.9, 1.25, clamp(difficultyFactor, 0, 1));

  const p95 = Math.max(percentile(expenseAmounts, 0.95), 1);
  const incomeThresholds =
    incomeAmounts.length === 0
      ? { small: 0, medium: Number.MAX_SAFE_INTEGER }
      : {
          small: percentile(incomeAmounts, 0.33),
          medium: percentile(incomeAmounts, 0.66),
        };

  const daysSpan = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_DAY));
  const sameDayCounts = new Map<string, number>();

  const events: RunnerEvent[] = [];

  for (const tx of periodTxns) {
    const txDate = new Date(tx.date);
    if (!Number.isFinite(txDate.getTime())) continue;

    const dayIndex = clamp(Math.floor((txDate.getTime() - startDate.getTime()) / MS_PER_DAY), 0, 29);
    const baseSpawn = (dayIndex / Math.max(daysSpan, 1)) * RUN_DURATION_MS;
    const key = `${tx.date}:${tx.category}:${tx.type}`;
    const seen = (sameDayCounts.get(key) ?? 0) + 1;
    sameDayCounts.set(key, seen);
    const offset = (seen - 1) * (spawnIntervalMs * 0.25);
    const spawnAtMs = clamp(baseSpawn + offset, 0, RUN_DURATION_MS - 100);
    const lane = hashLane(tx.category);
    const amountCapped = tx.type === "expense" ? Math.min(tx.amount, p95) : tx.amount;

    if (tx.type === "expense") {
      const obstacle = buildObstacleMeta(amountCapped, tx.category, sizeMultiplier);
      events.push({
        kind: "obstacle",
        id: `ob-${tx.id ?? `${tx.date}-${tx.category}-${spawnAtMs}`}`,
        spawnAtMs,
        lane,
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
        date: tx.date,
        ...obstacle,
      });
    } else {
      const effect = pickPowerUpEffect(amountCapped, incomeThresholds);
      events.push({
        kind: "powerup",
        id: `pu-${tx.id ?? `${tx.date}-${tx.category}-${spawnAtMs}`}`,
        spawnAtMs,
        lane,
        amount: tx.amount,
        category: tx.category,
        description: tx.description,
        date: tx.date,
        effect,
      });
    }
  }

  events.sort((a, b) => a.spawnAtMs - b.spawnAtMs);

  return {
    stats: {
      periodStart: startStr,
      periodEnd: endStr,
      totalIncome: income,
      totalExpense: expense,
      netCashFlow: net,
    },
    difficulty: {
      savingsRate,
      difficultyFactor,
      worldSpeed,
      spawnIntervalMs,
      lives,
      incomeSpawnEvery,
      sizeMultiplier,
    },
    events,
    empty: false,
  };
}
