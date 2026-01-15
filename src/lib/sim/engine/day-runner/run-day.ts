import { ensureDay, updateDayStatus } from "../timeline";
import { runTick } from "../tick-runner/index";
import { fetchSimulationAgents } from "../tick-runner/data-fetch";
import type {
  RunDayParams,
  RunDayResult,
  RunTickResult,
  TickAgent,
  DaySummary,
} from "../types";
import type { EnvironmentSnapshot } from "../../prompts";
import { logDayOperation, DAY_HOURS } from "./utils";
import { calculateDaySummary, aggregateAgentDailySummaries } from "./aggregation";
import { persistDayArtifact } from "./artifact";
import { persistDaySummaryMetrics } from "./metrics";

// ========================================
// Main Function
// ========================================

/**
 * Run all ticks for a single simulation day.
 *
 * This function:
 * 1. Ensures day record exists (via timeline bootstrap)
 * 2. Marks day as running
 * 3. Fetches agents once (reused across all ticks)
 * 4. Loops through hours 9-16, calling runTick() for each
 * 5. Aggregates results across all ticks
 * 6. Writes day artifact
 * 7. Writes summary metrics
 * 8. Updates day status based on outcomes
 *
 * IMPORTANT: This function NEVER throws. All errors are captured in the result.
 */
export async function runDay(params: RunDayParams): Promise<RunDayResult> {
  const startTime = Date.now();
  const { simulationId, day, config, sequential = false } = params;

  logDayOperation({
    timestamp: new Date().toISOString(),
    operation: "runDay",
    status: "start",
    simulationId,
    day,
  });

  // Step 1: Bootstrap day
  let dayId: string;
  let seed: number;
  let envSnapshot: EnvironmentSnapshot;

  try {
    const dayResult = await ensureDay({ simulationId, day, config });
    dayId = dayResult.dayId;
    seed = dayResult.seed;
    envSnapshot = dayResult.envSnapshot;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Day bootstrap failed";

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runDay",
      status: "error",
      simulationId,
      day,
      error: errorMessage,
    });

    return createFailedResult(day, startTime, `Day bootstrap failed: ${errorMessage}`);
  }

  // Step 2: Mark day as running
  try {
    await updateDayStatus(dayId, "running");
  } catch {
    // Non-fatal, continue
    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runDay",
      status: "error",
      simulationId,
      day,
      dayId,
      error: "Failed to mark day as running",
    });
  }

  // Step 3: Fetch agents once (reuse across all ticks)
  let tickAgents: TickAgent[];
  try {
    tickAgents = params.agents ?? (await fetchSimulationAgents(simulationId));

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runDay",
      status: "success",
      simulationId,
      day,
      dayId,
      tickCount: tickAgents.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch agents";

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runDay",
      status: "error",
      simulationId,
      day,
      dayId,
      error: errorMessage,
    });

    await updateDayStatus(dayId, "failed", errorMessage);

    return createFailedResultWithDayId(
      dayId,
      day,
      startTime,
      `Failed to fetch agents: ${errorMessage}`
    );
  }

  // Step 4: Run all ticks (hours 9-16)
  const tickResults: RunTickResult[] = [];

  for (const hour of DAY_HOURS) {
    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runTick",
      status: "start",
      simulationId,
      day,
      dayId,
      hour,
    });

    const tickResult = await runTick({
      simulationId,
      day,
      hour,
      agents: tickAgents,
      config,
      sequential,
    });

    tickResults.push(tickResult);

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runTick",
      status:
        tickResult.status === "completed"
          ? "success"
          : tickResult.status === "failed"
            ? "error"
            : tickResult.status,
      simulationId,
      day,
      dayId,
      hour,
      duration: tickResult.durationMs,
      error: tickResult.error,
    });
  }

  // Step 5: Aggregate results
  logDayOperation({
    timestamp: new Date().toISOString(),
    operation: "aggregate",
    status: "start",
    simulationId,
    day,
    dayId,
  });

  const summary = calculateDaySummary(tickResults);
  const agentDailySummaries = aggregateAgentDailySummaries(tickResults);

  logDayOperation({
    timestamp: new Date().toISOString(),
    operation: "aggregate",
    status: "success",
    simulationId,
    day,
    dayId,
    tickCount: summary.totalTicks,
  });

  // Step 6: Determine day status
  const { status, error } = determineDayStatus(tickResults);

  // Step 7: Persist day artifact
  let dayArtifactId = "";
  try {
    dayArtifactId = await persistDayArtifact({
      simulationId,
      dayId,
      day,
      seed,
      envSnapshot,
      startTime,
      durationMs: Date.now() - startTime,
      tickResults,
      summary,
      agentSummaries: agentDailySummaries,
    });

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "success",
      simulationId,
      day,
      dayId,
    });
  } catch (artifactError) {
    // Non-fatal - log and continue
    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "error",
      simulationId,
      day,
      dayId,
      error:
        artifactError instanceof Error
          ? artifactError.message
          : "Artifact persistence failed",
    });
  }

  // Step 8: Persist summary metrics
  try {
    await persistDaySummaryMetrics(
      simulationId,
      dayId,
      day,
      summary,
      agentDailySummaries
    );

    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "persistMetrics",
      status: "success",
      simulationId,
      day,
      dayId,
    });
  } catch (metricsError) {
    // Non-fatal - log and continue
    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "persistMetrics",
      status: "error",
      simulationId,
      day,
      dayId,
      error:
        metricsError instanceof Error
          ? metricsError.message
          : "Metrics persistence failed",
    });
  }

  // Step 9: Update day status
  try {
    await updateDayStatus(dayId, status, error);
  } catch {
    // Non-fatal - log but continue
    logDayOperation({
      timestamp: new Date().toISOString(),
      operation: "runDay",
      status: "error",
      simulationId,
      day,
      dayId,
      error: "Failed to update day status",
    });
  }

  const durationMs = Date.now() - startTime;

  logDayOperation({
    timestamp: new Date().toISOString(),
    operation: "runDay",
    status:
      status === "completed"
        ? "success"
        : status === "failed"
          ? "error"
          : status,
    simulationId,
    day,
    dayId,
    tickCount: tickResults.length,
    duration: durationMs,
    error,
  });

  return {
    dayId,
    day,
    status,
    tickResults,
    dayArtifactId,
    durationMs,
    summary,
    agentDailySummaries,
    error,
  };
}

