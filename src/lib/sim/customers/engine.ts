import db from "../../db/drizzle";
import { customer_events } from "../../db/drizzle/schema";
import type { EnvironmentSnapshot, TickSnapshot, AgentDecision } from "../prompts";
import type {
  CustomerEngineInput,
  CustomerEngineOutput,
  CustomerEngineResult,
  AgentCustomerOutcome,
  CustomerEngineArtifactSection,
} from "./types";
import { distributeCustomers, buildDemandFactors } from "./demand";
import { getWeatherModifier, getSpecialEventModifier } from "./modifiers";

// ========================================
// Logging
// ========================================

interface CustomerEngineLogEntry {
  timestamp: string;
  operation: "runCustomerEngine" | "persistCustomerEvents";
  status: "start" | "success" | "error";
  simulationId: string;
  day: number;
  hour: number;
  tickId: string;
  agentCount?: number;
  totalDemand?: number;
  duration?: number;
  error?: string;
}

function logCustomerEngineOperation(entry: CustomerEngineLogEntry): void {
  console.log(JSON.stringify(entry));
}

// ========================================
// Main Entry Point
// ========================================

/**
 * Run the customer engine for a completed tick.
 * Calculates demand, distributes customers among agents, and persists results.
 *
 * This function is deterministic: given the same inputs and seed,
 * it will always produce the same outputs.
 */
export async function runCustomerEngine(
  input: CustomerEngineInput
): Promise<CustomerEngineResult> {
  const startTime = Date.now();

  logCustomerEngineOperation({
    timestamp: new Date().toISOString(),
    operation: "runCustomerEngine",
    status: "start",
    simulationId: input.simulationId,
    day: input.day,
    hour: input.hour,
    tickId: input.tickId,
    agentCount: input.agentDecisions.length,
  });

  try {
    // Calculate demand and distribute customers
    const { allocations, totalDemand, totalMarketScore, weatherMod, eventMod } =
      distributeCustomers(
        input.agentDecisions,
        input.envSnapshot,
        input.tickSnapshot,
        input.seed
      );

    // Build outcomes with demand factors
    const agentOutcomes: AgentCustomerOutcome[] = allocations.map((allocation) => {
      const demandFactors = buildDemandFactors(
        allocation,
        input.envSnapshot,
        input.tickSnapshot,
        totalDemand,
        totalMarketScore,
        weatherMod,
        eventMod
      );

      return {
        agentId: allocation.agentId,
        customersServed: allocation.customers,
        salesVolume: allocation.customers, // 1 cup per customer
        revenue: roundToDecimals(allocation.customers * allocation.decision.price, 2),
        marketShare: allocation.marketShare,
        demandFactors,
        customerEventId: "", // Will be filled after persistence
      };
    });

    // Persist to database
    const eventIds = await persistCustomerEvents(agentOutcomes, {
      simulationId: input.simulationId,
      tickId: input.tickId,
      day: input.day,
      hour: input.hour,
    });

    // Update outcomes with event IDs
    agentOutcomes.forEach((outcome, i) => {
      outcome.customerEventId = eventIds[i];
    });

    const durationMs = Date.now() - startTime;

    logCustomerEngineOperation({
      timestamp: new Date().toISOString(),
      operation: "runCustomerEngine",
      status: "success",
      simulationId: input.simulationId,
      day: input.day,
      hour: input.hour,
      tickId: input.tickId,
      agentCount: input.agentDecisions.length,
      totalDemand,
      duration: durationMs,
    });

    return {
      success: true,
      output: {
        totalDemand,
        agentOutcomes,
        durationMs,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logCustomerEngineOperation({
      timestamp: new Date().toISOString(),
      operation: "runCustomerEngine",
      status: "error",
      simulationId: input.simulationId,
      day: input.day,
      hour: input.hour,
      tickId: input.tickId,
      duration: durationMs,
      error: errorMessage,
    });

    // Return failure with empty output - never throw
    return {
      success: false,
      output: {
        totalDemand: 0,
        agentOutcomes: [],
        durationMs,
      },
      error: errorMessage,
    };
  }
}

// ========================================
// Database Persistence
// ========================================

interface PersistContext {
  simulationId: string;
  tickId: string;
  day: number;
  hour: number;
}

/**
 * Persist customer events to database.
 * Uses onConflictDoNothing for idempotency (safe to retry).
 */
async function persistCustomerEvents(
  outcomes: AgentCustomerOutcome[],
  context: PersistContext
): Promise<string[]> {
  if (outcomes.length === 0) {
    return [];
  }

  const values = outcomes.map((o) => ({
    simulation_id: context.simulationId,
    agent_id: o.agentId,
    tick_id: context.tickId,
    day: context.day,
    hour: context.hour,
    customers_served: o.customersServed,
    sales_volume: o.salesVolume,
    revenue: o.revenue,
    demand_factors: o.demandFactors,
  }));

  // Insert with conflict handling for idempotency
  const result = await db
    .insert(customer_events)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: customer_events.id });

  // If we got results, use those IDs
  if (result.length === outcomes.length) {
    return result.map((r) => r.id);
  }

  // If some/all were conflicts (already existed), query for the IDs
  // This handles retry scenarios
  const { eq, and } = await import("drizzle-orm");
  const existingEvents = await db
    .select({ id: customer_events.id, agent_id: customer_events.agent_id })
    .from(customer_events)
    .where(
      and(
        eq(customer_events.simulation_id, context.simulationId),
        eq(customer_events.day, context.day),
        eq(customer_events.hour, context.hour)
      )
    );

  // Map agent IDs to event IDs
  const agentToEventId = new Map(existingEvents.map((e) => [e.agent_id, e.id]));
  return outcomes.map((o) => agentToEventId.get(o.agentId) ?? "");
}

// ========================================
// Artifact Helpers
// ========================================

/**
 * Build customer engine section for tick artifact
 */
export function buildCustomerEngineArtifactSection(
  output: CustomerEngineOutput,
  envSnapshot: EnvironmentSnapshot
): CustomerEngineArtifactSection {
  const weatherMod = getWeatherModifier(envSnapshot.weather);
  const eventMod = getSpecialEventModifier(envSnapshot.specialEvent);

  return {
    version: 1,
    totalDemand: output.totalDemand,
    weatherModifier: weatherMod.demandMultiplier,
    eventModifier: eventMod,
    agentOutcomes: output.agentOutcomes.map((o) => ({
      agentId: o.agentId,
      customersServed: o.customersServed,
      salesVolume: o.salesVolume,
      revenue: o.revenue,
      marketShare: roundToDecimals(o.marketShare, 4),
    })),
  };
}

// ========================================
// Utilities
// ========================================

function roundToDecimals(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
