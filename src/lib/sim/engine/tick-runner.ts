import { eq, and, desc, sql, lt, or } from "drizzle-orm";
import db from "../../db/drizzle";
import {
  agents,
  agent_decisions,
  customer_events,
  simulation_artifacts,
  simulation_days,
  simulation_ticks,
} from "../../db/drizzle/schema";
import type {
  PromptContext,
  HistoricalDecision,
  CompetitorDecision,
  MarketOutcome,
  EnvironmentSnapshot,
  TickSnapshot,
  AgentDecision,
} from "../prompts";
import { runAgentTurn } from "./agent-turn";
import { ensureDay, ensureTick, updateTickStatus } from "./timeline";
import type {
  RunTickParams,
  RunTickResult,
  TickAgent,
  TickAgentOutcome,
  TickSummary,
  TickArtifactPayload,
  TickRunnerLogEntry,
  AgentTurnResult,
  AgentTurnArtifactPayload,
} from "./types";

// ========================================
// Configuration
// ========================================

/** Maximum history entries to include in agent context */
const MAX_HISTORY_ENTRIES = 10;

// ========================================
// Logging (CLAUDE.md Compliant)
// ========================================

/**
 * Structured logging helper (per CLAUDE.md guidelines).
 * Only logs in development to avoid noise in production.
 * NEVER logs raw prompts or responses.
 */
function logTickOperation(entry: TickRunnerLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

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
  await updateTickStatus(
    tickId,
    status === "failed" ? "failed" : "completed",
    errorMessage
  );

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
    error: errorMessage,
  };
}

// ========================================
// Agent Execution Modes
// ========================================

/**
 * Run agents in parallel.
 * No agent sees competitors' current-tick decisions.
 * Competitor context comes from previous tick only.
 */
async function runAgentsInParallel(
  tickAgents: TickAgent[],
  simulationId: string,
  dayId: string,
  tickId: string,
  day: number,
  hour: number,
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot
): Promise<TickAgentOutcome[]> {
  // Fetch competitor decisions from previous tick (shared by all agents)
  const previousTickCompetitors = await fetchPreviousTickCompetitorDecisions(
    simulationId,
    day,
    hour
  );

  const promises = tickAgents.map(async (agent) => {
    return runSingleAgent(
      agent,
      simulationId,
      dayId,
      tickId,
      day,
      hour,
      envSnapshot,
      tickSnapshot,
      previousTickCompetitors
    );
  });

  return Promise.all(promises);
}

/**
 * Run agents sequentially.
 * Each agent sees decisions from agents who went before them in the same tick.
 */
async function runAgentsSequentially(
  tickAgents: TickAgent[],
  simulationId: string,
  dayId: string,
  tickId: string,
  day: number,
  hour: number,
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot
): Promise<TickAgentOutcome[]> {
  const outcomes: TickAgentOutcome[] = [];
  const currentTickDecisions: CompetitorDecision[] = [];

  // Fetch competitor decisions from previous tick
  const previousTickCompetitors = await fetchPreviousTickCompetitorDecisions(
    simulationId,
    day,
    hour
  );

  for (const agent of tickAgents) {
    // Get agent IDs that have already acted in current tick
    const currentTickAgentIds = new Set(currentTickDecisions.map((c) => c.agentId));

    // Filter out previous tick entries for agents who have current tick decisions
    const filteredPreviousCompetitors = previousTickCompetitors.filter(
      (c) => !currentTickAgentIds.has(c.agentId)
    );

    // Combine: previous tick (for agents not yet acted) + current tick decisions
    const allCompetitors = [...filteredPreviousCompetitors, ...currentTickDecisions];

    const outcome = await runSingleAgent(
      agent,
      simulationId,
      dayId,
      tickId,
      day,
      hour,
      envSnapshot,
      tickSnapshot,
      allCompetitors
    );

    outcomes.push(outcome);

    // Add this agent's decision to current tick decisions for next agents
    currentTickDecisions.push({
      agentId: agent.id,
      modelName: agent.modelName,
      price: outcome.decision.price,
      quality: outcome.decision.quality,
      marketing: outcome.decision.marketing,
    });
  }

  return outcomes;
}

