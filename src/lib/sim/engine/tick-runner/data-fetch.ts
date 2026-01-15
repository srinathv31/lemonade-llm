import { eq, and, desc, sql, lt, or } from "drizzle-orm";
import db from "../../../db/drizzle";
import {
  agents,
  agent_decisions,
  customer_events,
  simulation_artifacts,
} from "../../../db/drizzle/schema";
import type {
  HistoricalDecision,
  CompetitorDecision,
  MarketOutcome,
  AgentDecision,
} from "../../prompts";
import type { TickAgent } from "../types";
import { MAX_HISTORY_ENTRIES, isAgentTurnPayload } from "./utils";
import { regenerateMissingArtifact } from "./artifact";

// ========================================
// Types
// ========================================

/**
 * Existing decision result for idempotent retry support.
 * Discriminated union to handle integrity errors when decision exists but artifact is missing.
 */
export type ExistingDecisionResult =
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

// ========================================
// Agent Fetching
// ========================================

/**
 * Fetch all agents for a simulation.
 * Orders by id for deterministic execution order.
 */
export async function fetchSimulationAgents(simulationId: string): Promise<TickAgent[]> {
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

// ========================================
// History Fetching
// ========================================

/**
 * Fetch agent's decision history (most recent first).
 */
export async function fetchAgentHistory(
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

// ========================================
// Competitor Fetching
// ========================================

/**
 * Fetch competitor decisions from the previous tick.
 */
export async function fetchPreviousTickCompetitorDecisions(
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

// ========================================
// Market Outcome Fetching
// ========================================

/**
 * Fetch previous market outcome for an agent.
 */
export async function fetchPreviousMarketOutcome(
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

// ========================================
// Previous Decision Fetching
// ========================================

/**
 * Fetch agent's previous decision for fallback.
 */
export async function fetchPreviousDecision(
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

// ========================================
// Existing Decision Check (Idempotency)
// ========================================

/**
 * Check if agent already has a decision for this tick.
 * Used for idempotent retry support - if decision exists, skip LLM call.
 */
export async function fetchExistingDecision(
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
