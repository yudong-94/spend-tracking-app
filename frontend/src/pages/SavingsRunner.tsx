import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RocketIcon, Shield, Sparkles, Zap } from "lucide-react";
import { Application, Graphics, Rectangle } from "pixi.js";
import { useDataCache } from "@/state/data-cache";
import {
  RUN_DURATION_MS,
  buildSavingsAsteroidsData,
  type AsteroidSize,
  type AsteroidSpawn,
  type PowerUpSpawn,
  type SavingsAsteroidsData,
  type SavingsAsteroidsEvent,
} from "@/lib/savingsAsteroids";
import { fmtUSD } from "@/lib/format";

const GAME_WIDTH = 420;
const GAME_HEIGHT = 720;
const SCORE_STORAGE_KEY = "savings-asteroids-best";

type EngineState = {
  status: "idle" | "running" | "finished";
  score: number;
  elapsedMs: number;
  hull: number;
  shields: number;
  smartBombs: number;
  clearedAmount: number;
  bestScore: number | null;
  message?: string;
};

type ShipInstance = {
  sprite: Graphics;
  radius: number;
};

type AsteroidInstance = {
  id: string;
  sprite: Graphics;
  radius: number;
  vy: number;
  vx: number;
  hitPoints: number;
  fragments: AsteroidSize[];
  amount: number;
  category: string;
  description?: string;
  size: AsteroidSize;
  color: number;
};

type Projectile = {
  sprite: Graphics;
  vy: number;
};

type PowerUpInstance = {
  id: string;
  sprite: Graphics;
  vy: number;
  type: "shield" | "smartBomb" | "rapidFire";
  amount: number;
  category: string;
  description?: string;
};

type InputState = {
  left: boolean;
  right: boolean;
  fire: boolean;
  bomb: boolean;
};

type EngineRuntime = {
  app: Application;
  data: SavingsAsteroidsData;
  events: SavingsAsteroidsEvent[];
  pointerActive: boolean;
  input: InputState;
  status: "running" | "finished";
  startAt: number;
  elapsed: number;
  eventIndex: number;
  ship: ShipInstance;
  asteroids: AsteroidInstance[];
  bullets: Projectile[];
  powerUps: PowerUpInstance[];
  hull: number;
  shields: number;
  smartBombs: number;
  score: number;
  clearedAmount: number;
  rapidUntil: number;
  lastShotAt: number;
  fireCooldown: number;
  uiSyncMs: number;
  bestScore: number | null;
};