/**
 * Run a single agent and convert result to TickAgentOutcome.
 */
async function runSingleAgent(
  agent: TickAgent,
  simulationId: string,
  dayId: string,
  tickId: string,
  day: number,
  hour: number,
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot,
  competitorDecisions: CompetitorDecision[]
): Promise<TickAgentOutcome> {
  // Check for existing decision (idempotent retry support)
  const existing = await fetchExistingDecision(tickId, agent.id);

  if (existing) {
    // Handle integrity error: decision exists but artifact is missing
    if (existing.status === "integrity_error") {
      logTickOperation({
        timestamp: new Date().toISOString(),
        operation: "runAgentTurn",
        status: "error",
        simulationId,
        day,
        hour,
        tickId,
        agentId: agent.id,
        error: existing.reason,
      });

      return {
        agentId: agent.id,
        modelName: agent.modelName,
        success: false,
        decisionId: existing.decisionId,
        artifactId: "",
        decision: existing.decision, // Use canonical decision values
        durationMs: 0,
        usedFallback: false,
        skipped: false,
        error: existing.reason,
      };
    }

    // Happy path: both decision and artifact exist
    logTickOperation({
      timestamp: new Date().toISOString(),
      operation: "runAgentTurn",
      status: "skipped",
      simulationId,
      day,
      hour,
      tickId,
      agentId: agent.id,
      reason: "existing_decision",
    });

    return {
      agentId: agent.id,
      modelName: agent.modelName,
      success: true,
      decisionId: existing.decisionId,
      artifactId: existing.artifactId,
      decision: existing.decision,
      durationMs: 0,
      usedFallback: existing.usedFallback,
      skipped: true,
    };
  }

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "buildContext",
    status: "start",
    simulationId,
    day,
    hour,
    tickId,
    agentId: agent.id,
  });

  // Build prompt context for this agent
  const [ownHistory, previousMarketOutcome, previousDecision] = await Promise.all([
    fetchAgentHistory(simulationId, agent.id, day, hour),
    fetchPreviousMarketOutcome(simulationId, agent.id, day, hour),
    fetchPreviousDecision(simulationId, agent.id, day, hour),
  ]);

  // Filter out this agent from competitor decisions
  const filteredCompetitors = competitorDecisions.filter(
    (c) => c.agentId !== agent.id
  );

  const promptContext: PromptContext = {
    simulationId,
    agentId: agent.id,
    modelName: agent.modelName,
    day,
    hour,
    environment: envSnapshot,
    tickSnapshot,
    ownHistory,
    competitorDecisions: filteredCompetitors,
    previousMarketOutcome,
    strategyHints: agent.strategy,
  };

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "buildContext",
    status: "success",
    simulationId,
    day,
    hour,
    tickId,
    agentId: agent.id,
  });

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "runAgentTurn",
    status: "start",
    simulationId,
    day,
    hour,
    tickId,
    agentId: agent.id,
  });

  // Run agent turn
  const result: AgentTurnResult = await runAgentTurn({
    simulationId,
    agentId: agent.id,
    tickId,
    dayId,
    day,
    hour,
    modelName: agent.modelName,
    promptContext,
    previousDecision,
  });

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "runAgentTurn",
    status: result.success ? "success" : "error",
    simulationId,
    day,
    hour,
    tickId,
    agentId: agent.id,
    duration: result.metadata.durationMs,
    error: result.success ? undefined : result.error,
  });

  return {
    agentId: agent.id,
    modelName: agent.modelName,
    success: result.success,
    decisionId: result.decisionId,
    artifactId: result.artifactId,
    decision: result.decision,
    durationMs: result.metadata.durationMs,
    usedFallback: result.metadata.usedFallback,
    error: result.success ? undefined : result.error,
  };
}

// ========================================
// Data Fetching
// ========================================

/**
 * Fetch all agents for a simulation.
 * Orders by id for deterministic execution order.
 */
async function fetchSimulationAgents(simulationId: string): Promise<TickAgent[]> {
  const rows = await db
    .select({
      id: agents.id,
      modelName: agents.model_name,
      strategy: agents.strategy,
    })
    .from(agents)
    .where(eq(agents.simulation_id, simulationId))
    .orderBy(agents.id);

  return rows.map((r) => ({
    id: r.id,
    modelName: r.modelName,
    strategy: (r.strategy as Record<string, unknown>) ?? undefined,
  }));
}

