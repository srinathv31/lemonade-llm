import { cache } from "react";
import { eq, and } from "drizzle-orm";
import db from "../../db/drizzle";
import {
  simulation_days,
  simulation_ticks,
  simulation_artifacts,
  agent_decisions,
  customer_events,
  agents,
} from "../../db/drizzle/schema";
import type {
  DayReplayResponse,
  TickReplayResponse,
  AgentTurnEntry,
} from "./types";
import type { ReplayResult } from "./errors";
import { notFoundError, databaseError } from "./errors";
import type {
  DayStatus,
  TickStatus,
  DayArtifactPayload,
  TickArtifactPayload,
} from "../engine/types";
import type { EnvironmentSnapshot, TickSnapshot } from "../prompts";
import type { DemandFactors } from "../customers";

// ========================================
// Day Replay Query
// ========================================

/**
 * Load day replay by dayId.
 * Returns day overview with tick summaries for navigation.
 * Wrapped with React.cache() for per-request deduplication.
 */
export const loadDayReplay = cache(async (
  dayId: string
): Promise<ReplayResult<DayReplayResponse>> => {
  try {
    // 1. Fetch day record
    const [dayRecord] = await db
      .select()
      .from(simulation_days)
      .where(eq(simulation_days.id, dayId))
      .limit(1);

    if (!dayRecord) {
      return { success: false, error: notFoundError("day", dayId) };
    }

    // 2. Fetch day artifact
    const [dayArtifact] = await db
      .select({ artifact: simulation_artifacts.artifact })
      .from(simulation_artifacts)
      .where(
        and(
          eq(simulation_artifacts.day_id, dayId),
          eq(simulation_artifacts.kind, "day")
        )
      )
      .limit(1);

    const artifact = (dayArtifact?.artifact as DayArtifactPayload) ?? null;

    // 3. Build response
    return {
      success: true,
      data: {
        simulationId: dayRecord.simulation_id,
        dayId: dayRecord.id,
        day: dayRecord.day,
        seed: dayRecord.seed ?? 0,
        status: dayRecord.status as DayStatus,
        environment: dayRecord.env_snapshot as EnvironmentSnapshot,
        startedAt: dayRecord.started_at?.toISOString() ?? null,
        finishedAt: dayRecord.finished_at?.toISOString() ?? null,
        artifact,
        ticks: artifact?.tickSummaries ?? [],
        agentSummaries: artifact?.agentSummaries ?? [],
      },
    };
  } catch (err) {
    return {
      success: false,
      error: databaseError(err instanceof Error ? err.message : String(err)),
    };
  }
});

// ========================================
// Tick Replay Query
// ========================================

/**
 * Load tick replay by tickId.
 * Returns full tick details with agent decisions and customer outcomes.
 * Wrapped with React.cache() for per-request deduplication.
 */
export const loadTickReplay = cache(async (
  tickId: string
): Promise<ReplayResult<TickReplayResponse>> => {
  try {
    // 1. Fetch tick record
    const [tickRecord] = await db
      .select()
      .from(simulation_ticks)
      .where(eq(simulation_ticks.id, tickId))
      .limit(1);

    if (!tickRecord) {
      return { success: false, error: notFoundError("tick", tickId) };
    }

    // 2. Parallel fetches: artifact, decisions, customer outcomes
    const [tickArtifactRow, decisions, customerOutcomes] = await Promise.all([
      // Tick artifact
      db
        .select({ artifact: simulation_artifacts.artifact })
        .from(simulation_artifacts)
        .where(
          and(
            eq(simulation_artifacts.tick_id, tickId),
            eq(simulation_artifacts.kind, "tick")
          )
        )
        .limit(1),

      // Agent decisions with model name
      db
        .select({
          agentId: agent_decisions.agent_id,
          modelName: agents.model_name,
          price: agent_decisions.price,
          quality: agent_decisions.quality,
          marketing: agent_decisions.marketing,
          reasoning: agent_decisions.reasoning,
        })
        .from(agent_decisions)
        .innerJoin(agents, eq(agents.id, agent_decisions.agent_id))
        .where(eq(agent_decisions.tick_id, tickId)),

      // Customer events
      db
        .select({
          agentId: customer_events.agent_id,
          customersServed: customer_events.customers_served,
          salesVolume: customer_events.sales_volume,
          revenue: customer_events.revenue,
          demandFactors: customer_events.demand_factors,
        })
        .from(customer_events)
        .where(eq(customer_events.tick_id, tickId)),
    ]);

    const artifact =
      (tickArtifactRow[0]?.artifact as TickArtifactPayload) ?? null;

    // 3. Build agent turns by joining decisions + outcomes + artifact metadata
    const outcomeMap = new Map(
      customerOutcomes.map((o) => [o.agentId, o])
    );
    const artifactOutcomeMap = new Map(
      (artifact?.agentOutcomes ?? []).map((a) => [a.agentId, a])
    );

    const agentTurns: AgentTurnEntry[] = decisions.map((d) => {
      const outcome = outcomeMap.get(d.agentId);
      const meta = artifactOutcomeMap.get(d.agentId);
      const demandFactors = outcome?.demandFactors as DemandFactors | null;

      return {
        agentId: d.agentId,
        modelName: d.modelName,
        decision: {
          price: d.price,
          quality: d.quality ?? 5,
          marketing: d.marketing ?? 50,
          reasoning: d.reasoning,
        },
        outcome: outcome
          ? {
              customersServed: outcome.customersServed,
              salesVolume: outcome.salesVolume,
              revenue: outcome.revenue,
              marketShare: demandFactors?.marketShare ?? 0,
              demandFactors,
            }
          : null,
        metadata: {
          artifactId: meta?.artifactId ?? null,
          durationMs: meta?.durationMs ?? null,
          usedFallback: meta?.usedFallback ?? false,
          error: meta?.error ?? null,
        },
      };
    });

    // 4. Get environment from day record
    const [dayRecord] = await db
      .select({
        id: simulation_days.id,
        envSnapshot: simulation_days.env_snapshot,
      })
      .from(simulation_days)
      .where(
        and(
          eq(simulation_days.simulation_id, tickRecord.simulation_id),
          eq(simulation_days.day, tickRecord.day)
        )
      )
      .limit(1);

    return {
      success: true,
      data: {
        simulationId: tickRecord.simulation_id,
        dayId: dayRecord?.id ?? "",
        tickId: tickRecord.id,
        day: tickRecord.day,
        hour: tickRecord.hour,
        status: tickRecord.status as TickStatus,
        tickSnapshot: tickRecord.tick_snapshot as TickSnapshot | null,
        environment: (dayRecord?.envSnapshot as EnvironmentSnapshot) ?? null,
        startedAt: tickRecord.started_at?.toISOString() ?? null,
        finishedAt: tickRecord.finished_at?.toISOString() ?? null,
        artifact,
        agentTurns,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: databaseError(err instanceof Error ? err.message : String(err)),
    };
  }
});