const defaultEngineState: EngineState = {
  status: "idle",
  score: 0,
  elapsedMs: 0,
  hull: 3,
  shields: 0,
  smartBombs: 0,
  clearedAmount: 0,
  bestScore: null,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readBestScore = () => {
  try {
    const raw = localStorage.getItem(SCORE_STORAGE_KEY);
    return raw ? Number(raw) || 0 : null;
  } catch {
    return null;
  }
};

const persistBestScore = (score: number) => {
  try {
    localStorage.setItem(SCORE_STORAGE_KEY, String(score));
  } catch {
    // ignore storage quota issues
  }
};

const hexToNumber = (hex: string) => Number.parseInt(hex.replace("#", ""), 16);

const createShipGraphic = () => {
  const ship = new Graphics();
  ship.beginFill(0xfacc15);
  ship.moveTo(0, -26);
  ship.lineTo(18, 22);
  ship.lineTo(-18, 22);
  ship.lineTo(0, -26);
  ship.endFill();
  ship.lineStyle({ width: 2, color: 0x0f172a });
  ship.moveTo(-12, 20);
  ship.lineTo(12, 20);
  ship.lineStyle({ width: 1, color: 0x38bdf8 });
  ship.moveTo(0, -18);
  ship.lineTo(0, 6);
  ship.closePath();
  ship.pivot.set(0, 0);
  ship.x = GAME_WIDTH / 2;
  ship.y = GAME_HEIGHT - 90;
  ship.eventMode = "none";
  return ship;
};

const createAsteroidGraphic = (size: AsteroidSize, color: number) => {
  const g = new Graphics();
  const radius = size === "large" ? 44 : size === "medium" ? 30 : 20;
  g.beginFill(color);
  for (let i = 0; i < 7; i += 1) {
    const angle = (Math.PI * 2 * i) / 7 + Math.random() * 0.3;
    const r = radius * (0.8 + Math.random() * 0.3);
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.endFill();
  g.lineStyle({ width: 2, color: 0x0f172a, alpha: 0.8 });
  g.closePath();
  g.cacheAsBitmap = false;
  return { graphic: g, radius };
};

const createPowerUpGraphic = (type: PowerUpInstance["type"]) => {
  const g = new Graphics();
  const radius = 16;
  g.beginFill(type === "shield" ? 0x22d3ee : type === "smartBomb" ? 0xf97316 : 0x8b5cf6, 0.88);
  g.drawCircle(0, 0, radius);
  g.endFill();
  g.lineStyle({ width: 2, color: 0xffffff, alpha: 0.9 });
  g.drawCircle(0, 0, radius);
  g.closePath();
  return { graphic: g, radius };
};

const circleHit = (
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
) => {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const distanceSq = dx * dx + dy * dy;
  const maxDistance = r1 + r2;
  return distanceSq <= maxDistance * maxDistance;
};

function SavingsRunner() {
  const { txns, isLoading, refresh } = useDataCache();
  const [engineState, setEngineState] = useState<EngineState>(defaultEngineState);
  const [lastCleared, setLastCleared] = useState<{ category: string; amount: number } | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const runtimeRef = useRef<EngineRuntime | null>(null);
  const inputRef = useRef<InputState>({ left: false, right: false, fire: false, bomb: false });

  const gameData = useMemo<SavingsAsteroidsData>(
    () => buildSavingsAsteroidsData(txns),
    [txns],
  );

  const resetInputs = useCallback(() => {
    inputRef.current = { left: false, right: false, fire: false, bomb: false };
  }, []);

  useEffect(() => {
    setEngineState((prev) => ({
      ...prev,
      shields: gameData.difficulty.shields,
      smartBombs: gameData.difficulty.smartBombs,
      bestScore: readBestScore(),
    }));
  }, [gameData.difficulty.shields, gameData.difficulty.smartBombs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        event.preventDefault();
        inputRef.current.left = true;
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        event.preventDefault();
        inputRef.current.right = true;
      } else if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        inputRef.current.fire = true;
      } else if (event.key === "Shift" || event.key === "Enter") {
        event.preventDefault();
        inputRef.current.bomb = true;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
        inputRef.current.left = false;
      } else if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
        inputRef.current.right = false;
      } else if (event.key === " " || event.key === "Spacebar") {
        inputRef.current.fire = false;
      } else if (event.key === "Shift" || event.key === "Enter") {
        inputRef.current.bomb = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(
    () => () => {
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
      runtimeRef.current = null;
    },
    [],
  );

  const syncUiFromRuntime = useCallback((runtime: EngineRuntime) => {
    setEngineState((prev) => ({
      ...prev,
      status: runtime.status === "running" ? "running" : "finished",
      score: Math.round(runtime.score),
      elapsedMs: runtime.elapsed,
      hull: runtime.hull,
      shields: runtime.shields,
      smartBombs: runtime.smartBombs,
      clearedAmount: runtime.clearedAmount,
      bestScore: runtime.bestScore,
    }));
  }, []);

  const finishRun = useCallback((runtime: EngineRuntime, message?: string) => {
    runtime.status = "finished";
    if (runtime.app) runtime.app.ticker.stop();
    const finalScore = Math.round(runtime.score);
    if (!runtime.bestScore || finalScore > runtime.bestScore) {
      persistBestScore(finalScore);
      runtime.bestScore = finalScore;
    }
    setEngineState({
      status: "finished",
      score: finalScore,
      elapsedMs: runtime.elapsed,
      hull: runtime.hull,
      shields: runtime.shields,
      smartBombs: runtime.smartBombs,
      clearedAmount: runtime.clearedAmount,
      bestScore: runtime.bestScore,
      message,
    });
  }, []);

  const spawnAsteroid = useCallback(
    (runtime: EngineRuntime, event: AsteroidSpawn) => {
      const color = hexToNumber(event.color);
      const { graphic, radius } = createAsteroidGraphic(event.size, color);
      const xSeed = event.id.length + event.amount * 1.7;
      const startX = clamp(((xSeed % 1000) / 1000) * (GAME_WIDTH - radius * 2) + radius, radius + 12, GAME_WIDTH - radius - 12);
      graphic.x = startX;
      graphic.y = -radius - 20;
      const vy = event.velocity * 1000; // convert from px/ms to px/s
      const vx = ((xSeed % 7) - 3) * 0.12;
      runtime.app.stage.addChild(graphic);
      runtime.asteroids.push({
        id: event.id,
        sprite: graphic,
        radius,
        vy,
        vx,
        hitPoints: event.hitPoints,
        fragments: event.fragments,
        amount: event.amount,
        category: event.category,
        description: event.description,
        size: event.size,
        color,
      });
    },
    [],
  );

  const spawnPowerUp = useCallback((runtime: EngineRuntime, event: PowerUpSpawn) => {
    const { graphic, radius } = createPowerUpGraphic(event.powerType);
    const seed = event.id.length + event.amount * 0.5;
    const startX = clamp(((seed % 1000) / 1000) * (GAME_WIDTH - radius * 2) + radius, 28, GAME_WIDTH - 28);
    graphic.x = startX;
    graphic.y = -radius - 10;
    runtime.app.stage.addChild(graphic);
    runtime.powerUps.push({
      id: event.id,
      sprite: graphic,
      vy: 90,
      type: event.powerType,
      amount: event.amount,
      category: event.category,
      description: event.description,
    });
  }, []);

  const spawnFragments = useCallback(
    (runtime: EngineRuntime, asteroid: AsteroidInstance) => {
      if (!asteroid.fragments.length) return;
      const share = asteroid.amount / asteroid.fragments.length;
      asteroid.fragments.forEach((size, idx) => {
        const ratio = idx / Math.max(asteroid.fragments.length - 1, 1) - 0.5;
        const { graphic, radius } = createAsteroidGraphic(size, asteroid.color);
        graphic.x = clamp(asteroid.sprite.x + ratio * 36, radius + 12, GAME_WIDTH - radius - 12);
        graphic.y = asteroid.sprite.y;
        runtime.app.stage.addChild(graphic);
        const vy = asteroid.vy * (size === "small" ? 1.2 : 1.05);
        const vx = asteroid.vx + ratio * 45;
        runtime.asteroids.push({
          id: `${asteroid.id}-frag-${idx}`,
          sprite: graphic,
          radius,
          vy,
          vx,
          hitPoints: size === "large" ? 3 : size === "medium" ? 2 : 1,
          fragments: size === "large" ? ["medium", "medium"] : size === "medium" ? ["small", "small"] : [],
          amount: share,
          category: asteroid.category,
          description: asteroid.description,
          size,
          color: asteroid.color,
        });
      });
    },
    [],
  );

  const handleProjectileCollision = useCallback(
    (runtime: EngineRuntime, projectile: Projectile, asteroid: AsteroidInstance) => {
      asteroid.hitPoints -= 1;
      if (asteroid.hitPoints <= 0) {
        runtime.clearedAmount += asteroid.amount;
        setLastCleared({ category: asteroid.category, amount: asteroid.amount });
        spawnFragments(runtime, asteroid);
        asteroid.sprite.destroy();
        runtime.asteroids = runtime.asteroids.filter((a) => a !== asteroid);
      }
      projectile.sprite.destroy();
      runtime.bullets = runtime.bullets.filter((b) => b !== projectile);
    },
    [spawnFragments],
  );

  const detonateSmartBomb = useCallback((runtime: EngineRuntime) => {
    if (!runtime.smartBombs || !runtime.asteroids.length) return;
    runtime.smartBombs -= 1;
    runtime.asteroids.forEach((asteroid) => {
      runtime.clearedAmount += asteroid.amount;
      setLastCleared({ category: asteroid.category, amount: asteroid.amount });
      asteroid.sprite.destroy();
    });
    runtime.asteroids = [];
  }, []);

  const spawnProjectile = useCallback((runtime: EngineRuntime) => {
    const bullet = new Graphics();
    bullet.beginFill(0x38bdf8);
    bullet.drawCircle(0, 0, 6);
    bullet.endFill();
    bullet.x = runtime.ship.sprite.x;
    bullet.y = runtime.ship.sprite.y - 34;
    runtime.app.stage.addChild(bullet);
    runtime.bullets.push({
      sprite: bullet,
      vy: 540,
    });
  }, []);

  const updateGame = useCallback(
    (delta: number) => {
      const runtime = runtimeRef.current;
      if (!runtime || runtime.status !== "running") return;
      const deltaMs = delta * (1000 / 60);
      runtime.elapsed += deltaMs;

      // spawn scheduled events
      while (runtime.eventIndex < runtime.events.length) {
        const event = runtime.events[runtime.eventIndex];
        if (event.spawnAtMs > runtime.elapsed) break;
        runtime.eventIndex += 1;
        if (event.kind === "asteroid") {
          spawnAsteroid(runtime, event);
        } else {
          spawnPowerUp(runtime, event);
        }
      }

      const moveSpeed = 0.35 * deltaMs;
      if (runtime.input.left) {
        runtime.ship.sprite.x = clamp(runtime.ship.sprite.x - moveSpeed, 30, GAME_WIDTH - 30);
      }
      if (runtime.input.right) {
        runtime.ship.sprite.x = clamp(runtime.ship.sprite.x + moveSpeed, 30, GAME_WIDTH - 30);
      }

      if (runtime.input.bomb) {
        detonateSmartBomb(runtime);
        runtime.input.bomb = false;
      }

      const isRapid = runtime.elapsed < runtime.rapidUntil;
      runtime.fireCooldown = isRapid ? 220 : 420;

      if (runtime.input.fire && runtime.elapsed - runtime.lastShotAt >= runtime.fireCooldown) {
        spawnProjectile(runtime);
        runtime.lastShotAt = runtime.elapsed;
      }

      runtime.bullets.forEach((bullet) => {
        bullet.sprite.y -= bullet.vy * (deltaMs / 1000);
      });
      runtime.bullets = runtime.bullets.filter((bullet) => {
        if (bullet.sprite.y < -20) {
          bullet.sprite.destroy();
          return false;
        }
        return true;
      });

      runtime.asteroids.forEach((asteroid) => {
        asteroid.sprite.y += asteroid.vy * (deltaMs / 1000);
        asteroid.sprite.x = clamp(asteroid.sprite.x + asteroid.vx * (deltaMs / 1000), asteroid.radius + 8, GAME_WIDTH - asteroid.radius - 8);
      });

      runtime.powerUps.forEach((power) => {
        power.sprite.y += power.vy * (deltaMs / 1000);
      });

      // collisions projectiles -> asteroids
      runtime.bullets.slice().forEach((bullet) => {
        runtime.asteroids.slice().forEach((asteroid) => {
          if (
            circleHit(
              bullet.sprite.x,
              bullet.sprite.y,
              6,
              asteroid.sprite.x,
              asteroid.sprite.y,
              asteroid.radius,
            )
          ) {
            handleProjectileCollision(runtime, bullet, asteroid);
          }
        });
      });

      // power-up pickup
      runtime.powerUps = runtime.powerUps.filter((pu) => {
        if (
          circleHit(
            runtime.ship.sprite.x,
            runtime.ship.sprite.y - runtime.ship.radius / 3,
            runtime.ship.radius,
            pu.sprite.x,
            pu.sprite.y,
            16,
          )
        ) {
          if (pu.type === "shield") runtime.shields += 1;
          if (pu.type === "smartBomb") {
            runtime.smartBombs += 1;
            detonateSmartBomb(runtime);
          }
          if (pu.type === "rapidFire") {
            runtime.rapidUntil = Math.max(runtime.rapidUntil, runtime.elapsed + runtime.data.difficulty.rapidFireMs);
          }
          pu.sprite.destroy();
          return false;
        }
        if (pu.sprite.y > GAME_HEIGHT + 20) {
          pu.sprite.destroy();
          return false;
        }
        return true;
      });

      // asteroid -> ship/bottom
      runtime.asteroids = runtime.asteroids.filter((asteroid) => {
        if (
          circleHit(
            runtime.ship.sprite.x,
            runtime.ship.sprite.y,
            runtime.ship.radius,
            asteroid.sprite.x,
            asteroid.sprite.y,
            asteroid.radius,
          )
        ) {
          if (runtime.shields > 0) runtime.shields -= 1;
          else runtime.hull -= 1;
          asteroid.sprite.destroy();
          return false;
        }
        if (asteroid.sprite.y > GAME_HEIGHT + asteroid.radius) {
          runtime.hull -= 1;
          asteroid.sprite.destroy();
          return false;
        }
        return true;
      });

      runtime.score = runtime.elapsed / 1000 + runtime.clearedAmount;

      if (runtime.hull <= 0) {
        finishRun(runtime, "Hull integrity failed");
        return;
      }

      if (runtime.elapsed >= RUN_DURATION_MS) {
        finishRun(runtime, "Run complete");
        return;
      }

      if (runtime.elapsed - runtime.uiSyncMs > 140) {
        runtime.uiSyncMs = runtime.elapsed;
        syncUiFromRuntime(runtime);
      }
    },
    [detonateSmartBomb, finishRun, handleProjectileCollision, spawnAsteroid, spawnPowerUp, spawnProjectile, syncUiFromRuntime],
  );

  const destroyApp = useCallback(() => {
    if (appRef.current) {
      appRef.current.destroy(true);
      appRef.current = null;
    }
  }, []);

  const handleReset = useCallback(() => {
    destroyApp();
    runtimeRef.current = null;
    setLastCleared(null);
    resetInputs();
    setEngineState((prev) => ({
      ...defaultEngineState,
      bestScore: prev.bestScore,
      shields: gameData.difficulty.shields,
      smartBombs: gameData.difficulty.smartBombs,
    }));
  }, [destroyApp, gameData.difficulty.shields, gameData.difficulty.smartBombs, resetInputs]);

  const handleStart = useCallback(async () => {
    if (isStarting || gameData.empty || !containerRef.current) return;
    setIsStarting(true);
    setLastCleared(null);
    destroyApp();
    resetInputs();
    try {
      const app = new Application({
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: 0x020617,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      appRef.current = app;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(app.view as HTMLCanvasElement);

      app.stage.eventMode = "static";
      app.stage.hitArea = new Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT);
      app.stage.cursor = "pointer";

      const shipGraphic = createShipGraphic();
      app.stage.addChild(shipGraphic);
      const ship: ShipInstance = { sprite: shipGraphic, radius: 24 };

      const runtime: EngineRuntime = {
        app,
        data: gameData,
        events: gameData.events,
        pointerActive: false,
        input: inputRef.current,
        status: "running",
        startAt: performance.now(),
        elapsed: 0,
        eventIndex: 0,
        ship,
        asteroids: [],
        bullets: [],
        powerUps: [],
        hull: 3,
        shields: gameData.difficulty.shields,
        smartBombs: gameData.difficulty.smartBombs,
        score: 0,
        clearedAmount: 0,
        rapidUntil: 0,
        lastShotAt: -Infinity,
        fireCooldown: 420,
        uiSyncMs: 0,
        bestScore: readBestScore(),
      };
      runtimeRef.current = runtime;

      app.stage.on("pointermove", (event) => {
        if (runtime.status !== "running") return;
        if (!runtime.pointerActive) return;
        const x = clamp(event.global.x, 32, GAME_WIDTH - 32);
        runtime.ship.sprite.x = x;
      });
      app.stage.on("pointerdown", (event) => {
        if (runtime.status !== "running") return;
        runtime.pointerActive = true;
        const x = clamp(event.global.x, 32, GAME_WIDTH - 32);
        runtime.ship.sprite.x = x;
        inputRef.current.fire = true;
      });
      app.stage.on("pointerup", () => {
        runtime.pointerActive = false;
        inputRef.current.fire = false;
      });
      app.stage.on("pointerupoutside", () => {
        runtime.pointerActive = false;
        inputRef.current.fire = false;
      });

      setEngineState({
        status: "running",
        score: 0,
        elapsedMs: 0,
        hull: runtime.hull,
        shields: runtime.shields,
        smartBombs: runtime.smartBombs,
        clearedAmount: 0,
        bestScore: runtime.bestScore,
      });

      app.ticker.add(updateGame);
    } catch (error) {
      console.error("Unable to start Savings Asteroids", error);
      destroyApp();
      runtimeRef.current = null;
      setLastCleared(null);
      resetInputs();
      setEngineState((prev) => ({
        ...defaultEngineState,
        bestScore: prev.bestScore,
        shields: gameData.difficulty.shields,
        smartBombs: gameData.difficulty.smartBombs,
      }));
    } finally {
      setIsStarting(false);
    }
  }, [destroyApp, gameData, isStarting, resetInputs, updateGame]);

  const onControlPress = useCallback((key: keyof InputState, active: boolean) => {
    inputRef.current[key] = active;
  }, []);

  const running = engineState.status === "running";
  const finished = engineState.status === "finished";
  const savingsPct = (gameData.difficulty.savingsRate * 100).toFixed(1);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Savings Asteroids</h1>
          <p className="text-sm text-slate-600">
            Pilot your ship for 60 seconds, blast expense rocks, and collect income power-ups. Difficulty adapts to your last 30 days.
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
            disabled={running || gameData.empty || isStarting}
            onClick={() => void handleStart()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-500"
          >
            {gameData.empty ? "Need Recent Data" : running ? "Running…" : isStarting ? "Starting…" : "Start Run"}
          </button>
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Income (30d)" value={fmtUSD(gameData.stats.totalIncome)} tone="positive" />
        <Stat label="Expenses (30d)" value={fmtUSD(gameData.stats.totalExpense)} tone="negative" />
        <Stat
          label="Net Cash Flow"
          value={fmtUSD(gameData.stats.netCashFlow)}
          tone={gameData.stats.netCashFlow >= 0 ? "positive" : "negative"}
        />
        <Stat
          label="Savings Rate"
          value={`${savingsPct}%`}
          tone={gameData.difficulty.savingsRate >= 0.25 ? "positive" : gameData.difficulty.savingsRate >= 0 ? "neutral" : "negative"}
          helper={`Difficulty ${(gameData.difficulty.difficultyFactor * 100).toFixed(0)}%`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-slate-950/95 p-4 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-200">
              <span>
                Hull: <strong>{engineState.hull}</strong> • Shields: <strong>{engineState.shields}</strong>
              </span>
              <span>
                Score: <strong className="text-sky-300">{engineState.score}</strong>
              </span>
              <span>
                Time:{" "}
                <strong>
                  {Math.max(0, Math.ceil((RUN_DURATION_MS - engineState.elapsedMs) / 1000))}
                  s
                </strong>
              </span>
            </div>
            <div className="mt-3 flex justify-center">
              <div
                ref={containerRef}
                className="relative h-[520px] w-full max-w-[420px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 mx-auto"
              />
            </div>
            <MobileControls running={running} onControlPress={onControlPress} />
            {!running && !finished ? (
              <p className="mt-3 text-center text-xs text-slate-300">
                Drag on the field or use the controls below. Desktop: ◀/▶ to steer, Space to fire, Enter for smart bomb.
              </p>
            ) : null}
            {lastCleared ? (
              <div className="mt-3 rounded-lg bg-slate-900/70 px-3 py-2 text-center text-xs text-slate-200">
                Cleared {lastCleared.category}: {fmtUSD(lastCleared.amount)}
              </div>
            ) : null}
          </div>
        </div>
        <aside className="space-y-4">
          <DifficultyPanel data={gameData} />
          <Legend smartBombs={engineState.smartBombs} rapidMs={gameData.difficulty.rapidFireMs} />
          {engineState.bestScore ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
              Personal best: <span className="font-semibold">{engineState.bestScore}</span>
            </div>
          ) : null}
        </aside>
      </div>

      {finished ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Run summary</h2>
          <p className="mt-1 text-sm text-slate-600">
            {engineState.message ?? "Good flight!"} Savings rate {savingsPct}% ⇒ difficulty{" "}
            {(gameData.difficulty.difficultyFactor * 100).toFixed(0)}%.
          </p>
          <dl className="mt-4 grid gap-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-500">Final score</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.score}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Hull remaining</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.hull}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Shields saved</dt>
              <dd className="text-xl font-semibold text-slate-900">{engineState.shields}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Expenses cleared</dt>
              <dd className="text-xl font-semibold text-slate-900">
                {fmtUSD(engineState.clearedAmount)}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleStart()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Fly again
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {gameData.empty && !isLoading ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
          Add at least one transaction in the past 30 days to generate asteroids and power-ups.
        </div>
      ) : null}
    </div>
  );
}

export default SavingsRunner;

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

function DifficultyPanel({ data }: { data: SavingsAsteroidsData }) {
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
        <li>Rock speed: {(data.difficulty.rockSpeed * 1000).toFixed(0)} px/s</li>
        <li>Spawn cadence: every ~{data.difficulty.spawnIntervalMs.toFixed(0)} ms</li>
        <li>Starting shields: {data.difficulty.shields}</li>
        <li>Smart bombs ready: {data.difficulty.smartBombs}</li>
      </ul>
    </div>
  );
}