/**
 * Fetch agent's decision history (most recent first).
 */
async function fetchAgentHistory(
  simulationId: string,
  agentId: string,
  currentDay: number,
  currentHour: number
): Promise<HistoricalDecision[]> {
  const rows = await db
    .select({
      day: agent_decisions.day,
      hour: agent_decisions.hour,
      price: agent_decisions.price,
      quality: agent_decisions.quality,
      marketing: agent_decisions.marketing,
      revenue: customer_events.revenue,
      customersServed: customer_events.customers_served,
    })
    .from(agent_decisions)
    .leftJoin(
      customer_events,
      and(
        eq(customer_events.simulation_id, agent_decisions.simulation_id),
        eq(customer_events.agent_id, agent_decisions.agent_id),
        eq(customer_events.day, agent_decisions.day),
        eq(customer_events.hour, agent_decisions.hour)
      )
    )
    .where(
      and(
        eq(agent_decisions.simulation_id, simulationId),
        eq(agent_decisions.agent_id, agentId),
        // Exclude current tick and future ticks
        or(
          lt(agent_decisions.day, currentDay),
          and(
            eq(agent_decisions.day, currentDay),
            lt(agent_decisions.hour, currentHour)
          )
        )
      )
    )
    .orderBy(desc(agent_decisions.day), desc(agent_decisions.hour))
    .limit(MAX_HISTORY_ENTRIES);

  return rows.map((r) => ({
    day: r.day,
    hour: r.hour,
    price: r.price,
    quality: r.quality ?? 5,
    marketing: r.marketing ?? 50,
    revenue: r.revenue ?? undefined,
    customersServed: r.customersServed ?? undefined,
  }));
}

/**
 * Fetch competitor decisions from the previous tick.
 */
async function fetchPreviousTickCompetitorDecisions(
  simulationId: string,
  currentDay: number,
  currentHour: number
): Promise<CompetitorDecision[]> {
  // Calculate previous tick
  let prevDay = currentDay;
  let prevHour = currentHour - 1;
  if (prevHour < 9) {
    prevDay -= 1;
    prevHour = 16; // Last hour of previous day
  }

  if (prevDay < 1) {
    return []; // No previous tick
  }

  const rows = await db
    .select({
      agentId: agent_decisions.agent_id,
      modelName: agents.model_name,
      price: agent_decisions.price,
      quality: agent_decisions.quality,
      marketing: agent_decisions.marketing,
    })
    .from(agent_decisions)
    .innerJoin(agents, eq(agents.id, agent_decisions.agent_id))
    .where(
      and(
        eq(agent_decisions.simulation_id, simulationId),
        eq(agent_decisions.day, prevDay),
        eq(agent_decisions.hour, prevHour)
      )
    );

  return rows.map((r) => ({
    agentId: r.agentId,
    modelName: r.modelName,
    price: r.price,
    quality: r.quality ?? 5,
    marketing: r.marketing ?? 50,
  }));
}

/**
 * Fetch previous market outcome for an agent.
 */
