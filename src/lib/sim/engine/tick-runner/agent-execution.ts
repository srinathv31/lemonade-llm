import type {
  PromptContext,
  CompetitorDecision,
  EnvironmentSnapshot,
  TickSnapshot,
} from "../../prompts";
import { runAgentTurn } from "../agent-turn";
import type { TickAgent, TickAgentOutcome, AgentTurnResult } from "../types";
import { logTickOperation } from "./utils";
import {
  fetchPreviousTickCompetitorDecisions,
  fetchAgentHistory,
  fetchPreviousMarketOutcome,
  fetchPreviousDecision,
  fetchExistingDecision,
} from "./data-fetch";

// ========================================
// Agent Execution Modes
// ========================================

/**
 * Run agents in parallel.
 * No agent sees competitors' current-tick decisions.
 * Competitor context comes from previous tick only.
 */
export async function runAgentsInParallel(
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
export async function runAgentsSequentially(
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

// ========================================
// Single Agent Execution
// ========================================

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
