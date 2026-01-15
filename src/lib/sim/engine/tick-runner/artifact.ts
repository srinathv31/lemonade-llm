import { eq, and } from "drizzle-orm";
import db from "../../../db/drizzle";
import {
  agents,
  simulation_artifacts,
  simulation_days,
  simulation_ticks,
} from "../../../db/drizzle/schema";
import type {
  TickSummary,
  TickAgentOutcome,
  TickArtifactPayload,
  AgentTurnArtifactPayload,
} from "../types";
import type { EnvironmentSnapshot, TickSnapshot } from "../../prompts";
import type { CustomerEngineArtifactSection } from "../../customers";
import { logTickOperation } from "./utils";

// ========================================
// Artifact Regeneration
// ========================================

/**
 * Regenerate a missing artifact from the existing decision.
 * Used when decision exists but artifact was lost (original insert failed).
 *
 * Note: Original metadata is lost, so fields like durationMs, attemptCount,
 * usedFallback are set to undefined. The wasRegenerated flag marks this artifact.
 */
export async function regenerateMissingArtifact(
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

// ========================================
// Tick Artifact Persistence
// ========================================

export interface PersistTickArtifactParams {
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
  /** Customer engine artifact section (Step 8) */
  customerEngine?: CustomerEngineArtifactSection;
}

/**
 * Persist tick artifact to database.
 * Tick artifacts are always redacted (no raw LLM data).
 */
export async function persistTickArtifact(
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
    customerEngine,
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
    customerEngine,
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