async function fetchPreviousMarketOutcome(
  simulationId: string,
  agentId: string,
  currentDay: number,
  currentHour: number
): Promise<MarketOutcome | undefined> {
  // Calculate previous tick
  let prevDay = currentDay;
  let prevHour = currentHour - 1;
  if (prevHour < 9) {
    prevDay -= 1;
    prevHour = 16;
  }

  if (prevDay < 1) {
    return undefined;
  }

  // Get aggregate market data
  const [marketData] = await db
    .select({
      totalCustomers: sql<number>`COALESCE(SUM(${customer_events.customers_served}), 0)`,
      averagePrice: sql<number>`COALESCE(AVG(${agent_decisions.price}), 0)`,
      rowCount: sql<number>`COUNT(*)`,
    })
    .from(customer_events)
    .innerJoin(
      agent_decisions,
      and(
        eq(agent_decisions.simulation_id, customer_events.simulation_id),
        eq(agent_decisions.agent_id, customer_events.agent_id),
        eq(agent_decisions.day, customer_events.day),
        eq(agent_decisions.hour, customer_events.hour)
      )
    )
    .where(
      and(
        eq(customer_events.simulation_id, simulationId),
        eq(customer_events.day, prevDay),
        eq(customer_events.hour, prevHour)
      )
    );

  // Get this agent's specific outcome
  const [ownData] = await db
    .select({
      revenue: customer_events.revenue,
      customersServed: customer_events.customers_served,
    })
    .from(customer_events)
    .where(
      and(
        eq(customer_events.simulation_id, simulationId),
        eq(customer_events.agent_id, agentId),
        eq(customer_events.day, prevDay),
        eq(customer_events.hour, prevHour)
      )
    );

  // Only return undefined if there are no rows (no data), not for zero customers
  if (!marketData || marketData.rowCount === 0) {
    return undefined;
  }

  return {
    day: prevDay,
    hour: prevHour,
    totalCustomers: marketData.totalCustomers,
    averagePrice: marketData.averagePrice,
    ownRevenue: ownData?.revenue ?? undefined,
    ownCustomersServed: ownData?.customersServed ?? undefined,
  };
}

/**
 * Fetch agent's previous decision for fallback.
 */
async function fetchPreviousDecision(
  simulationId: string,
  agentId: string,
  currentDay: number,
  currentHour: number
): Promise<AgentDecision | undefined> {
  const [row] = await db
    .select({
      price: agent_decisions.price,
      quality: agent_decisions.quality,
      marketing: agent_decisions.marketing,
      reasoning: agent_decisions.reasoning,
    })
    .from(agent_decisions)
    .where(
      and(
        eq(agent_decisions.simulation_id, simulationId),
        eq(agent_decisions.agent_id, agentId),
        or(
          lt(agent_decisions.day, currentDay),
          and(
            eq(agent_decisions.day, currentDay),
            lt(agent_decisions.hour, currentHour)
          )
        )
      )
    )
    .orderBy(desc(agent_decisions.day), desc(agent_decisions.hour))
    .limit(1);

  if (!row) {
    return undefined;
  }

  return {
    price: row.price,
    quality: row.quality ?? 5,
    marketing: row.marketing ?? 50,
    reasoning: row.reasoning ?? "",
  };
}

/**
 * Existing decision result for idempotent retry support.
 * Discriminated union to handle integrity errors when decision exists but artifact is missing.
 */
type ExistingDecisionResult =
  | {
      status: "found";
      decision: AgentDecision;
      decisionId: string;
      artifactId: string;
      usedFallback: boolean;
    }
  | {
      status: "integrity_error";
      decisionId: string;
      decision: AgentDecision;
      reason: string;
    };

/**
 * Type guard for agent_turn artifact payload.
 * Used to safely extract usedFallback from the artifact JSON.
 */
function isAgentTurnPayload(payload: unknown): payload is { usedFallback?: boolean } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (!("usedFallback" in payload) ||
      typeof (payload as Record<string, unknown>).usedFallback === "boolean")
  );
}

/**
 * Regenerate a missing artifact from the existing decision.
 * Used when decision exists but artifact was lost (original insert failed).
 *
 * Note: Original metadata is lost, so fields like durationMs, attemptCount,
 * usedFallback are set to undefined. The wasRegenerated flag marks this artifact.
 */
