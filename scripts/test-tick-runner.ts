/**
 * Test script for tick runner (Step 7 checkpoint)
 *
 * Run with: npx tsx scripts/test-tick-runner.ts
 *
 * This script:
 * 1. Creates test data (simulation, agents)
 * 2. Calls runTick with multiple agents
 * 3. Verifies agent decisions and customer outcomes
 * 4. Verifies artifacts were persisted
 * 5. Cleans up test data
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
  customer_events,
  simulation_artifacts,
} from "../src/lib/db/drizzle/schema";
import { runTick } from "../src/lib/sim/engine";

// ========================================
// Test Configuration
// ========================================

// Models to use for agents (each model = 1 agent due to unique constraint)
const TEST_MODELS = ["llama3.1:latest", "gpt-oss:20b"];
const TEST_SIMULATION_NAME = "__test_tick_runner__";

// ========================================
// Main Test
// ========================================

async function main(): Promise<void> {
  console.log("\n=== Tick Runner Test (Step 7) ===\n");

  let simulationId: string | undefined;
  const agentIds: string[] = [];

  try {
    // Step 1: Create test simulation
    console.log("1. Creating test simulation...");
    const [sim] = await db
      .insert(simulations)
      .values({
        name: TEST_SIMULATION_NAME,
        config: { test: true, models: TEST_MODELS },
        status: "running",
      })
      .returning({ id: simulations.id });
    simulationId = sim.id;
    console.log(`   Simulation ID: ${simulationId}`);

    // Step 2: Create test agents (one per model)
    console.log(`2. Creating ${TEST_MODELS.length} test agents...`);
    for (let i = 0; i < TEST_MODELS.length; i++) {
      const modelName = TEST_MODELS[i];
      const [agent] = await db
        .insert(agents)
        .values({
          simulation_id: simulationId,
          model_name: modelName,
          strategy: { agentNumber: i + 1, testAgent: true },
        })
        .returning({ id: agents.id });
      agentIds.push(agent.id);
      console.log(`   Agent ${i + 1} (${modelName}): ${agent.id}`);
    }

    // Step 3: Run tick
    console.log("\n3. Running tick (day 1, hour 9)...");
    console.log(`   Models: ${TEST_MODELS.join(", ")}`);
    console.log(`   Agents: ${TEST_MODELS.length}`);
    console.log("   This may take a while (running LLM calls)...\n");

    const startTime = Date.now();
    const result = await runTick({
      simulationId,
      day: 1,
      hour: 9,
    });
    const duration = Date.now() - startTime;

    // Step 4: Display results
    console.log("=== Results ===\n");
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Tick ID: ${result.tickId}`);
    console.log(`Day ID: ${result.dayId}`);
    console.log(`Tick Artifact ID: ${result.tickArtifactId}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // Summary
    console.log("\nSummary:");
    console.log(`  Total Agents: ${result.summary.totalAgents}`);
    console.log(`  Successful: ${result.summary.successfulAgents}`);
    console.log(`  Failed: ${result.summary.failedAgents}`);
    console.log(`  Fallback Count: ${result.summary.fallbackCount}`);
    console.log(`  Avg Duration: ${result.summary.averageDurationMs}ms`);

    // Agent outcomes
    console.log("\nAgent Outcomes:");
    for (const outcome of result.agentOutcomes) {
      console.log(
        `\n  Agent: ${outcome.agentId.slice(0, 8)}... (${outcome.modelName})`
      );
      console.log(`    Success: ${outcome.success}`);
      console.log(`    Used Fallback: ${outcome.usedFallback}`);
      console.log(`    Duration: ${outcome.durationMs}ms`);
      console.log(`    Decision:`);
      console.log(`      Price: $${outcome.decision.price.toFixed(2)}`);
      console.log(`      Quality: ${outcome.decision.quality}/10`);
      console.log(`      Marketing: ${outcome.decision.marketing}%`);
      if (outcome.error) {
        console.log(`    Error: ${outcome.error}`);
      }
    }

    // Customer outcomes
    if (result.customerOutcomes) {
      console.log("\nCustomer Engine Outcomes:");
      console.log(`  Total Demand: ${result.customerOutcomes.totalDemand}`);
      console.log(`  Duration: ${result.customerOutcomes.durationMs}ms`);
      if (
        result.customerOutcomes.agentOutcomes &&
        result.customerOutcomes.agentOutcomes.length > 0
      ) {
        console.log(`  Agent Outcomes:`);
        for (const agentOutcome of result.customerOutcomes.agentOutcomes) {
          console.log(`    Agent ${agentOutcome.agentId.slice(0, 8)}...:`);
          console.log(`      Customers: ${agentOutcome.customersServed}`);
          console.log(`      Revenue: $${agentOutcome.revenue.toFixed(2)}`);
          console.log(
            `      Market Share: ${(agentOutcome.marketShare * 100).toFixed(
              1
            )}%`
          );
        }
      } else {
        console.log(`  Agent Outcomes: (none)`);
      }
    } else {
      console.log("\nCustomer Engine: No outcomes (agents may have failed)");
    }

    // Step 5: Verify persistence
    console.log("\n=== Verification ===\n");

    const numAgents = TEST_MODELS.length;

    // Check agent_decisions
    const savedDecisions = await db
      .select()
      .from(agent_decisions)
      .where(eq(agent_decisions.tick_id, result.tickId));
    console.log(
      `Agent decisions persisted: ${savedDecisions.length}/${numAgents}`
    );

    // Check customer_events
    const savedCustomerEvents = await db
      .select()
      .from(customer_events)
      .where(eq(customer_events.tick_id, result.tickId));
    console.log(
      `Customer events persisted: ${savedCustomerEvents.length}/${numAgents}`
    );

    // Check simulation_artifacts
    const savedArtifacts = await db
      .select()
      .from(simulation_artifacts)
      .where(eq(simulation_artifacts.tick_id, result.tickId));
    const agentTurnArtifacts = savedArtifacts.filter(
      (a) => a.kind === "agent_turn"
    );
    const tickArtifacts = savedArtifacts.filter((a) => a.kind === "tick");
    console.log(
      `Agent turn artifacts: ${agentTurnArtifacts.length}/${numAgents}`
    );
    console.log(`Tick artifacts: ${tickArtifacts.length}/1`);

    // Verify tick record
    const [tickRecord] = await db
      .select()
      .from(simulation_ticks)
      .where(eq(simulation_ticks.id, result.tickId));
    console.log(`Tick record status: ${tickRecord?.status}`);

    // Verify day record
    const [dayRecord] = await db
      .select()
      .from(simulation_days)
      .where(eq(simulation_days.id, result.dayId));
    console.log(`Day record status: ${dayRecord?.status}`);

    // Final status
    if (
      result.status === "completed" &&
      savedDecisions.length === numAgents &&
      tickArtifacts.length === 1
    ) {
      console.log("\n=== Test Passed ===\n");
    } else if (result.status === "partial") {
      console.log("\n=== Test Partially Passed (some agents failed) ===\n");
    } else {
      console.log("\n=== Test Failed ===\n");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n=== Test Failed ===\n");
    console.error("Error:", error);
    process.exitCode = 1;
  } finally {
    // Cleanup
    console.log("Cleaning up test data...");

    if (simulationId) {
      // Delete in order of dependencies
      await db
        .delete(customer_events)
        .where(eq(customer_events.simulation_id, simulationId));
      await db
        .delete(agent_decisions)
        .where(eq(agent_decisions.simulation_id, simulationId));
      await db
        .delete(simulation_artifacts)
        .where(eq(simulation_artifacts.simulation_id, simulationId));
      await db
        .delete(simulation_ticks)
        .where(eq(simulation_ticks.simulation_id, simulationId));
      await db
        .delete(simulation_days)
        .where(eq(simulation_days.simulation_id, simulationId));
      await db.delete(agents).where(eq(agents.simulation_id, simulationId));
      await db.delete(simulations).where(eq(simulations.id, simulationId));
    }

    console.log("Cleanup complete.\n");
    process.exit(process.exitCode ?? 0);
  }
}

main();
