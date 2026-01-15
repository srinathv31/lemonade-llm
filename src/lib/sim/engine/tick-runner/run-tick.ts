import type { EnvironmentSnapshot, TickSnapshot } from "../../prompts";
import {
  runCustomerEngine,
  buildCustomerEngineArtifactSection,
  type CustomerEngineOutput,
  type CustomerEngineArtifactSection,
} from "../../customers";
import { ensureDay, ensureTick, updateTickStatus } from "../timeline";
import type {
  RunTickParams,
  RunTickResult,
  TickAgent,
  TickAgentOutcome,
} from "../types";
import { logTickOperation, calculateSummary } from "./utils";
import { fetchSimulationAgents } from "./data-fetch";
import { persistTickArtifact } from "./artifact";
import { runAgentsInParallel, runAgentsSequentially } from "./agent-execution";

// ========================================
// Main Function
// ========================================

/**
 * Run all agents for a single tick.
 *
 * This function:
 * 1. Ensures day and tick records exist (via timeline bootstrap)
 * 2. Marks tick as running
 * 3. Fetches agents (if not provided)
 * 4. Builds prompt context for each agent
 * 5. Runs all agents (parallel by default, sequential if specified)
 * 6. Writes tick artifact
 * 7. Updates tick status based on outcomes
 *
 * IMPORTANT: This function NEVER throws. All errors are captured in the result.
 */