async function regenerateMissingArtifact(
  tickId: string,
  agentId: string,
  decision: { id: string; price: number; quality: number | null; marketing: number | null }
): Promise<{ id: string } | null> {
  // Fetch tick info for the artifact
  const [tickInfo] = await db
    .select({
      simulationId: simulation_ticks.simulation_id,
      day: simulation_ticks.day,
      hour: simulation_ticks.hour,
    })
    .from(simulation_ticks)
    .where(eq(simulation_ticks.id, tickId))
    .limit(1);

  if (!tickInfo) {
    return null; // Can't regenerate without tick info
  }

  // Look up day_id from simulation_days
  const [dayRecord] = await db
    .select({ id: simulation_days.id })
    .from(simulation_days)
    .where(
      and(
        eq(simulation_days.simulation_id, tickInfo.simulationId),
        eq(simulation_days.day, tickInfo.day)
      )
    )
    .limit(1);

  const dayId = dayRecord?.id ?? null;

  // Fetch agent model name
  const [agentInfo] = await db
    .select({ modelName: agents.model_name })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  const now = new Date().toISOString();
  const payload: AgentTurnArtifactPayload = {
    version: 1,
    agentId,
    modelName: agentInfo?.modelName ?? "unknown",
    day: tickInfo.day,
    hour: tickInfo.hour,
    startedAt: now,
    finishedAt: now,
    durationMs: undefined, // Unknown - original metadata lost
    attemptCount: undefined, // Unknown - original metadata lost
    usedFallback: undefined, // Unknown - original metadata lost
    decision: {
      price: decision.price,
      quality: decision.quality ?? 5,
      marketing: decision.marketing ?? 50,
    },
    wasCoerced: undefined, // Unknown - original metadata lost
    reasoningTruncated: undefined, // Unknown - original metadata lost
    wasRegenerated: true, // Marks this as a recovery artifact
  };

  const [artifact] = await db
    .insert(simulation_artifacts)
    .values({
      simulation_id: tickInfo.simulationId,
      day_id: dayId,
      tick_id: tickId,
      day: tickInfo.day,
      hour: tickInfo.hour,
      agent_id: agentId,
      kind: "agent_turn",
      schema_version: 1,
      model_name: agentInfo?.modelName ?? "unknown",
      prompt_hash: "regenerated",
      tool_schema_hash: "regenerated",
      artifact: payload,
      is_redacted: true,
    })
    .onConflictDoNothing()
    .returning({ id: simulation_artifacts.id });

  // If conflict (race condition), fetch existing
  if (!artifact) {
    const [existing] = await db
      .select({ id: simulation_artifacts.id })
      .from(simulation_artifacts)
      .where(
        and(
          eq(simulation_artifacts.tick_id, tickId),
          eq(simulation_artifacts.agent_id, agentId),
          eq(simulation_artifacts.kind, "agent_turn")
        )
      )
      .limit(1);
    return existing ?? null;
  }

  logTickOperation({
    timestamp: new Date().toISOString(),
    operation: "regenerateArtifact",
    status: "success",
    simulationId: tickInfo.simulationId,
    day: tickInfo.day,
    hour: tickInfo.hour,
    tickId,
    agentId,
  });

  return artifact;
}

/**
 * Check if agent already has a decision for this tick.
 * Used for idempotent retry support - if decision exists, skip LLM call.
 */
async function fetchExistingDecision(
  tickId: string,
  agentId: string
): Promise<ExistingDecisionResult | null> {
  // Check for existing decision
  const [existingDecision] = await db
    .select({
      id: agent_decisions.id,
      price: agent_decisions.price,
      quality: agent_decisions.quality,
      marketing: agent_decisions.marketing,
      reasoning: agent_decisions.reasoning,
    })
    .from(agent_decisions)
    .where(
      and(
        eq(agent_decisions.tick_id, tickId),
        eq(agent_decisions.agent_id, agentId)
      )
    )
    .limit(1);

  if (!existingDecision) {
    return null;
  }

  // Find corresponding agent_turn artifact (including payload for usedFallback)
  const [existingArtifact] = await db
    .select({
      id: simulation_artifacts.id,
      artifact: simulation_artifacts.artifact,
    })
    .from(simulation_artifacts)
    .where(
      and(
        eq(simulation_artifacts.tick_id, tickId),
        eq(simulation_artifacts.agent_id, agentId),
        eq(simulation_artifacts.kind, "agent_turn")
      )
    )
    .limit(1);

  // If artifact not found, regenerate it
  if (!existingArtifact) {
    const regeneratedArtifact = await regenerateMissingArtifact(
      tickId,
      agentId,
      existingDecision
    );

    if (!regeneratedArtifact) {
      // Regeneration failed - return integrity error with canonical decision values
      return {
        status: "integrity_error",
        decisionId: existingDecision.id,
        decision: {
          price: existingDecision.price,
          quality: existingDecision.quality ?? 5,
          marketing: existingDecision.marketing ?? 50,
          reasoning: existingDecision.reasoning ?? "",
        },
        reason: "Decision exists but artifact regeneration failed",
      };
    }

    // Regenerated artifact - usedFallback is unknown, default to false
    return {
      status: "found",
      decision: {
        price: existingDecision.price,
        quality: existingDecision.quality ?? 5,
        marketing: existingDecision.marketing ?? 50,
        reasoning: existingDecision.reasoning ?? "",
      },
      decisionId: existingDecision.id,
      artifactId: regeneratedArtifact.id,
      usedFallback: false, // Unknown for regenerated artifacts, default to false
    };
  }

  // Extract usedFallback from artifact payload with type-safe check
  const usedFallback = isAgentTurnPayload(existingArtifact.artifact)
    ? (existingArtifact.artifact.usedFallback ?? false)
    : false;

  return {
    status: "found",
    decision: {
      price: existingDecision.price,
      quality: existingDecision.quality ?? 5,
      marketing: existingDecision.marketing ?? 50,
      reasoning: existingDecision.reasoning ?? "",
    },
    decisionId: existingDecision.id,
    artifactId: existingArtifact.id,
    usedFallback,
  };
}

