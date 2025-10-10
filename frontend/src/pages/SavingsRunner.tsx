import { useEffect, useMemo, useRef, useState } from "react";
import { useDataCache } from "@/state/data-cache";
import { buildSavingsRunnerData, type RunnerEvent, type RunnerData } from "@/lib/savingsRunner";
import { fmtUSD } from "@/lib/format";

const CANVAS_WIDTH = 760;
const CANVAS_HEIGHT = 320;
const PLAYER_WIDTH = 44;
const PLAYER_HEIGHT = 44;
const PLAYER_X = 90;
const RUN_DURATION_MS = 60_000;
const SCORE_STORAGE_KEY = "savings-runner-best";

type EngineState = {
  status: "idle" | "running" | "finished";
  score: number;
  coins: number;
  elapsedMs: number;
  lives: number;
  shields: number;
  hits: number;
  streakMs: number;
  bestScore: number | null;
};

type ActiveObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
  amount: number;
  description?: string;
  base: RunnerEvent & { kind: "obstacle" };
};

type ActivePowerUp = {
  id: string;
  x: number;
  y: number;
  radius: number;
  effect: "shield" | "slow" | "coins";
  base: RunnerEvent & { kind: "powerup" };
};

type EngineRuntime = {
  running: boolean;
  lastTs: number;
  elapsed: number;
  score: number;
  coins: number;
  lives: number;
  shields: number;
  hits: number;
  streakMs: number;
  slowUntil: number;
  coinBurstUntil: number;
  events: RunnerEvent[];
  eventPtr: number;
  obstacles: ActiveObstacle[];
  powerUps: ActivePowerUp[];
  lane: number;
  coinMultiplier: number;
  bestScore: number | null;
};

const defaultEngineState: EngineState = {
  status: "idle",
  score: 0,
  coins: 0,
  elapsedMs: 0,
  lives: 0,
  shields: 0,
  hits: 0,
  streakMs: 0,
  bestScore: null,
};

function laneCenterY(lane: number) {
  const laneHeight = CANVAS_HEIGHT / 3;
  return Math.round(laneHeight * lane + laneHeight / 2);
}

function drawBackground(ctx: CanvasRenderingContext2D, elapsed: number, duration: number) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  const laneHeight = CANVAS_HEIGHT / 3;
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(0, laneHeight * i);
    ctx.lineTo(CANVAS_WIDTH, laneHeight * i);
    ctx.stroke();
  }

  // progress bar
  const progress = Math.min(1, elapsed / duration);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, 12, CANVAS_WIDTH, 6);
  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(0, 12, CANVAS_WIDTH * progress, 6);
}

