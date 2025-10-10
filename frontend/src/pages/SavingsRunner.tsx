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

const BASE_WIDTH = 420;
const BASE_HEIGHT = 600;
const SCORE_STORAGE_KEY = "savings-asteroids-best";

type EngineState = {
  status: "idle" | "running" | "finished";
  score: number;
  elapsedMs: number;
  hull: number;
  shields: number;
  smartBombs: number;
  shieldHighlightMs: number;
  bombHighlightMs: number;
  rapidHighlightMs: number;
  rapidRemainingMs: number;
  rapidPermanent: boolean;
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
  shieldHighlightMs: number;
  bombHighlightMs: number;
  rapidHighlightMs: number;
  score: number;
  clearedAmount: number;
  rapidUntil: number;
  lastShotAt: number;
  fireCooldown: number;
  uiSyncMs: number;
  bestScore: number | null;
  asteroidPool: AsteroidSpawn[];
  extraSpawnTimer: number;
  extraSpawnInterval: number;
  rampFactor: number;
  rapidPermanent: boolean;
};

const defaultEngineState: EngineState = {
  status: "idle",
  score: 0,
  elapsedMs: 0,
  hull: 3,
  shields: 0,
  smartBombs: 0,
  shieldHighlightMs: 0,
  bombHighlightMs: 0,
  rapidHighlightMs: 0,
  rapidRemainingMs: 0,
  rapidPermanent: false,
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

const createShipGraphic = (width: number, height: number) => {
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
  const bottomOffset = Math.min(80, Math.max(60, height * 0.14));
  ship.position.set(width / 2, height - bottomOffset);
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
  const [lookbackDays, setLookbackDays] = useState(30);
  const [powerToast, setPowerToast] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const runtimeRef = useRef<EngineRuntime | null>(null);
  const inputRef = useRef<InputState>({ left: false, right: false, fire: false, bomb: false });
  const toastTimerRef = useRef<number | null>(null);
  const aspectRatio = BASE_HEIGHT / BASE_WIDTH;

  const computeGameSize = useCallback(() => {
    if (typeof window === "undefined") return { width: BASE_WIDTH, height: BASE_HEIGHT };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxWidth = Math.min(BASE_WIDTH, Math.max(320, vw - 48));
    const maxHeight = Math.min(BASE_HEIGHT, Math.max(420, Math.floor(vh * 0.68)));
    let width = maxWidth;
    let height = Math.round(width * aspectRatio);
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.round(height / aspectRatio);
    }
    return { width, height };
  }, [aspectRatio]);

  const [gameSize, setGameSize] = useState(() => computeGameSize());
  const gameSizeRef = useRef(gameSize);

  const gameData = useMemo<SavingsAsteroidsData>(
    () => buildSavingsAsteroidsData(txns, lookbackDays),
    [txns, lookbackDays],
  );

  useEffect(() => {
    const onResize = () => {
      const size = computeGameSize();
      gameSizeRef.current = size;
      setGameSize(size);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [computeGameSize]);

  const resetInputs = useCallback(() => {
    inputRef.current = { left: false, right: false, fire: false, bomb: false };
  }, []);

  const showPowerToast = useCallback((message: string) => {
    setPowerToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setPowerToast(null);
      toastTimerRef.current = null;
    }, 1400);
  }, []);

  useEffect(() => {
    setEngineState((prev) => ({
      ...prev,
      shields: gameData.difficulty.shields,
      smartBombs: gameData.difficulty.smartBombs,
      shieldHighlightMs: 0,
      bombHighlightMs: 0,
      rapidHighlightMs: 0,
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
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
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
      shieldHighlightMs: runtime.shieldHighlightMs,
      bombHighlightMs: runtime.bombHighlightMs,
      rapidHighlightMs: runtime.rapidHighlightMs,
      rapidRemainingMs: runtime.rapidPermanent ? Number.POSITIVE_INFINITY : Math.max(0, runtime.rapidUntil - runtime.elapsed),
      rapidPermanent: runtime.rapidPermanent,
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
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setPowerToast(null);
    setEngineState({
      status: "finished",
      score: finalScore,
      elapsedMs: runtime.elapsed,
      hull: runtime.hull,
      shields: runtime.shields,
      smartBombs: runtime.smartBombs,
      shieldHighlightMs: runtime.shieldHighlightMs,
      bombHighlightMs: runtime.bombHighlightMs,
      rapidHighlightMs: runtime.rapidHighlightMs,
      rapidRemainingMs: runtime.rapidPermanent ? Number.POSITIVE_INFINITY : Math.max(0, runtime.rapidUntil - runtime.elapsed),
      rapidPermanent: runtime.rapidPermanent,
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
      const width = gameSizeRef.current.width;
      const startX = clamp(((xSeed % 1000) / 1000) * (width - radius * 2) + radius, radius + 12, width - radius - 12);
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
    const width = gameSizeRef.current.width;
    const startX = clamp(((seed % 1000) / 1000) * (width - radius * 2) + radius, 28, width - 28);
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
        const width = gameSizeRef.current.width;
        graphic.x = clamp(asteroid.sprite.x + ratio * 36, radius + 12, width - radius - 12);
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

  const detonateSmartBomb = useCallback(
    (runtime: EngineRuntime) => {
      if (!runtime.smartBombs || !runtime.asteroids.length) return;
      runtime.smartBombs -= 1;
      runtime.bombHighlightMs = 900;
      const flash = new Graphics();
      flash.beginFill(0xf97316, 0.32);
      flash.drawCircle(0, 0, 260);
      flash.endFill();
      flash.position.set(runtime.ship.sprite.x, runtime.ship.sprite.y - 40);
      flash.zIndex = 60;
      runtime.app.stage.addChild(flash);
      let life = 0;
      const animateFlash = (delta: number) => {
        life += delta * (1000 / 60);
        flash.alpha = Math.max(0, 0.35 - life / 420);
        const scale = 1 + life / 520;
        flash.scale.set(scale);
        if (life >= 420) {
          runtime.app.ticker.remove(animateFlash);
          flash.destroy();
        }
      };
      runtime.app.ticker.add(animateFlash);
      runtime.asteroids.forEach((asteroid) => {
        runtime.clearedAmount += asteroid.amount;
        setLastCleared({ category: asteroid.category, amount: asteroid.amount });
        asteroid.sprite.destroy();
      });
      runtime.asteroids = [];
      showPowerToast("Smart bomb deployed!");
    },
    [showPowerToast],
  );

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
      try {
        const deltaMs = delta * (1000 / 60);
        runtime.elapsed += deltaMs;
        runtime.shieldHighlightMs = Math.max(0, runtime.shieldHighlightMs - deltaMs);
        runtime.bombHighlightMs = Math.max(0, runtime.bombHighlightMs - deltaMs);
        runtime.rapidHighlightMs = Math.max(0, runtime.rapidHighlightMs - deltaMs);

        const elapsedRatio = runtime.elapsed / RUN_DURATION_MS;
        const ramp = 1 + Math.min(0.9, Math.max(0, elapsedRatio) * 0.8);
        runtime.rampFactor = ramp;

        while (runtime.eventIndex < runtime.events.length) {
          const event = runtime.events[runtime.eventIndex];
          if (event.spawnAtMs > runtime.elapsed) break;
          runtime.eventIndex += 1;
          if (event.kind === "asteroid") spawnAsteroid(runtime, event);
          else spawnPowerUp(runtime, event);
        }

        const moveSpeed = 0.35 * deltaMs * Math.min(ramp, 1.4);
        const width = gameSizeRef.current.width;
        if (runtime.input.left) {
          runtime.ship.sprite.x = clamp(runtime.ship.sprite.x - moveSpeed, 30, width - 30);
        }
        if (runtime.input.right) {
          runtime.ship.sprite.x = clamp(runtime.ship.sprite.x + moveSpeed, 30, width - 30);
        }

        if (runtime.input.bomb) {
          if (runtime.smartBombs > 0) detonateSmartBomb(runtime);
          else showPowerToast("No smart bombs available");
          runtime.input.bomb = false;
        }

        const isRapid = runtime.elapsed < runtime.rapidUntil;
        runtime.fireCooldown = isRapid ? 220 : Math.max(240, 420 / ramp);
        if (runtime.input.fire && runtime.elapsed - runtime.lastShotAt >= runtime.fireCooldown) {
          spawnProjectile(runtime);
          runtime.lastShotAt = runtime.elapsed;
        }

        for (let i = runtime.bullets.length - 1; i >= 0; i -= 1) {
          const bullet = runtime.bullets[i];
          const bulletBoost = isRapid ? 1.4 : 1 + Math.min(elapsedRatio * 0.6, 0.7);
          bullet.sprite.y -= bullet.vy * bulletBoost * (deltaMs / 1000);
          if (bullet.sprite.y < -20) {
            bullet.sprite.destroy();
            runtime.bullets.splice(i, 1);
          }
        }

        for (let i = runtime.asteroids.length - 1; i >= 0; i -= 1) {
          const asteroid = runtime.asteroids[i];
          asteroid.sprite.y += asteroid.vy * ramp * (deltaMs / 1000);
          const width = gameSizeRef.current.width;
          asteroid.sprite.x = clamp(
            asteroid.sprite.x + asteroid.vx * Math.min(ramp, 1.25) * (deltaMs / 1000),
            asteroid.radius + 8,
            width - asteroid.radius - 8,
          );
        }

        runtime.extraSpawnTimer += deltaMs;
        const extraInterval = Math.max(360, runtime.extraSpawnInterval / ramp);
        if (
          runtime.elapsed > 24000 &&
          runtime.extraSpawnTimer >= extraInterval &&
          runtime.asteroidPool.length
        ) {
          runtime.extraSpawnTimer = 0;
          runtime.extraSpawnInterval = Math.max(420, runtime.extraSpawnInterval * 0.99);
          const template = runtime.asteroidPool[Math.floor(Math.random() * runtime.asteroidPool.length)];
          const extraEvent: AsteroidSpawn = {
            ...template,
            id: `extra-${performance.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
            spawnAtMs: runtime.elapsed,
            velocity: template.velocity * (0.9 + Math.random() * 0.7) * ramp,
            hitPoints: Math.min(template.hitPoints + (ramp > 1.35 ? 1 : 0), 4),
          };
          spawnAsteroid(runtime, extraEvent);
        }

        for (let i = runtime.powerUps.length - 1; i >= 0; i -= 1) {
          const power = runtime.powerUps[i];
          power.sprite.y += power.vy * (deltaMs / 1000);
          if (power.sprite.y > gameSizeRef.current.height + 20) {
            power.sprite.destroy();
            runtime.powerUps.splice(i, 1);
          }
        }

        for (let i = runtime.bullets.length - 1; i >= 0; i -= 1) {
          const bullet = runtime.bullets[i];
          let hit = false;
          for (let j = runtime.asteroids.length - 1; j >= 0; j -= 1) {
            const asteroid = runtime.asteroids[j];
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
              hit = true;
              break;
            }
          }
          if (hit) break;
        }

        for (let i = runtime.powerUps.length - 1; i >= 0; i -= 1) {
          const power = runtime.powerUps[i];
          if (
            circleHit(
              runtime.ship.sprite.x,
              runtime.ship.sprite.y - runtime.ship.radius / 3,
              runtime.ship.radius,
              power.sprite.x,
              power.sprite.y,
              16,
            )
          ) {
            if (power.type === "shield") {
              runtime.shields += 1;
              runtime.shieldHighlightMs = 900;
              showPowerToast("Shield +1");
            } else if (power.type === "smartBomb") {
              runtime.smartBombs += 1;
              runtime.bombHighlightMs = 900;
              showPowerToast("Smart bomb ready");
            } else if (power.type === "rapidFire") {
              runtime.rapidPermanent = true;
              runtime.rapidUntil = RUN_DURATION_MS + 1000;
              runtime.rapidHighlightMs = 900;
              showPowerToast("Rapid fire locked in!");
            }
            power.sprite.destroy();
            runtime.powerUps.splice(i, 1);
          }
        }

        for (let i = runtime.asteroids.length - 1; i >= 0; i -= 1) {
          const asteroid = runtime.asteroids[i];
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
            runtime.asteroids.splice(i, 1);
            continue;
          }
          if (asteroid.sprite.y > gameSizeRef.current.height + asteroid.radius) {
            asteroid.sprite.destroy();
            runtime.asteroids.splice(i, 1);
          }
        }

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
      } catch (error) {
        console.error("Savings Asteroids tick error", error);
        const runtime = runtimeRef.current;
        if (runtime) finishRun(runtime, "Navigation error – run ended");
      }
    },
    [detonateSmartBomb, finishRun, handleProjectileCollision, spawnAsteroid, spawnPowerUp, spawnProjectile, showPowerToast, syncUiFromRuntime],
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
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setPowerToast(null);
    setEngineState((prev) => ({
      ...defaultEngineState,
      bestScore: prev.bestScore,
      shields: gameData.difficulty.shields,
      smartBombs: gameData.difficulty.smartBombs,
      rapidRemainingMs: 0,
    }));
  }, [destroyApp, gameData.difficulty.shields, gameData.difficulty.smartBombs, resetInputs]);

  const handleStart = useCallback(async () => {
    if (isStarting || gameData.empty || !containerRef.current) return;
    setIsStarting(true);
    setLastCleared(null);
    destroyApp();
    resetInputs();
    try {
      const { width, height } = gameSizeRef.current;
      const app = new Application({
        width,
        height,
        backgroundColor: 0x020617,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      appRef.current = app;
      containerRef.current.innerHTML = "";
      containerRef.current.appendChild(app.view as HTMLCanvasElement);

      app.stage.eventMode = "static";
      app.stage.sortableChildren = true;
      app.stage.hitArea = new Rectangle(0, 0, width, height);
      app.stage.cursor = "pointer";

      const shipGraphic = createShipGraphic(width, height);
      shipGraphic.zIndex = 10;
      app.stage.addChild(shipGraphic);
      const ship: ShipInstance = { sprite: shipGraphic, radius: 24 };

      const asteroidPool = gameData.events.filter((event): event is AsteroidSpawn => event.kind === "asteroid");

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
        shieldHighlightMs: 0,
        bombHighlightMs: 0,
        rapidHighlightMs: 0,
        score: 0,
        clearedAmount: 0,
        rapidUntil: 0,
        lastShotAt: -Infinity,
        fireCooldown: 420,
        uiSyncMs: 0,
        bestScore: readBestScore(),
        asteroidPool,
        extraSpawnTimer: 0,
        extraSpawnInterval: Math.max(1100, gameData.difficulty.spawnIntervalMs * 1.35),
        rampFactor: 1,
        rapidPermanent: false,
      };
      runtimeRef.current = runtime;

      app.stage.on("pointermove", (event) => {
        if (runtime.status !== "running") return;
        if (!runtime.pointerActive) return;
        const width = gameSizeRef.current.width;
        const x = clamp(event.global.x, 32, width - 32);
        runtime.ship.sprite.x = x;
      });
      app.stage.on("pointerdown", (event) => {
        if (runtime.status !== "running") return;
        runtime.pointerActive = true;
        const width = gameSizeRef.current.width;
        const x = clamp(event.global.x, 32, width - 32);
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
        shieldHighlightMs: runtime.shieldHighlightMs,
        bombHighlightMs: runtime.bombHighlightMs,
        rapidHighlightMs: runtime.rapidHighlightMs,
        rapidRemainingMs: 0,
        rapidPermanent: false,
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
        rapidRemainingMs: 0,
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
  const lookbackLabel = `${lookbackDays} day${lookbackDays === 1 ? "" : "s"}`;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">Savings Asteroids</h1>
          <p className="text-sm text-slate-600">
            Pilot your ship, blast expense rocks, and collect income power-ups. Difficulty adapts to the time window you pick.
          </p>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Period: {gameData.stats.periodStart} → {gameData.stats.periodEnd}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Data window
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none disabled:opacity-60"
              value={lookbackDays}
              onChange={(event) => setLookbackDays(Number(event.target.value) || 30)}
              disabled={running || isStarting}
            >
              {[7, 14, 30, 45, 60, 90, 120].map((days) => (
                <option key={days} value={days}>
                  Last {days} days
                </option>
              ))}
            </select>
          </label>
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
        </div>
      </header>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={`Income (${lookbackLabel})`} value={fmtUSD(gameData.stats.totalIncome)} tone="positive" />
        <Stat label={`Expenses (${lookbackLabel})`} value={fmtUSD(gameData.stats.totalExpense)} tone="negative" />
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
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Hull: <strong>{engineState.hull}</strong>
                </span>
                <span>
                  Shields:{" "}
                  <strong className={engineState.shieldHighlightMs > 0 ? "text-emerald-300" : undefined}>
                    {engineState.shields}
                  </strong>
                </span>
                <span>
                  Smart bombs:{" "}
                  <strong className={engineState.bombHighlightMs > 0 ? "text-amber-300" : undefined}>
                    {engineState.smartBombs}
                  </strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Score: <strong className="text-sky-300">{engineState.score}</strong>
                </span>
                <span>
                  Time:{" "}
                  <strong>
                    {Math.max(0, Math.ceil((RUN_DURATION_MS - engineState.elapsedMs) / 1000))}s
                  </strong>
                </span>
                <span
                  className={
                    engineState.rapidPermanent || engineState.rapidRemainingMs > 0 || engineState.rapidHighlightMs > 0
                      ? "text-violet-300"
                      : "text-slate-400"
                  }
                >
                  Rapid fire:
                  {engineState.rapidPermanent
                    ? " ∞"
                    : engineState.rapidRemainingMs > 0
                      ? ` ${Math.ceil(engineState.rapidRemainingMs / 1000)}s`
                      : " —"}
                </span>
              </div>
            </div>
            <div className="mt-3 h-9 overflow-hidden rounded-lg bg-violet-500/10 px-3 text-center text-xs text-violet-200 backdrop-blur flex items-center justify-center">
              <span className="transition-opacity duration-150 ease-in" style={{ opacity: powerToast ? 1 : 0 }}>
                {powerToast ?? ""}
              </span>
            </div>
            <div className="mt-3 flex justify-center">
              <div
                ref={containerRef}
                className="relative mx-auto overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                style={{ width: `${gameSize.width}px`, height: `${gameSize.height}px` }}
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
          <strong>{smartBombs}</strong>. Press Enter/Shift or tap the sparkle button to deploy.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-violet-500" />
        <span>
          Rapid income • boosts fire rate for {(rapidMs / 1000).toFixed(1)}s (first pickup now locks it in for the rest of the run).
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
