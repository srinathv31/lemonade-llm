/**
 * Test script for agent turn runner (Step 5 checkpoint)
 *
 * Run with: npx tsx scripts/test-agent-turn.ts
 *
 * This script:
 * 1. Creates test data (simulation, agent, day, tick)
 * 2. Calls runAgentTurn with a minimal prompt context
 * 3. Verifies the decision and artifact were persisted
 * 4. Cleans up test data
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import db from "../src/lib/db/drizzle";
import {
  simulations,
  agents,
  simulation_days,
  simulation_ticks,
  agent_decisions,
  simulation_artifacts,
} from "../src/lib/db/drizzle/schema";
import { runAgentTurn } from "../src/lib/sim/engine";
import type { PromptContext } from "../src/lib/sim/prompts";

// ========================================
// Test Configuration
// ========================================

const TEST_MODEL = "llama3.1:latest"; // Available model in Ollama
const TEST_SIMULATION_NAME = "__test_agent_turn__";

// ========================================
// Main Test
// ========================================

async function main(): Promise<void> {
  console.log("\n=== Agent Turn Runner Test ===\n");

  let simulationId: string | undefined;
  let agentId: string | undefined;
  let dayId: string | undefined;
  let tickId: string | undefined;

  try {
    // Step 1: Create test simulation
    console.log("1. Creating test simulation...");
    const [sim] = await db
      .insert(simulations)
      .values({
        name: TEST_SIMULATION_NAME,
        config: { test: true, modelName: TEST_MODEL },
        status: "running",
      })
      .returning({ id: simulations.id });
    simulationId = sim.id;
    console.log(`   Simulation ID: ${simulationId}`);

    // Step 2: Create test agent
    console.log("2. Creating test agent...");
    const [agent] = await db
      .insert(agents)
      .values({
        simulation_id: simulationId,
        model_name: TEST_MODEL,
        strategy: { testAgent: true },
      })
      .returning({ id: agents.id });
    agentId = agent.id;
    console.log(`   Agent ID: ${agentId}`);

    // Step 3: Create test day
    console.log("3. Creating test day...");
    const [day] = await db
      .insert(simulation_days)
      .values({
        simulation_id: simulationId,
        day: 1,
        seed: 12345,
        env_snapshot: {
          weather: "sunny",
          temperature: 75,
          baseDemand: 100,
        },
        status: "running",
        started_at: new Date(),
      })
      .returning({ id: simulation_days.id });
    dayId = day.id;
    console.log(`   Day ID: ${dayId}`);

    // Step 4: Create test tick
    console.log("4. Creating test tick...");
    const [tick] = await db
      .insert(simulation_ticks)
      .values({
        simulation_id: simulationId,
        day: 1,
        hour: 9,
        tick_snapshot: { event: "morning_rush", demandMultiplier: 1.2 },
        status: "running",
        started_at: new Date(),
      })
      .returning({ id: simulation_ticks.id });
    tickId = tick.id;
    console.log(`   Tick ID: ${tickId}`);

    // Step 5: Build prompt context
    console.log("5. Building prompt context...");
    const promptContext: PromptContext = {
      simulationId,
      agentId,
      modelName: TEST_MODEL,
      day: 1,
      hour: 9,
      environment: {
        weather: "sunny",
        temperature: 75,
        baseDemand: 100,
      },
      tickSnapshot: {
        event: "morning_rush",
        demandMultiplier: 1.2,
      },
      ownHistory: [],
      competitorDecisions: [],
    };

    // Step 6: Run agent turn
    console.log("6. Running agent turn (calling LLM)...");
    console.log(`   Model: ${TEST_MODEL}`);
    console.log("   This may take a few seconds...\n");

    const startTime = Date.now();
    const result = await runAgentTurn({
      simulationId,
      agentId,
      tickId,
      dayId,
      day: 1,
      hour: 9,
      modelName: TEST_MODEL,
      promptContext,
    });
    const duration = Date.now() - startTime;

    // Step 7: Display results
    console.log("=== Results ===\n");
    console.log(`Success: ${result.success}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Decision ID: ${result.decisionId}`);
    console.log(`Artifact ID: ${result.artifactId}`);
    console.log("\nDecision:");
    console.log(`  Price: $${result.decision.price.toFixed(2)}`);
    console.log(`  Quality: ${result.decision.quality}/10`);
    console.log(`  Marketing: ${result.decision.marketing}%`);
    console.log(`  Reasoning: ${result.decision.reasoning}`);
    console.log("\nMetadata:");
    console.log(`  Model: ${result.metadata.modelName}`);
    console.log(`  Attempts: ${result.metadata.attemptCount}`);
    console.log(`  Used Fallback: ${result.metadata.usedFallback}`);
    console.log(`  Was Coerced: ${result.metadata.wasCoerced}`);
    console.log(`  Reasoning Truncated: ${result.metadata.reasoningTruncated}`);
    console.log(`  Prompt Hash: ${result.metadata.promptHash.slice(0, 16)}...`);

    if (!result.success) {
      console.log(`\nError: ${result.error}`);
    }

    // Step 8: Verify persistence
    console.log("\n=== Verification ===\n");

    const [savedDecision] = await db
      .select()
      .from(agent_decisions)
      .where(eq(agent_decisions.id, result.decisionId));

    if (savedDecision) {
      console.log("Decision persisted to agent_decisions table");
      console.log(`  Price matches: ${savedDecision.price === result.decision.price}`);
      console.log(`  Quality matches: ${savedDecision.quality === result.decision.quality}`);
    } else {
      console.log("ERROR: Decision not found in database!");
    }

    const [savedArtifact] = await db
      .select()
      .from(simulation_artifacts)
      .where(eq(simulation_artifacts.id, result.artifactId));

    if (savedArtifact) {
      console.log("Artifact persisted to simulation_artifacts table");
      console.log(`  Kind: ${savedArtifact.kind}`);
      console.log(`  Is Redacted: ${savedArtifact.is_redacted}`);
      console.log(`  Model Name: ${savedArtifact.model_name}`);
    } else {
      console.log("ERROR: Artifact not found in database!");
    }

    console.log("\n=== Test Passed ===\n");
  } catch (error) {
    console.error("\n=== Test Failed ===\n");
    console.error("Error:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup
    console.log("Cleaning up test data...");

    if (tickId) {
      await db.delete(agent_decisions).where(eq(agent_decisions.tick_id, tickId));
      await db.delete(simulation_artifacts).where(eq(simulation_artifacts.tick_id, tickId));
      await db.delete(simulation_ticks).where(eq(simulation_ticks.id, tickId));
    }
    if (dayId) {
      await db.delete(simulation_days).where(eq(simulation_days.id, dayId));
    }
    if (agentId) {
      await db.delete(agents).where(eq(agents.id, agentId));
    }
    if (simulationId) {
      await db.delete(simulations).where(eq(simulations.id, simulationId));
    }

    console.log("Cleanup complete.\n");
    process.exit(process.exitCode ?? 0);
  }
}

main();