function Legend({ smartBombs, rapidMs }: { smartBombs: number; rapidMs: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Power-up guide</h3>
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-sky-500" />
        <span>Shield income • absorb the next hit (stacks indefinitely).</span>
      </div>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span>
          Smart bomb income • wipes all expenses instantly. You currently have{" "}
          <strong>{smartBombs}</strong>.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-violet-500" />
        <span>
          Rapid income • boosts fire rate for {(rapidMs / 1000).toFixed(1)}s. Collecting another extends it.
        </span>
      </div>
    </div>
  );
}

function MobileControls({
  running,
  onControlPress,
}: {
  running: boolean;
  onControlPress: (key: keyof InputState, active: boolean) => void;
}) {
  return (
    <div className="mt-4 flex justify-center gap-4 sm:hidden">
      <button
        type="button"
        aria-label="Steer left"
        disabled={!running}
        onTouchStart={() => onControlPress("left", true)}
        onTouchEnd={() => onControlPress("left", false)}
        onMouseDown={() => onControlPress("left", true)}
        onMouseUp={() => onControlPress("left", false)}
        onMouseLeave={() => onControlPress("left", false)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition active:scale-95 disabled:bg-slate-600"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Fire"
        disabled={!running}
        onTouchStart={() => onControlPress("fire", true)}
        onTouchEnd={() => onControlPress("fire", false)}
        onMouseDown={() => onControlPress("fire", true)}
        onMouseUp={() => onControlPress("fire", false)}
        onMouseLeave={() => onControlPress("fire", false)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg transition active:scale-95 disabled:bg-slate-600"
      >
        <RocketIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Steer right"
        disabled={!running}
        onTouchStart={() => onControlPress("right", true)}
        onTouchEnd={() => onControlPress("right", false)}
        onMouseDown={() => onControlPress("right", true)}
        onMouseUp={() => onControlPress("right", false)}
        onMouseLeave={() => onControlPress("right", false)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition active:scale-95 disabled:bg-slate-600"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
      <button
        type="button"
        aria-label="Smart bomb"
        disabled={!running}
        onTouchStart={() => onControlPress("bomb", true)}
        onTouchEnd={() => onControlPress("bomb", false)}
        onMouseDown={() => onControlPress("bomb", true)}
        onMouseUp={() => onControlPress("bomb", false)}
        onMouseLeave={() => onControlPress("bomb", false)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg transition active:scale-95 disabled:bg-slate-600"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    </div>
  );
}
