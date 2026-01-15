import { eq, and } from "drizzle-orm";
import db from "../../db/drizzle";
import { simulation_days, simulation_ticks } from "../../db/drizzle/schema";
import type { EnvironmentSnapshot, TickSnapshot } from "../prompts";
import type {
  SimulationConfig,
  DayStatus,
  TickStatus,
  EnsureDayParams,
  EnsureDayResult,
  EnsureTickParams,
  EnsureTickResult,
  ResolveEnvironmentParams,
  ResolveTickSnapshotParams,
} from "./types";

// ========================================
// Seeded RNG (Mulberry32)
// ========================================

/**
 * Mulberry32 PRNG - simple, fast, deterministic.
 * Returns a function that generates numbers in [0, 1).
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random integer in [min, max] inclusive.
 */
function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 */
function randomPick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ========================================
// Environment Resolution
// ========================================

const WEATHER_OPTIONS: EnvironmentSnapshot["weather"][] = [
  "sunny",
  "cloudy",
  "rainy",
  "hot",
  "cold",
];

const SPECIAL_EVENTS = [
  "parade",
  "festival",
  "farmers_market",
  "sports_game",
  "concert",
];

/**
 * Default environment values when partially specified.
 */
const DEFAULT_ENVIRONMENT: EnvironmentSnapshot = {
  weather: "sunny",
  temperature: 75,
  baseDemand: 100,
};

/**
 * Resolve environment snapshot using config-first, RNG-fallback pattern.
 *
 * Priority:
 * 1. Use config.environment if provided (merge with defaults)
 * 2. Generate deterministically from seed
 */
export function resolveEnvironment(
  params: ResolveEnvironmentParams
): EnvironmentSnapshot {
  const { config, seed } = params;

  // Config override takes priority
  if (config?.environment) {
    return {
      ...DEFAULT_ENVIRONMENT,
      ...config.environment,
    };
  }

  // Fall back to seeded RNG generation
  return generateEnvironmentFromSeed(seed);
}

/**
 * Generate environment deterministically from seed.
 */
function generateEnvironmentFromSeed(seed: number): EnvironmentSnapshot {
  const rng = mulberry32(seed);

  const weather = randomPick(rng, WEATHER_OPTIONS);

  // Temperature varies by weather type
  let tempMin = 65;
  let tempMax = 85;
  if (weather === "hot") {
    tempMin = 85;
    tempMax = 100;
  } else if (weather === "cold") {
    tempMin = 45;
    tempMax = 60;
  } else if (weather === "rainy") {
    tempMin = 55;
    tempMax = 75;
  }
  const temperature = randomInt(rng, tempMin, tempMax);

  // Base demand varies by weather
  let demandMin = 60;
  let demandMax = 140;
  if (weather === "sunny" || weather === "hot") {
    demandMin = 80;
    demandMax = 150;
  } else if (weather === "rainy" || weather === "cold") {
    demandMin = 40;
    demandMax = 100;
  }
  const baseDemand = randomInt(rng, demandMin, demandMax);

  // 10% chance of special event
  const hasSpecialEvent = rng() < 0.1;
  const specialEvent = hasSpecialEvent
    ? randomPick(rng, SPECIAL_EVENTS)
    : undefined;

  return {
    weather,
    temperature,
    baseDemand,
    specialEvent,
  };
}

// ========================================
// Tick Snapshot Resolution
// ========================================

/**
 * Default tick snapshot values.
 */
const DEFAULT_TICK_SNAPSHOT: TickSnapshot = {
  demandMultiplier: 1.0,
};

/**
 * Hour-based demand patterns for RNG generation.
 */
const HOUR_DEMAND_PATTERNS: Record<number, { min: number; max: number }> = {
  9: { min: 0.7, max: 0.9 }, // Morning ramp-up
  10: { min: 0.8, max: 1.0 },
  11: { min: 0.9, max: 1.1 },
  12: { min: 1.1, max: 1.4 }, // Lunch rush
  13: { min: 1.0, max: 1.3 },
  14: { min: 0.8, max: 1.0 }, // Afternoon lull
  15: { min: 0.7, max: 0.9 },
  16: { min: 0.9, max: 1.1 }, // Late afternoon pickup
};

/**
 * Hour-based events.
 */
const HOUR_EVENTS: Record<number, string | undefined> = {
  12: "lunch_rush",
  15: "afternoon_lull",
};

/**
 * Resolve tick snapshot using config-first, RNG-fallback pattern.
 *
 * Priority:
 * 1. Use config.tickSnapshots[hour] if provided (merge with defaults)
 * 2. Generate deterministically from daySeed + hour
 */
export function resolveTickSnapshot(
  params: ResolveTickSnapshotParams
): TickSnapshot {
  const { config, daySeed, hour } = params;

  // Config override takes priority
  if (config?.tickSnapshots?.[hour]) {
    return {
      ...DEFAULT_TICK_SNAPSHOT,
      ...config.tickSnapshots[hour],
    };
  }

  // Fall back to seeded RNG generation
  return generateTickSnapshotFromSeed(daySeed, hour);
}

/**
 * Generate tick snapshot deterministically from seed + hour.
 */
