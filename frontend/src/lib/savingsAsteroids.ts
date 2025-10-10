import type { Tx } from "@/state/data-cache";

export const RUN_DURATION_MS = 60_000;

export type AsteroidSize = "small" | "medium" | "large";
export type PowerUpType = "shield" | "smartBomb" | "rapidFire";

export type SavingsAsteroidsDifficulty = {
  savingsRate: number;
  difficultyFactor: number;
  rockSpeed: number;
  spawnIntervalMs: number;
  shields: number;
  smartBombs: number;
  rapidFireMs: number;
  splitFactor: number;
};

export type SavingsAsteroidsStats = {
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
};

type BaseEvent = {
  id: string;
  spawnAtMs: number;
  amount: number;
  category: string;
  description?: string;
  date: string;
};

export type AsteroidSpawn = BaseEvent & {
  kind: "asteroid";
  size: AsteroidSize;
  hitPoints: number;
  fragments: AsteroidSize[];
  color: string;
  velocity: number;
};

export type PowerUpSpawn = BaseEvent & {
  kind: "powerup";
  powerType: PowerUpType;
};

export type SavingsAsteroidsEvent = AsteroidSpawn | PowerUpSpawn;

export type SavingsAsteroidsData = {
  stats: SavingsAsteroidsStats;
  difficulty: SavingsAsteroidsDifficulty;
  events: SavingsAsteroidsEvent[];
  empty: boolean;
};

const MS_PER_DAY = 86_400_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const hash = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

const colorForCategory = (category: string) => {
  const palette = ["#f97316", "#3b82f6", "#ef4444", "#10b981", "#a855f7", "#0ea5e9", "#facc15"];
  return palette[hash(category) % palette.length];
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
};

const categorizeExpense = (amount: number): AsteroidSize => {
  if (amount < 45) return "small";
  if (amount < 150) return "medium";
  return "large";
};

const baseHitPoints = (size: AsteroidSize) => (size === "large" ? 3 : size === "medium" ? 2 : 1);

const smartBombCategoryHints = ["bonus", "gift", "grant", "award", "stock", "dividend", "commission", "refund"];
const shieldCategoryHints = ["salary", "pay", "paycheck", "wage", "payroll", "income"];

const pickPowerType = (
  amount: number,
  category: string,
  thresholds: { mid: number; high: number },
): PowerUpType => {
  const lowerCategory = category.toLowerCase();
  if (smartBombCategoryHints.some((s) => lowerCategory.includes(s))) return "smartBomb";
  if (shieldCategoryHints.some((s) => lowerCategory.includes(s))) return "shield";
  if (amount >= thresholds.high) return "smartBomb";
  if (amount >= thresholds.mid) return "shield";
  return "rapidFire";
};