// ========================================
// Summary Calculation
// ========================================

/**
 * Calculate tick summary statistics.
 */
function calculateSummary(outcomes: TickAgentOutcome[]): TickSummary {
  const totalAgents = outcomes.length;
  const successfulAgents = outcomes.filter((o) => o.success).length;
  const failedAgents = outcomes.filter((o) => !o.success).length;
  const fallbackCount = outcomes.filter((o) => o.usedFallback).length;
  const totalDuration = outcomes.reduce((sum, o) => sum + o.durationMs, 0);
  const averageDurationMs = totalAgents > 0 ? totalDuration / totalAgents : 0;

  return {
    totalAgents,
    successfulAgents,
    failedAgents,
    averageDurationMs: Math.round(averageDurationMs),
    fallbackCount,
  };
}

// ========================================
// Artifact Persistence
// ========================================

interface PersistTickArtifactParams {
  simulationId: string;
  dayId: string;
  tickId: string;
  day: number;
  hour: number;
  startTime: number;
  durationMs: number;
  summary: TickSummary;
  agentOutcomes: TickAgentOutcome[];
  envSnapshot: EnvironmentSnapshot;
  tickSnapshot: TickSnapshot;
}

/**
 * Persist tick artifact to database.
 * Tick artifacts are always redacted (no raw LLM data).
 */
async function persistTickArtifact(
  params: PersistTickArtifactParams
): Promise<string> {
  const {
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
  } = params;

  const missingArtifactRefs = agentOutcomes.filter((o) => o.artifactId === "");
  if (missingArtifactRefs.length > 0) {
    throw new Error(
      `Cannot persist tick artifact with ${missingArtifactRefs.length} missing agent_turn artifacts`
    );
  }

  const startedAt = new Date(startTime).toISOString();
  const finishedAt = new Date(startTime + durationMs).toISOString();

  const payload: TickArtifactPayload = {
    version: 1,
    day,
    hour,
    startedAt,
    finishedAt,
    durationMs,
    totalAgents: summary.totalAgents,
    successfulAgents: summary.successfulAgents,
    failedAgents: summary.failedAgents,
    fallbackCount: summary.fallbackCount,
    averageAgentDurationMs: summary.averageDurationMs,
    agentOutcomes: agentOutcomes.map((o) => ({
      agentId: o.agentId,
      modelName: o.modelName,
      success: o.success,
      usedFallback: o.usedFallback,
      durationMs: o.durationMs,
      artifactId: o.artifactId, // Reference canonical agent_turn artifact
      error: o.error,
    })),
    environment: envSnapshot,
    tickSnapshot,
  };

  const [artifactRow] = await db
    .insert(simulation_artifacts)
    .values({
      simulation_id: simulationId,
      day_id: dayId,
      tick_id: tickId,
      day,
      hour,
      kind: "tick",
      schema_version: 1,
      artifact: payload,
      is_redacted: true, // Tick artifacts always redacted (no raw LLM data)
    })
    .returning({ id: simulation_artifacts.id });

  return artifactRow.id;
}