function generateTickSnapshotFromSeed(
  daySeed: number,
  hour: number
): TickSnapshot {
  // Combine day seed with hour for unique per-tick randomness
  const tickSeed = daySeed * 100 + hour;
  const rng = mulberry32(tickSeed);

  // Get hour-based demand pattern
  const pattern = HOUR_DEMAND_PATTERNS[hour] ?? { min: 0.8, max: 1.2 };
  const demandMultiplier =
    pattern.min + rng() * (pattern.max - pattern.min);

  // Round to 2 decimal places
  const roundedMultiplier = Math.round(demandMultiplier * 100) / 100;

  // Get hour-based event
  const event = HOUR_EVENTS[hour];

  return {
    demandMultiplier: roundedMultiplier,
    event,
  };
}

// ========================================
// Day Bootstrap
// ========================================

/**
 * Ensure a simulation day record exists.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 *
 * @returns The day record with its resolved environment
 */
export async function ensureDay(
  params: EnsureDayParams
): Promise<EnsureDayResult> {
  const { simulationId, day, config } = params;

  // Generate seed if not provided
  const seed = params.seed ?? generateDaySeed(simulationId, day);

  // Resolve environment (config-first, RNG-fallback)
  const envSnapshot = resolveEnvironment({ config, seed });

  // Try to insert (will do nothing if exists due to unique constraint)
  await db
    .insert(simulation_days)
    .values({
      simulation_id: simulationId,
      day,
      seed,
      env_snapshot: envSnapshot,
      status: "pending",
    })
    .onConflictDoNothing();

  // Select the record (either existing or newly created)
  const [row] = await db
    .select()
    .from(simulation_days)
    .where(
      and(
        eq(simulation_days.simulation_id, simulationId),
        eq(simulation_days.day, day)
      )
    );

  if (!row) {
    throw new Error(
      `Failed to ensure day record for simulation ${simulationId}, day ${day}`
    );
  }

  // Determine if we created a new record
  // If the seed matches what we tried to insert, it's likely new
  // (existing records would have their own seed)
  const wasCreated = row.seed === seed;

  return {
    dayId: row.id,
    day: row.day,
    seed: row.seed ?? seed,
    envSnapshot: (row.env_snapshot as EnvironmentSnapshot) ?? envSnapshot,
    wasCreated,
  };
}

/**
 * Generate a deterministic day seed from simulation ID and day number.
 */
function generateDaySeed(simulationId: string, day: number): number {
  // Simple hash combining simulation ID and day
  let hash = 0;
  for (let i = 0; i < simulationId.length; i++) {
    const char = simulationId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash + day * 1000);
}

// ========================================
// Tick Bootstrap
// ========================================

/**
 * Ensure a simulation tick record exists.
 * Uses INSERT ... ON CONFLICT DO NOTHING for idempotency.
 *
 * @returns The tick record with its resolved snapshot
 */
export async function ensureTick(
  params: EnsureTickParams
): Promise<EnsureTickResult> {
  const { simulationId, day, hour, daySeed, config } = params;

  // Resolve tick snapshot (config-first, RNG-fallback)
  const tickSnapshot = resolveTickSnapshot({ config, daySeed, hour });

  // Try to insert (will do nothing if exists due to unique constraint)
  await db
    .insert(simulation_ticks)
    .values({
      simulation_id: simulationId,
      day,
      hour,
      tick_snapshot: tickSnapshot,
      status: "pending",
    })
    .onConflictDoNothing();

  // Select the record (either existing or newly created)
  const [row] = await db
    .select()
    .from(simulation_ticks)
    .where(
      and(
        eq(simulation_ticks.simulation_id, simulationId),
        eq(simulation_ticks.day, day),
        eq(simulation_ticks.hour, hour)
      )
    );

  if (!row) {
    throw new Error(
      `Failed to ensure tick record for simulation ${simulationId}, day ${day}, hour ${hour}`
    );
  }

  // Determine if we created a new record by checking if snapshot matches
  const existingSnapshot = row.tick_snapshot as TickSnapshot | null;
  const wasCreated =
    existingSnapshot?.demandMultiplier === tickSnapshot.demandMultiplier;

  return {
    tickId: row.id,
    day: row.day,
    hour: row.hour,
    tickSnapshot: existingSnapshot ?? tickSnapshot,
    wasCreated,
  };
}

// ========================================
// Status Updates
// ========================================

/**
 * Update the status of a simulation day.
 * Clears finished_at when transitioning back to running (retry scenarios).
 */
export async function updateDayStatus(
  dayId: string,
  status: DayStatus,
  error?: string
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === "running") {
    updates.started_at = new Date();
    updates.finished_at = null; // Clear for retry scenarios
  } else if (status === "completed" || status === "failed") {
    updates.finished_at = new Date();
  }

  await db
    .update(simulation_days)
    .set(updates)
    .where(eq(simulation_days.id, dayId));
}

/**
 * Update the status of a simulation tick.
 * Clears finished_at and error when transitioning back to running (retry scenarios).
 */
export async function updateTickStatus(
  tickId: string,
  status: TickStatus,
  error?: string
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === "running") {
    updates.started_at = new Date();
    updates.finished_at = null; // Clear for retry scenarios
    updates.error = null;       // Clear previous error
  } else if (status === "completed" || status === "partial" || status === "failed") {
    updates.finished_at = new Date();
    if (error) {
      updates.error = error;
    }
  }

  await db
    .update(simulation_ticks)
    .set(updates)
    .where(eq(simulation_ticks.id, tickId));
}