export async function runTick(params: RunTickParams): Promise<RunTickResult> {
  const startTime = Date.now();
  const { simulationId, day, hour, config, sequential = false } = params;

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "runTick",
    status: "start",
    simulationId,
    day,
    hour,
  });

  // Step 1: Bootstrap timeline
  let dayId: string;
  let tickId: string;
  let envSnapshot: EnvironmentSnapshot;
  let tickSnapshot: TickSnapshot;
  let seed: number;

  try {
    const dayResult = await ensureDay({ simulationId, day, config });
    dayId = dayResult.dayId;
    seed = dayResult.seed;
    envSnapshot = dayResult.envSnapshot;

    const tickResult = await ensureTick({
      simulationId,
      dayId,
      day,
      hour,
      daySeed: seed,
      config,
    });
    tickId = tickResult.tickId;
    tickSnapshot = tickResult.tickSnapshot;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Bootstrap failed";

    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "runTick",
      status: "error",
      simulationId,
      day,
      hour,
      error: errorMessage,
    });

    return {
      tickId: "",
      dayId: "",
      day,
      hour,
      status: "failed",
      agentOutcomes: [],
      tickArtifactId: "",
      durationMs: Date.now() - startTime,
      summary: {
        totalAgents: 0,
        successfulAgents: 0,
        failedAgents: 0,
        averageDurationMs: 0,
        fallbackCount: 0,
      },
      error: `Bootstrap failed: ${errorMessage}`,
    };
  }

  // Step 2: Mark tick as running
  await updateTickStatus(tickId, "running");

  // Step 3: Fetch agents
  let tickAgents: TickAgent[];
  try {
    tickAgents = params.agents ?? (await fetchSimulationAgents(simulationId));

    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "fetchAgents",
      status: "success",
      simulationId,
      day,
      hour,
      tickId,
      agentCount: tickAgents.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch agents";

    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "fetchAgents",
      status: "error",
      simulationId,
      day,
      hour,
      tickId,
      error: errorMessage,
    });

    await updateTickStatus(tickId, "failed", errorMessage);

    return {
      tickId,
      dayId,
      day,
      hour,
      status: "failed",
      agentOutcomes: [],
      tickArtifactId: "",
      durationMs: Date.now() - startTime,
      summary: {
        totalAgents: 0,
        successfulAgents: 0,
        failedAgents: 0,
        averageDurationMs: 0,
        fallbackCount: 0,
      },
      error: errorMessage,
    };
  }

  // Step 4: Run agents
  let agentOutcomes: TickAgentOutcome[];
  try {
    if (sequential) {
      agentOutcomes = await runAgentsSequentially(
        tickAgents,
        simulationId,
        dayId,
        tickId,
        day,
        hour,
        envSnapshot,
        tickSnapshot
      );
    } else {
      agentOutcomes = await runAgentsInParallel(
        tickAgents,
        simulationId,
        dayId,
        tickId,
        day,
        hour,
        envSnapshot,
        tickSnapshot
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Agent execution failed";

    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "runTick",
      status: "error",
      simulationId,
      day,
      hour,
      tickId,
      error: errorMessage,
    });

    await updateTickStatus(tickId, "failed", errorMessage);

    return {
      tickId,
      dayId,
      day,
      hour,
      status: "failed",
      agentOutcomes: [],
      tickArtifactId: "",
      durationMs: Date.now() - startTime,
      summary: {
        totalAgents: tickAgents.length,
        successfulAgents: 0,
        failedAgents: tickAgents.length,
        averageDurationMs: 0,
        fallbackCount: 0,
      },
      error: `Agent execution failed: ${errorMessage}`,
    };
  }

  // Step 5: Calculate summary
  const summary = calculateSummary(agentOutcomes);

  // Step 5.5: Check for integrity issues (missing artifacts)
  const missingArtifacts = agentOutcomes.filter((o) => o.artifactId === "");
  const hasIntegrityIssue = missingArtifacts.length > 0;

  // Step 5.6: Run customer engine (Step 8 - demand calculation)
  let customerOutcomes: CustomerEngineOutput | undefined;
  let customerEngineArtifact: CustomerEngineArtifactSection | undefined;

  // Only run customer engine if we have successful agents with decisions
  const successfulAgents = agentOutcomes.filter(
    (o) => o.success || o.usedFallback
  );
  if (successfulAgents.length > 0) {
    const customerResult = await runCustomerEngine({
      simulationId,
      tickId,
      dayId,
      day,
      hour,
      envSnapshot,
      tickSnapshot,
      agentDecisions: successfulAgents.map((o) => ({
        agentId: o.agentId,
        decision: o.decision,
      })),
      seed,
    });

    if (customerResult.success) {
      customerOutcomes = customerResult.output;
      customerEngineArtifact = buildCustomerEngineArtifactSection(
        customerResult.output,
        envSnapshot
      );
    } else {
      // Log customer engine failure but don't fail the tick
      const customerError = customerResult.error;
      logTickOperation({
        timestamp: new Date().toISOString(),
        operation: "runTick",
        status: "error",
        simulationId,
        day,
        hour,
        tickId,
        error: `Customer engine failed: ${customerError}`,
      });
    }
  }

  // Step 6: Determine status
  let status: "completed" | "partial" | "failed";
  let errorMessage: string | undefined;

  if (summary.successfulAgents === 0) {
    // All agents failed - "failed" takes precedence over integrity issues
    status = "failed";
    const parts: string[] = [`All ${summary.totalAgents} agents failed`];
    if (hasIntegrityIssue) {
      parts.push(
        `${missingArtifacts.length} agent(s) missing artifacts (integrity issue)`
      );
    }
    errorMessage = parts.join("; ");
  } else if (hasIntegrityIssue) {
    // Some agents succeeded but have integrity issues - partial
    status = "partial";
    const parts: string[] = [];
    // Count agent failures that aren't just missing artifacts
    const pureFailures = agentOutcomes.filter(
      (o) => !o.success && o.artifactId !== ""
    ).length;
    if (pureFailures > 0) {
      parts.push(`${pureFailures} agent(s) failed`);
    }
    parts.push(
      `${missingArtifacts.length} agent(s) missing artifacts (integrity issue)`
    );
    errorMessage = parts.join("; ");
  } else if (summary.failedAgents === 0) {
    status = "completed";
  } else if (summary.successfulAgents > 0) {
    status = "partial";
    const fallbackFailures = agentOutcomes.filter(
      (o) => !o.success && o.usedFallback
    ).length;
    const nonFallbackFailures = summary.failedAgents - fallbackFailures;
    const parts: string[] = [];
    if (nonFallbackFailures > 0) {
      parts.push(`${nonFallbackFailures} agents failed`);
    }
    if (fallbackFailures > 0) {
      parts.push(`${fallbackFailures} agents used fallback decisions`);
    }
    errorMessage =
      parts.length > 0
        ? parts.join("; ")
        : `${summary.failedAgents} of ${summary.totalAgents} agents failed`;
  } else {
    status = "failed";
    errorMessage = `All ${summary.totalAgents} agents failed`;
  }

  const durationMs = Date.now() - startTime;

  // Step 7: Write tick artifact
  let tickArtifactId: string;
  try {
    tickArtifactId = await persistTickArtifact({
      simulationId,
      dayId,
      tickId,
      day,
      hour,
      startTime,
      durationMs,
      summary,
      agentOutcomes,
      envSnapshot,
      tickSnapshot,
      customerEngine: customerEngineArtifact,
    });

    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "success",
      simulationId,
      day,
      hour,
      tickId,
    });
  } catch (error) {
    // Artifact failure is non-fatal - log but continue
    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "error",
      simulationId,
      day,
      hour,
      tickId,
      error: error instanceof Error ? error.message : "Failed to persist artifact",
    });
    tickArtifactId = "";
  }

  // Step 8: Update tick status
  await updateTickStatus(tickId, status, errorMessage);

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "runTick",
    status: status === "failed" ? "error" : status === "partial" ? "partial" : "success",
    simulationId,
    day,
    hour,
    tickId,
    agentCount: tickAgents.length,
    duration: durationMs,
    error: errorMessage,
  });

  return {
    tickId,
    dayId,
    day,
    hour,
    status,
    agentOutcomes,
    tickArtifactId,
    durationMs,
    summary,
    customerOutcomes,
    error: errorMessage,
  };
}
