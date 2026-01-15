/**
 * Test script for day runner (Step 9 checkpoint)
 *
 * Run with: npx tsx scripts/test-day-runner.ts
 *
 * This script:
 * 1. Creates test data (simulation, agents)
 * 2. Calls runDay to run all 8 ticks
 * 3. Verifies aggregation and day artifact
 * 4. Verifies metrics were persisted
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
  simulation_metrics,
} from "../src/lib/db/drizzle/schema";
import { runDay } from "../src/lib/sim/engine";

// ========================================
// Test Configuration
// ========================================

// Models to use for agents (each model = 1 agent due to unique constraint)
const TEST_MODELS = ["llama3.1:latest", "gpt-oss:20b"];
const TEST_SIMULATION_NAME = "__test_day_runner__";

// ========================================
// Main Test
// ========================================

async function main(): Promise<void> {
  console.log("\n=== Day Runner Test (Step 9) ===\n");

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

    // Step 3: Run day
    console.log("\n3. Running day (day 1, 8 ticks)...");
    console.log(`   Models: ${TEST_MODELS.join(", ")}`);
    console.log(`   Agents: ${TEST_MODELS.length}`);
    console.log("   This may take a while (running 8 ticks with LLM calls)...\n");

    const startTime = Date.now();
    const result = await runDay({
      simulationId,
      day: 1,
    });
    const duration = Date.now() - startTime;

    // Step 4: Display results
    console.log("=== Results ===\n");
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
    console.log(`Day ID: ${result.dayId}`);
    console.log(`Day Artifact ID: ${result.dayArtifactId}`);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }

    // Day Summary
    console.log("\nDay Summary:");
    console.log(`  Total Ticks: ${result.summary.totalTicks}`);
    console.log(`  Completed: ${result.summary.completedTicks}`);
    console.log(`  Partial: ${result.summary.partialTicks}`);
    console.log(`  Failed: ${result.summary.failedTicks}`);
    console.log(`  Total Agent Turns: ${result.summary.totalAgentTurns}`);
    console.log(`  Successful Turns: ${result.summary.successfulAgentTurns}`);
    console.log(`  Failed Turns: ${result.summary.failedAgentTurns}`);
    console.log(`  Fallback Count: ${result.summary.fallbackCount}`);
    console.log(`  Avg Tick Duration: ${result.summary.averageTickDurationMs}ms`);
    console.log(`  Total Customers: ${result.summary.totalCustomers}`);
    console.log(`  Total Revenue: $${result.summary.totalRevenue.toFixed(2)}`);

    // Per-tick results
    console.log("\nPer-Tick Results:");
    for (const tick of result.tickResults) {
      const customerCount =
        tick.customerOutcomes?.agentOutcomes.reduce(
          (sum, o) => sum + o.customersServed,
          0
        ) ?? 0;
      const revenue =
        tick.customerOutcomes?.agentOutcomes.reduce(
          (sum, o) => sum + o.revenue,
          0
        ) ?? 0;
      console.log(
        `  Hour ${tick.hour}: ${tick.status} (${tick.durationMs}ms) - ${customerCount} customers, $${revenue.toFixed(2)}`
      );
    }

    // Agent daily summaries
    console.log("\nAgent Daily Summaries:");
    for (const agent of result.agentDailySummaries) {
      console.log(`\n  ${agent.agentId.slice(0, 8)}... (${agent.modelName})`);
      console.log(`    Ticks Participated: ${agent.ticksParticipated}`);
      console.log(`    Successful Decisions: ${agent.successfulDecisions}`);
      console.log(`    Fallback Decisions: ${agent.fallbackDecisions}`);
      console.log(`    Total Customers: ${agent.totalCustomersServed}`);
      console.log(`    Total Revenue: $${agent.totalRevenue.toFixed(2)}`);
      console.log(`    Avg Price: $${agent.averagePrice.toFixed(2)}`);
      console.log(`    Avg Quality: ${agent.averageQuality.toFixed(1)}/10`);
      console.log(`    Avg Marketing: ${agent.averageMarketing}%`);
      console.log(`    Avg Market Share: ${(agent.marketShareAverage * 100).toFixed(1)}%`);
    }

    // Step 5: Verify persistence
    console.log("\n=== Verification ===\n");

    const numAgents = TEST_MODELS.length;
    const expectedTicks = 8;
    const expectedDecisions = numAgents * expectedTicks;

    // Check agent_decisions
    const savedDecisions = await db
      .select()
      .from(agent_decisions)
      .where(eq(agent_decisions.simulation_id, simulationId));
    console.log(
      `Agent decisions persisted: ${savedDecisions.length}/${expectedDecisions}`
    );

    // Check customer_events
    const savedCustomerEvents = await db
      .select()
      .from(customer_events)
      .where(eq(customer_events.simulation_id, simulationId));
    console.log(
      `Customer events persisted: ${savedCustomerEvents.length}/${expectedDecisions}`
    );

    // Check simulation_artifacts
    const savedArtifacts = await db
      .select()
      .from(simulation_artifacts)
      .where(eq(simulation_artifacts.simulation_id, simulationId));
    const agentTurnArtifacts = savedArtifacts.filter(
      (a) => a.kind === "agent_turn"
    );
    const tickArtifacts = savedArtifacts.filter((a) => a.kind === "tick");
    const dayArtifacts = savedArtifacts.filter((a) => a.kind === "day");
    console.log(
      `Agent turn artifacts: ${agentTurnArtifacts.length}/${expectedDecisions}`
    );
    console.log(`Tick artifacts: ${tickArtifacts.length}/${expectedTicks}`);
    console.log(`Day artifacts: ${dayArtifacts.length}/1`);

    // Check simulation_metrics
    const savedMetrics = await db
      .select()
      .from(simulation_metrics)
      .where(eq(simulation_metrics.simulation_id, simulationId));
    const dayMetrics = savedMetrics.filter(
      (m) => m.metric_name.startsWith("day_")
    );
    const agentMetrics = savedMetrics.filter(
      (m) => m.metric_name.startsWith("agent_day_")
    );
    console.log(`Day-level metrics: ${dayMetrics.length}/5`);
    console.log(
      `Agent-level metrics: ${agentMetrics.length}/${numAgents * 3}`
    );

    // Verify day record
    const [dayRecord] = await db
      .select()
      .from(simulation_days)
      .where(eq(simulation_days.id, result.dayId));
    console.log(`Day record status: ${dayRecord?.status}`);

    // Verify tick records
    const tickRecords = await db
      .select()
      .from(simulation_ticks)
      .where(eq(simulation_ticks.simulation_id, simulationId));
    console.log(`Tick records: ${tickRecords.length}/${expectedTicks}`);

    // Final status
    if (
      result.status === "completed" &&
      dayArtifacts.length === 1 &&
      tickArtifacts.length === expectedTicks
    ) {
      console.log("\n=== Test Passed ===\n");
    } else if (result.status === "partial") {
      console.log("\n=== Test Partially Passed (some ticks/agents failed) ===\n");
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
        .delete(simulation_metrics)
        .where(eq(simulation_metrics.simulation_id, simulationId));
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
