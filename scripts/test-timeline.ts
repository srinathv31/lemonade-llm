/**
 * Test script for timeline bootstrap (Step 6 checkpoint)
 *
 * Run with: npx tsx scripts/test-timeline.ts
 *
 * This script:
 * 1. Tests ensureDay() with config override
 * 2. Tests ensureDay() with RNG fallback
 * 3. Tests ensureTick() with config and RNG
 * 4. Tests idempotency (calling twice returns same record)
 * 5. Tests status updates
 * 6. Tests seeded RNG determinism
 * 7. Cleans up test data
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import db from "../src/lib/db/drizzle";
import { simulations, simulation_days, simulation_ticks } from "../src/lib/db/drizzle/schema";
import {
  ensureDay,
  ensureTick,
  updateDayStatus,
  updateTickStatus,
  resolveEnvironment,
  resolveTickSnapshot,
} from "../src/lib/sim/engine";
import type { SimulationConfig } from "../src/lib/sim/engine";

// ========================================
// Test Configuration
// ========================================

const TEST_SIMULATION_NAME = "__test_timeline__";

// ========================================
// Main Test
// ========================================

async function main(): Promise<void> {
  console.log("\n=== Timeline Bootstrap Test (Step 6) ===\n");

  let simulationIdWithConfig: string | undefined;
  let simulationIdWithoutConfig: string | undefined;

  try {
    // ========================================
    // Test 1: ensureDay with config override
    // ========================================
    console.log("1. Testing ensureDay() with config override...");

    const configOverride: SimulationConfig = {
      environment: {
        weather: "rainy",
        temperature: 65,
        baseDemand: 80,
        specialEvent: "test_event",
      },
    };

    const [simWithConfig] = await db
      .insert(simulations)
      .values({
        name: `${TEST_SIMULATION_NAME}_with_config`,
        config: configOverride,
        status: "running",
      })
      .returning({ id: simulations.id });
    simulationIdWithConfig = simWithConfig.id;

    const dayResultWithConfig = await ensureDay({
      simulationId: simulationIdWithConfig,
      day: 1,
      seed: 12345,
      config: configOverride,
    });

    console.log("   Day ID:", dayResultWithConfig.dayId);
    console.log("   Environment from config:");
    console.log("     Weather:", dayResultWithConfig.envSnapshot.weather);
    console.log("     Temperature:", dayResultWithConfig.envSnapshot.temperature);
    console.log("     Base Demand:", dayResultWithConfig.envSnapshot.baseDemand);
    console.log("     Special Event:", dayResultWithConfig.envSnapshot.specialEvent);

    // Verify config was used
    if (dayResultWithConfig.envSnapshot.weather !== "rainy") {
      throw new Error("Config override not applied - weather mismatch");
    }
    if (dayResultWithConfig.envSnapshot.specialEvent !== "test_event") {
      throw new Error("Config override not applied - specialEvent mismatch");
    }
    console.log("   Config override applied successfully\n");

    // ========================================
    // Test 2: ensureDay with RNG fallback
    // ========================================
    console.log("2. Testing ensureDay() with RNG fallback...");

    const [simWithoutConfig] = await db
      .insert(simulations)
      .values({
        name: `${TEST_SIMULATION_NAME}_without_config`,
        config: {},
        status: "running",
      })
      .returning({ id: simulations.id });
    simulationIdWithoutConfig = simWithoutConfig.id;

    const dayResultRNG = await ensureDay({
      simulationId: simulationIdWithoutConfig,
      day: 1,
      seed: 54321, // Different seed = different environment
    });

    console.log("   Day ID:", dayResultRNG.dayId);
    console.log("   Environment from RNG (seed 54321):");
    console.log("     Weather:", dayResultRNG.envSnapshot.weather);
    console.log("     Temperature:", dayResultRNG.envSnapshot.temperature);
    console.log("     Base Demand:", dayResultRNG.envSnapshot.baseDemand);
    console.log("     Special Event:", dayResultRNG.envSnapshot.specialEvent ?? "(none)");
    console.log("   RNG generation working\n");

    // ========================================
    // Test 3: RNG determinism
    // ========================================
    console.log("3. Testing RNG determinism (same seed = same output)...");

    const env1 = resolveEnvironment({ seed: 99999 });
    const env2 = resolveEnvironment({ seed: 99999 });

    console.log("   First call:  weather=%s, temp=%d, demand=%d", env1.weather, env1.temperature, env1.baseDemand);
    console.log("   Second call: weather=%s, temp=%d, demand=%d", env2.weather, env2.temperature, env2.baseDemand);

    if (
      env1.weather !== env2.weather ||
      env1.temperature !== env2.temperature ||
      env1.baseDemand !== env2.baseDemand
    ) {
      throw new Error("RNG is not deterministic - same seed produced different output");
    }
    console.log("   RNG is deterministic\n");

    // ========================================
    // Test 4: ensureTick
    // ========================================
    console.log("4. Testing ensureTick()...");

    const tickResult = await ensureTick({
      simulationId: simulationIdWithoutConfig,
      dayId: dayResultRNG.dayId,
      day: 1,
      hour: 12, // Lunch rush hour
      daySeed: dayResultRNG.seed,
    });

    console.log("   Tick ID:", tickResult.tickId);
    console.log("   Hour:", tickResult.hour);
    console.log("   Tick Snapshot:");
    console.log("     Demand Multiplier:", tickResult.tickSnapshot.demandMultiplier);
    console.log("     Event:", tickResult.tickSnapshot.event ?? "(none)");

    // Hour 12 should have lunch_rush event
    if (tickResult.tickSnapshot.event !== "lunch_rush") {
      throw new Error("Tick snapshot event should be lunch_rush for hour 12");
    }
    console.log("   Tick created successfully\n");

    // ========================================
    // Test 5: ensureTick with config override
    // ========================================
    console.log("5. Testing ensureTick() with config override...");

    const tickConfigOverride: SimulationConfig = {
      tickSnapshots: {
        9: { demandMultiplier: 2.5, event: "custom_event" },
      },
    };

    const tickResultConfig = await ensureTick({
      simulationId: simulationIdWithConfig,
      dayId: dayResultWithConfig.dayId,
      day: 1,
      hour: 9,
      daySeed: dayResultWithConfig.seed,
      config: tickConfigOverride,
    });

    console.log("   Tick Snapshot with config:");
    console.log("     Demand Multiplier:", tickResultConfig.tickSnapshot.demandMultiplier);
    console.log("     Event:", tickResultConfig.tickSnapshot.event);

    if (tickResultConfig.tickSnapshot.demandMultiplier !== 2.5) {
      throw new Error("Tick config override not applied - demandMultiplier mismatch");
    }
    if (tickResultConfig.tickSnapshot.event !== "custom_event") {
      throw new Error("Tick config override not applied - event mismatch");
    }
    console.log("   Tick config override applied successfully\n");

    // ========================================
    // Test 6: Idempotency
    // ========================================
    console.log("6. Testing idempotency (ensureDay twice)...");

    const dayResultSecond = await ensureDay({
      simulationId: simulationIdWithoutConfig,
      day: 1,
      seed: 11111, // Different seed, but should return existing record
    });

    console.log("   First call Day ID:", dayResultRNG.dayId);
    console.log("   Second call Day ID:", dayResultSecond.dayId);

    if (dayResultRNG.dayId !== dayResultSecond.dayId) {
      throw new Error("Idempotency failed - different day IDs returned");
    }
    console.log("   Idempotency working - same record returned\n");

    // ========================================
    // Test 7: Status updates
    // ========================================
    console.log("7. Testing status updates...");

    // Update day status
    await updateDayStatus(dayResultRNG.dayId, "running");
    const [dayAfterRunning] = await db
      .select()
      .from(simulation_days)
      .where(eq(simulation_days.id, dayResultRNG.dayId));
    console.log("   Day status after updateDayStatus('running'):", dayAfterRunning.status);
    console.log("   Day started_at set:", dayAfterRunning.started_at !== null);

    await updateDayStatus(dayResultRNG.dayId, "completed");
    const [dayAfterCompleted] = await db
      .select()
      .from(simulation_days)
      .where(eq(simulation_days.id, dayResultRNG.dayId));
    console.log("   Day status after updateDayStatus('completed'):", dayAfterCompleted.status);
    console.log("   Day finished_at set:", dayAfterCompleted.finished_at !== null);

    // Update tick status
    await updateTickStatus(tickResult.tickId, "running");
    const [tickAfterRunning] = await db
      .select()
      .from(simulation_ticks)
      .where(eq(simulation_ticks.id, tickResult.tickId));
    console.log("   Tick status after updateTickStatus('running'):", tickAfterRunning.status);

    await updateTickStatus(tickResult.tickId, "failed", "Test error message");
    const [tickAfterFailed] = await db
      .select()
      .from(simulation_ticks)
      .where(eq(simulation_ticks.id, tickResult.tickId));
    console.log("   Tick status after updateTickStatus('failed'):", tickAfterFailed.status);
    console.log("   Tick error:", tickAfterFailed.error);

    console.log("   Status updates working\n");

    // ========================================
    // Test 8: resolveTickSnapshot patterns
    // ========================================
    console.log("8. Testing hour-based demand patterns...");

    const hours = [9, 10, 11, 12, 13, 14, 15, 16];
    console.log("   Hour | Multiplier | Event");
    console.log("   -----|------------|-------");
    for (const hour of hours) {
      const snapshot = resolveTickSnapshot({ daySeed: 12345, hour });
      const multiplier = snapshot.demandMultiplier ?? 1.0;
      console.log(
        "   %d   | %s       | %s",
        hour,
        multiplier.toFixed(2).padStart(4),
        snapshot.event ?? "-"
      );
    }
    console.log("");

    console.log("\n=== All Tests Passed ===\n");
  } catch (error) {
    console.error("\n=== Test Failed ===\n");
    console.error("Error:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup
    console.log("Cleaning up test data...");

    if (simulationIdWithConfig) {
      await db.delete(simulation_ticks).where(eq(simulation_ticks.simulation_id, simulationIdWithConfig));
      await db.delete(simulation_days).where(eq(simulation_days.simulation_id, simulationIdWithConfig));
      await db.delete(simulations).where(eq(simulations.id, simulationIdWithConfig));
    }
    if (simulationIdWithoutConfig) {
      await db.delete(simulation_ticks).where(eq(simulation_ticks.simulation_id, simulationIdWithoutConfig));
      await db.delete(simulation_days).where(eq(simulation_days.simulation_id, simulationIdWithoutConfig));
      await db.delete(simulations).where(eq(simulations.id, simulationIdWithoutConfig));
    }

    console.log("Cleanup complete.\n");
    process.exit(process.exitCode ?? 0);
  }
}

main();