// ========================================
// Helper Functions
// ========================================

/**
 * Determine day status based on tick results.
 */
function determineDayStatus(tickResults: RunTickResult[]): {
  status: "completed" | "partial" | "failed";
  error?: string;
} {
  const total = tickResults.length;
  const completed = tickResults.filter((t) => t.status === "completed").length;
  const partial = tickResults.filter((t) => t.status === "partial").length;
  const failed = tickResults.filter((t) => t.status === "failed").length;

  if (total === 0) {
    return { status: "failed", error: "No ticks executed" };
  }

  if (failed === total) {
    return {
      status: "failed",
      error: `All ${total} ticks failed`,
    };
  }

  if (completed === total) {
    return { status: "completed" };
  }

  // Mixed results
  const parts: string[] = [];
  if (failed > 0) {
    parts.push(`${failed} tick(s) failed`);
  }
  if (partial > 0) {
    parts.push(`${partial} tick(s) partial`);
  }

  return {
    status: "partial",
    error: parts.join("; "),
  };
}

/**
 * Create a failed result before day record exists.
 */
function createFailedResult(
  day: number,
  startTime: number,
  error: string
): RunDayResult {
  return {
    dayId: "",
    day,
    status: "failed",
    tickResults: [],
    dayArtifactId: "",
    durationMs: Date.now() - startTime,
    summary: createEmptySummary(),
    agentDailySummaries: [],
    error,
  };
}

/**
 * Create a failed result after day record exists.
 */
function createFailedResultWithDayId(
  dayId: string,
  day: number,
  startTime: number,
  error: string
): RunDayResult {
  return {
    dayId,
    day,
    status: "failed",
    tickResults: [],
    dayArtifactId: "",
    durationMs: Date.now() - startTime,
    summary: createEmptySummary(),
    agentDailySummaries: [],
    error,
  };
}

/**
 * Create an empty day summary for failed results.
 */
function createEmptySummary(): DaySummary {
  return {
    totalTicks: 0,
    completedTicks: 0,
    partialTicks: 0,
    failedTicks: 0,
    totalAgentTurns: 0,
    successfulAgentTurns: 0,
    failedAgentTurns: 0,
    fallbackCount: 0,
    averageTickDurationMs: 0,
    totalCustomers: 0,
    totalRevenue: 0,
  };
}
