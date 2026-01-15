import db from "../../../db/drizzle";
import { simulation_artifacts } from "../../../db/drizzle/schema";
import type {
  RunTickResult,
  DaySummary,
  AgentDailySummary,
  DayArtifactPayload,
} from "../types";
import type { EnvironmentSnapshot } from "../../prompts";

// ========================================
// Day Artifact Persistence
// ========================================

export interface PersistDayArtifactParams {
  simulationId: string;
  dayId: string;
  day: number;
  seed: number;
  envSnapshot: EnvironmentSnapshot;
  startTime: number;
  durationMs: number;
  tickResults: RunTickResult[];
  summary: DaySummary;
  agentSummaries: AgentDailySummary[];
}

/**
 * Persist day artifact to database.
 * Day artifacts are always redacted (no raw LLM data).
 */
export async function persistDayArtifact(
  params: PersistDayArtifactParams
): Promise<string> {
  const {
    simulationId,
    dayId,
    day,
    seed,
    envSnapshot,
    startTime,
    durationMs,
    tickResults,
    summary,
    agentSummaries,
  } = params;

  const startedAt = new Date(startTime).toISOString();
  const finishedAt = new Date(startTime + durationMs).toISOString();

  const payload: DayArtifactPayload = {
    version: 1,
    day,
    seed,
    startedAt,
    finishedAt,
    durationMs,
    environment: envSnapshot,
    totalTicks: summary.totalTicks,
    completedTicks: summary.completedTicks,
    partialTicks: summary.partialTicks,
    failedTicks: summary.failedTicks,
    tickSummaries: tickResults.map((tick) => ({
      hour: tick.hour,
      tickId: tick.tickId,
      tickArtifactId: tick.tickArtifactId,
      status: tick.status,
      durationMs: tick.durationMs,
      agentCount: tick.summary.totalAgents,
      successfulAgents: tick.summary.successfulAgents,
      totalCustomers:
        tick.customerOutcomes?.agentOutcomes.reduce(
          (sum, o) => sum + o.customersServed,
          0
        ) ?? 0,
      totalRevenue:
        tick.customerOutcomes?.agentOutcomes.reduce(
          (sum, o) => sum + o.revenue,
          0
        ) ?? 0,
    })),
    agentSummaries,
    totalCustomers: summary.totalCustomers,
    totalRevenue: summary.totalRevenue,
    averageTickDurationMs: summary.averageTickDurationMs,
  };

  const [artifactRow] = await db
    .insert(simulation_artifacts)
    .values({
      simulation_id: simulationId,
      day_id: dayId,
      tick_id: null, // Day-level artifact has no tick
      day,
      hour: null, // Day-level artifact has no hour
      agent_id: null, // Day-level artifact has no agent
      kind: "day",
      schema_version: 1,
      artifact: payload,
      is_redacted: true, // Day artifacts always redacted
    })
    .returning({ id: simulation_artifacts.id });

  return artifactRow.id;
}