function drawPlayer(ctx: CanvasRenderingContext2D, lane: number, shields: number) {
  const y = laneCenterY(lane);
  ctx.fillStyle = "#facc15";
  ctx.fillRect(PLAYER_X - PLAYER_WIDTH / 2, y - PLAYER_HEIGHT / 2, PLAYER_WIDTH, PLAYER_HEIGHT);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(PLAYER_X - 10, y - 6, 20, 12);
  if (shields > 0) {
    ctx.strokeStyle = "rgba(168, 85, 247,0.7)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(PLAYER_X, y, PLAYER_HEIGHT, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: ActiveObstacle) {
  ctx.fillStyle = obstacle.color;
  ctx.fillRect(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "12px 'Inter', system-ui";
  ctx.textAlign = "center";
  ctx.fillText(obstacle.label, obstacle.x, obstacle.y + obstacle.height / 2 + 14);
}

function drawPowerUp(ctx: CanvasRenderingContext2D, powerUp: ActivePowerUp) {
  ctx.beginPath();
  ctx.arc(powerUp.x, powerUp.y, powerUp.radius, 0, Math.PI * 2);
  ctx.fillStyle =
    powerUp.effect === "shield"
      ? "rgba(168, 85, 247,0.85)"
      : powerUp.effect === "slow"
      ? "rgba(59, 130, 246,0.85)"
      : "rgba(34, 197, 94,0.85)";
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.font = "12px 'Inter', system-ui";
  ctx.textAlign = "center";
  const symbol = powerUp.effect === "shield" ? "🛡" : powerUp.effect === "slow" ? "⏳" : "💰";
  ctx.fillText(symbol, powerUp.x, powerUp.y + 4);
}

function circlesOverlap(ax: number, ay: number, ar: number, bx: number, by: number, bw: number, bh: number) {
  const closestX = clamp(ax, bx - bw / 2, bx + bw / 2);
  const closestY = clamp(ay, by - bh / 2, by + bh / 2);
  const dx = ax - closestX;
  const dy = ay - closestY;
  return dx * dx + dy * dy <= ar * ar;
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: ActiveObstacle) {
  const halfAWidth = a.width / 2;
  const halfAHeight = a.height / 2;
  const halfBWidth = b.width / 2;
  const halfBHeight = b.height / 2;
  return (
    Math.abs(a.x - b.x) < halfAWidth + halfBWidth &&
    Math.abs(a.y - b.y) < halfAHeight + halfBHeight
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readBestScore(): number | null {
  try {
    const raw = localStorage.getItem(SCORE_STORAGE_KEY);
    return raw ? Number(raw) || 0 : null;
  } catch {
    return null;
  }
}

function persistBestScore(score: number) {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, String(score));
  } catch {
    // ignore write failures
  }
}

function initCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  canvas.width = CANVAS_WIDTH * dpr;
  canvas.height = CANVAS_HEIGHT * dpr;
  canvas.style.width = `${CANVAS_WIDTH}px`;
  canvas.style.height = `${CANVAS_HEIGHT}px`;
  ctx.scale(dpr, dpr);
  return ctx;
}

export default function SavingsRunner() {
  const { txns, isLoading, refresh } = useDataCache();
  const [engineState, setEngineState] = useState<EngineState>(defaultEngineState);
  const [lane, setLane] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<EngineRuntime | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const runnerData = useMemo<RunnerData>(() => buildSavingsRunnerData(txns), [txns]);

  useEffect(() => {
    setEngineState((prev) => ({
      ...prev,
      lives: runnerData.difficulty.lives,
      bestScore: readBestScore(),
    }));
  }, [runnerData.difficulty.lives]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key === "w" || event.key === "W") {
        event.preventDefault();
        setLane((prev) => clamp(prev - 1, 0, 2));
      } else if (event.key === "ArrowDown" || event.key === "s" || event.key === "S") {
        event.preventDefault();
        setLane((prev) => clamp(prev + 1, 0, 2));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const stopEngine = (nextState: Partial<EngineState>) => {
    const runtime = runtimeRef.current;
    if (runtime) runtime.running = false;
    setEngineState((prev) => ({
      ...prev,
      status: "finished",
      ...nextState,
    }));
  };

  const updateVisibleState = (runtime: EngineRuntime) => {
    setEngineState((prev) => ({
      ...prev,
      status: "running",
      score: Math.round(runtime.score),
      coins: runtime.coins,
      elapsedMs: runtime.elapsed,
      lives: runtime.lives,
      shields: runtime.shields,
      hits: runtime.hits,
      streakMs: runtime.streakMs,
      bestScore: runtime.bestScore,
    }));
  };

  const loop = (timestamp: number) => {
    const runtime = runtimeRef.current;
    const ctx = ctxRef.current;
    if (!runtime || !runtime.running || !ctx) return;

    if (!runtime.lastTs) runtime.lastTs = timestamp;
    const delta = Math.min(timestamp - runtime.lastTs, 48);
    runtime.lastTs = timestamp;
    runtime.elapsed += delta;

    const diff = runnerData.difficulty;
    const slowActive = runtime.slowUntil > runtime.elapsed;
    const speedFactor = slowActive ? 0.55 : 1;
    const worldSpeed = diff.worldSpeed * speedFactor;

    // spawn events whose time has come
    while (runtime.eventPtr < runtime.events.length) {
      const event = runtime.events[runtime.eventPtr];
      if (event.spawnAtMs > runtime.elapsed) break;
      runtime.eventPtr += 1;
      if (event.kind === "obstacle") {
        const obstacle: ActiveObstacle = {
          id: event.id,
          x: CANVAS_WIDTH + event.width / 2,
          y: laneCenterY(event.lane),
          width: event.width,
          height: event.height,
          color: event.color,
          label: event.category.slice(0, 8),
          amount: event.amount,
          description: event.description,
          base: event,
        };
        runtime.obstacles.push(obstacle);
      } else {
        const powerUp: ActivePowerUp = {
          id: event.id,
          x: CANVAS_WIDTH + 30,
          y: laneCenterY(event.lane),
          radius: 22,
          effect: event.effect,
          base: event,
        };
        runtime.powerUps.push(powerUp);
      }
    }

    // update obstacles
    runtime.obstacles = runtime.obstacles
      .map((obstacle) => ({
        ...obstacle,
        x: obstacle.x - worldSpeed * delta,
      }))
      .filter((obstacle) => obstacle.x + obstacle.width / 2 > 0);

    // update power-ups
    runtime.powerUps = runtime.powerUps
      .map((powerUp) => ({
        ...powerUp,
        x: powerUp.x - worldSpeed * delta,
      }))
      .filter((powerUp) => powerUp.x + powerUp.radius > 0);

    const playerY = laneCenterY(runtime.lane);
    const playerRect = { x: PLAYER_X, y: playerY, width: PLAYER_WIDTH, height: PLAYER_HEIGHT };

    // collisions
    let tookHit = false;
    runtime.obstacles = runtime.obstacles.filter((obstacle) => {
      if (!rectsOverlap(playerRect, obstacle)) return true;
      if (runtime.shields > 0) {
        runtime.shields -= 1;
        return false;
      }
      runtime.lives -= 1;
      runtime.hits += 1;
      runtime.streakMs = 0;
      tookHit = true;
      return false;
    });

    runtime.powerUps = runtime.powerUps.filter((powerUp) => {
      if (!circlesOverlap(powerUp.x, powerUp.y, powerUp.radius, PLAYER_X, playerY, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        return true;
      }
      if (powerUp.effect === "shield") {
        runtime.shields += 1;
      } else if (powerUp.effect === "slow") {
        runtime.slowUntil = runtime.elapsed + 2_400;
      } else {
        const bonus = 5 * Math.max(1, runtime.coinMultiplier);
        runtime.coins += 1;
        runtime.score += bonus;
        runtime.coinBurstUntil = runtime.elapsed + 5_000;
        runtime.coinMultiplier = Math.min(4, runtime.coinMultiplier + 1);
      }
      return false;
    });

    if (!tookHit) {
      runtime.streakMs += delta;
      if (runtime.streakMs >= 10_000) {
        runtime.coinMultiplier = Math.max(runtime.coinMultiplier, 2);
      }
    } else {
      runtime.coinMultiplier = 1;
    }

    if (runtime.coinBurstUntil < runtime.elapsed) {
      runtime.coinMultiplier = Math.max(1, runtime.coinMultiplier - 0.01);
      if (runtime.coinMultiplier < 1.05) runtime.coinMultiplier = 1;
    }

    runtime.score += delta * 0.001;

    drawBackground(ctx, runtime.elapsed, RUN_DURATION_MS);
    drawPlayer(ctx, runtime.lane, runtime.shields);
    runtime.obstacles.forEach((obstacle) => drawObstacle(ctx, obstacle));
    runtime.powerUps.forEach((powerUp) => drawPowerUp(ctx, powerUp));

    runtime.lane = lane;

    if (runtime.elapsed >= RUN_DURATION_MS || runtime.lives <= 0) {
      runtime.running = false;
      const finalScore = Math.round(runtime.score + (runtime.shields > 0 ? 25 : 0));
      if (!runtime.bestScore || finalScore > runtime.bestScore) {
        runtime.bestScore = finalScore;
        persistBestScore(finalScore);
      }
      stopEngine({
        score: finalScore,
        coins: runtime.coins,
        elapsedMs: runtime.elapsed,
        lives: runtime.lives,
        shields: runtime.shields,
        hits: runtime.hits,
        streakMs: runtime.streakMs,
        bestScore: runtime.bestScore,
      });
      return;
    }

    updateVisibleState(runtime);
    runtimeRef.current = runtime;
    runtime.lastTs = timestamp;
    requestAnimationFrame(loop);
  };

  const handleStart = () => {
    if (!canvasRef.current) return;
    const ctx = ctxRef.current ?? initCanvas(canvasRef.current);
    if (!ctx) return;
    ctxRef.current = ctx;

    const runtime: EngineRuntime = {
      running: true,
      lastTs: 0,
      elapsed: 0,
      score: 0,
      coins: 0,
      lives: runnerData.difficulty.lives,
      shields: 0,
      hits: 0,
      streakMs: 0,
      slowUntil: 0,
      coinBurstUntil: 0,
      events: runnerData.events,
      eventPtr: 0,
      obstacles: [],
      powerUps: [],
      lane,
      coinMultiplier: 1,
      bestScore: readBestScore(),
    };
    runtimeRef.current = runtime;
    setEngineState({
      status: "running",
      score: 0,
      coins: 0,
      elapsedMs: 0,
      lives: runtime.lives,
      shields: 0,
      hits: 0,
      streakMs: 0,
      bestScore: runtime.bestScore,
    });
    drawBackground(ctx, 0, RUN_DURATION_MS);
    drawPlayer(ctx, lane, 0);
    requestAnimationFrame(loop);
  };

  useEffect(() => {
    if (!ctxRef.current && canvasRef.current) {
      const ctx = initCanvas(canvasRef.current);
      if (ctx) {
        ctxRef.current = ctx;
        drawBackground(ctx, 0, RUN_DURATION_MS);
        drawPlayer(ctx, lane, 0);
      }
    }
  }, [lane]);

  const running = engineState.status === "running";
  const finished = engineState.status === "finished";
  const savingsRatePct = (runnerData.difficulty.savingsRate * 100).toFixed(1);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Savings Runner</h1>
          <p className="text-sm text-slate-600">
            Dodge your recent expenses, grab income power-ups, and see how your savings rate shapes the difficulty.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Refresh Data
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={runnerData.empty || running}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {running ? "Running…" : runnerData.empty ? "Need Recent Data" : "Start Run"}
          </button>
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Income (30d)" value={fmtUSD(runnerData.stats.totalIncome)} tone="positive" />
        <Stat label="Expenses (30d)" value={fmtUSD(runnerData.stats.totalExpense)} tone="negative" />
        <Stat label="Net Cash Flow" value={fmtUSD(runnerData.stats.netCashFlow)} tone={runnerData.stats.netCashFlow >= 0 ? "positive" : "negative"} />
        <Stat
          label="Savings Rate"
          value={`${savingsRatePct}%`}
          tone={runnerData.difficulty.savingsRate >= 0.25 ? "positive" : runnerData.difficulty.savingsRate >= 0 ? "neutral" : "negative"}
          helper={`Difficulty factor: ${(runnerData.difficulty.difficultyFactor * 100).toFixed(0)}%`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-slate-950/95 p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-200">
              <span>
                Lives: {engineState.lives}
                {engineState.shields > 0 ? ` • Shields: ${engineState.shields}` : ""}
              </span>
              <span>
                Score: <strong className="text-sky-300">{engineState.score}</strong>
              </span>
              <span>{(RUN_DURATION_MS - engineState.elapsedMs) > 0 ? `Time left: ${Math.max(0, RUN_DURATION_MS - engineState.elapsedMs) / 1000 | 0}s` : "Time up!"}</span>
            </div>
            <div className="mt-2 flex justify-center">
              <canvas ref={canvasRef} className="rounded-lg border border-slate-800" />
            </div>
            {!running && !finished ? (
              <p className="mt-3 text-center text-xs text-slate-300">
                Use <kbd className="rounded bg-slate-800 px-1 py-0.5 font-semibold">↑</kbd> / <kbd className="rounded bg-slate-800 px-1 py-0.5 font-semibold">↓</kbd> to change lanes. Avoid expense blocks, grab glowing income orbs.
              </p>
            ) : null}
          </div>
        </div>
        <aside className="space-y-4">
          <DifficultyPanel data={runnerData} />
          <Legend />
          {engineState.bestScore ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              Personal best: <span className="font-semibold">{engineState.bestScore}</span>
            </div>
          ) : null}
        </aside>
      </div>

      {finished ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Run complete</h2>
          <p className="mt-1 text-sm text-slate-600">
            Savings rate {savingsRatePct}% ⇒ Difficulty {(runnerData.difficulty.difficultyFactor * 100).toFixed(0)}%.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm text-slate-700">
            <div>
              <dt className="text-slate-500">Final score</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.score}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Coins collected</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.coins}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Hits taken</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.hits}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Best streak</dt>
              <dd className="text-xl font-semibold text-slate-900">{(engineState.streakMs / 1000).toFixed(1)}s</dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStart}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Run again
            </button>
            <button
              type="button"
              onClick={() => setEngineState(defaultEngineState)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {runnerData.empty && !isLoading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          Need at least one transaction in the past 30 days to generate the course. Add a new transaction or refresh your data.
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  helper?: string;
}) {
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-rose-600" : "text-slate-600";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      {helper ? <div className="text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function DifficultyPanel({ data }: { data: RunnerData }) {
  const difficultyPct = (data.difficulty.difficultyFactor * 100).toFixed(0);
  const descriptors =
    data.difficulty.difficultyFactor <= 0.3
      ? "Relaxed"
      : data.difficulty.difficultyFactor <= 0.6
      ? "Balanced"
      : "Intense";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <h3 className="text-sm font-semibold text-slate-900">Difficulty dial</h3>
      <ul className="mt-2 space-y-1 text-xs">
        <li>
          <span className="font-semibold">{descriptors}</span> • {difficultyPct}% intensity
        </li>
        <li>World speed: {data.difficulty.worldSpeed.toFixed(1)} px/ms</li>
        <li>Lives: {data.difficulty.lives}</li>
        <li>Power-up cadence: every ~{data.difficulty.incomeSpawnEvery.toFixed(1)} events</li>
        <li>Obstacle size multiplier: ×{data.difficulty.sizeMultiplier.toFixed(2)}</li>
      </ul>
    </div>
  );
}

function Legend() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
      <h3 className="text-sm font-semibold text-slate-900">Controls & power-ups</h3>
      <ul className="mt-2 space-y-2">
        <li>
          <span className="font-semibold text-slate-800">Arrow keys</span> — move between the three
          lanes.
        </li>
        <li>
          <span className="font-semibold text-slate-800">🛡 Shield income</span> — absorbs one hit.
        </li>
        <li>
          <span className="font-semibold text-slate-800">⏳ Slow-mo income</span> — halves world speed for ~2.4s.
        </li>
        <li>
          <span className="font-semibold text-slate-800">💰 Coin burst</span> — awards bonus score and ramps coin multiplier.
        </li>
      </ul>
    </div>
  );
}