export function buildSavingsAsteroidsData(txns: Tx[], lookbackDays = 30, now = new Date()): SavingsAsteroidsData {
  const endDate = new Date(now);
  const days = clamp(Math.max(lookbackDays, 1), 1, 365);
  const startDate = new Date(endDate.getTime() - (days - 1) * MS_PER_DAY);
  const periodStart = startDate.toISOString().slice(0, 10);
  const periodEnd = endDate.toISOString().slice(0, 10);

  const periodTxns = txns
    .filter((tx) => tx.date >= periodStart && tx.date <= periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));

  if (!periodTxns.length) {
    const fallbackDifficulty: SavingsAsteroidsDifficulty = {
      savingsRate: 0,
      difficultyFactor: 0.6,
      rockSpeed: 0.12,
      spawnIntervalMs: 900,
      shields: 2,
      smartBombs: 1,
      rapidFireMs: 4800,
      splitFactor: 1.2,
    };
    return {
      stats: {
        periodStart,
        periodEnd,
        totalIncome: 0,
        totalExpense: 0,
        netCashFlow: 0,
      },
      difficulty: fallbackDifficulty,
      events: [],
      empty: true,
    };
  }

  let incomeTotal = 0;
  let expenseTotal = 0;
  const incomeAmounts: number[] = [];
  const expenseAmounts: number[] = [];

  for (const tx of periodTxns) {
    if (tx.type === "income") {
      incomeTotal += tx.amount;
      incomeAmounts.push(tx.amount);
    } else {
      expenseTotal += tx.amount;
      expenseAmounts.push(tx.amount);
    }
  }

  const netCashFlow = incomeTotal - expenseTotal;
  const rawSavingsRate = incomeTotal > 0 ? netCashFlow / Math.max(incomeTotal, 1) : 0;
  const savingsRate = clamp(rawSavingsRate, -0.6, 0.92);
  const difficultyFactor = 1 - Math.max(savingsRate, 0);
  const stress = clamp(difficultyFactor, 0, 1.2);
  const eased = clamp(stress, 0, 1);

  const rockSpeed = lerp(0.085, 0.23, eased);
  const spawnIntervalMs = lerp(1100, 540, eased);
  const shields = 1 + (savingsRate > 0.35 ? 3 : savingsRate > 0.12 ? 2 : savingsRate > 0 ? 1 : 0);
  const smartBombs = savingsRate > 0.42 ? 2 : savingsRate > 0.05 ? 1 : 0;
  const rapidFireMs = lerp(5200, 3200, eased);
  const splitFactor = 1 + stress * 1.15;

  const difficulty: SavingsAsteroidsDifficulty = {
    savingsRate,
    difficultyFactor,
    rockSpeed,
    spawnIntervalMs,
    shields,
    smartBombs,
    rapidFireMs,
    splitFactor,
  };

  const stats: SavingsAsteroidsStats = {
    periodStart,
    periodEnd,
    totalIncome: incomeTotal,
    totalExpense: expenseTotal,
    netCashFlow,
  };

  const incomeThresholds =
    incomeAmounts.length === 0
      ? { mid: 0, high: Number.MAX_SAFE_INTEGER }
      : {
          mid: percentile(incomeAmounts, 0.55),
          high: percentile(incomeAmounts, 0.8),
        };

  // Uniformly distribute events across the run while maintaining order.
  const totalEvents = periodTxns.length;
  const minGapMs = Math.max(260, Math.round(spawnIntervalMs * 0.65));
  let lastSpawnAt = 0;

  const events: SavingsAsteroidsEvent[] = [];

  periodTxns.forEach((tx, index) => {
    const baseTime =
      totalEvents > 1
        ? Math.round((index / (totalEvents - 1)) * RUN_DURATION_MS)
        : Math.round(RUN_DURATION_MS * 0.4);
    const jitterSeed = hash(`${tx.id ?? tx.date}:${tx.category}:${tx.amount}`);
    const jitter = ((jitterSeed % 400) - 200) * eased;
    let spawnAtMs = clamp(baseTime + jitter, 200, RUN_DURATION_MS - 500);
    if (index === 0) spawnAtMs = Math.max(350, spawnAtMs);
    if (spawnAtMs - lastSpawnAt < minGapMs) {
      spawnAtMs = Math.min(RUN_DURATION_MS - 450, lastSpawnAt + minGapMs);
    }
    lastSpawnAt = spawnAtMs;

    const common = {
      id: tx.id ?? `${tx.date}-${tx.category}-${index}`,
      spawnAtMs,
      amount: tx.amount,
      category: tx.category,
      description: tx.description,
      date: tx.date,
    };

    if (tx.type === "expense") {
      const size = categorizeExpense(tx.amount);
      const velocity = rockSpeed * (0.85 + ((jitterSeed % 70) / 100));
      const baseHp = baseHitPoints(size);
      const fragmentMultiplier = clamp(Math.round(splitFactor + (tx.amount > 400 ? 1 : 0)), 1, 3);
      let fragments: AsteroidSize[] = [];
      if (size === "large") {
        const count = clamp(fragmentMultiplier, 2, 3);
        fragments = new Array(count).fill("medium");
      } else if (size === "medium") {
        const count = clamp(fragmentMultiplier - 1, 1, 2);
        fragments = count > 0 ? new Array(count).fill("small") : [];
      }
      events.push({
        kind: "asteroid",
        ...common,
        size,
        hitPoints: baseHp,
        fragments,
        color: colorForCategory(tx.category),
        velocity,
      });
    } else {
      events.push({
        kind: "powerup",
        ...common,
        powerType: pickPowerType(tx.amount, tx.category, incomeThresholds),
      });
    }
  });

  events.sort((a, b) => a.spawnAtMs - b.spawnAtMs);

  return {
    stats,
    difficulty,
    events,
    empty: false,
  };
}
