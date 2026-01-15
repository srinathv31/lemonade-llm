import db from "../../../db/drizzle";
import { simulation_metrics } from "../../../db/drizzle/schema";
import type { DaySummary, AgentDailySummary } from "../types";

// ========================================
// Day Metrics Persistence
// ========================================

/**
 * Persist day summary metrics to simulation_metrics table.
 * Non-fatal if insertion fails - will be logged and continue.
 */
export async function persistDaySummaryMetrics(
  simulationId: string,
  dayId: string,
  day: number,
  summary: DaySummary,
  agentSummaries: AgentDailySummary[]
): Promise<void> {
  const metrics: Array<{
    simulation_id: string;
    metric_name: string;
    value: number;
    meta: Record<string, unknown>;
  }> = [];

  // Day-level metrics
  metrics.push({
    simulation_id: simulationId,
    metric_name: "day_total_customers",
    value: summary.totalCustomers,
    meta: { day, dayId },
  });

  metrics.push({
    simulation_id: simulationId,
    metric_name: "day_total_revenue",
    value: summary.totalRevenue,
    meta: { day, dayId },
  });

  metrics.push({
    simulation_id: simulationId,
    metric_name: "day_completion_rate",
    value:
      summary.totalTicks > 0 ? summary.completedTicks / summary.totalTicks : 0,
    meta: {
      day,
      dayId,
      completedTicks: summary.completedTicks,
      totalTicks: summary.totalTicks,
    },
  });

  metrics.push({
    simulation_id: simulationId,
    metric_name: "day_fallback_rate",
    value:
      summary.totalAgentTurns > 0
        ? summary.fallbackCount / summary.totalAgentTurns
        : 0,
    meta: {
      day,
      dayId,
      fallbackCount: summary.fallbackCount,
      totalAgentTurns: summary.totalAgentTurns,
    },
  });

  metrics.push({
    simulation_id: simulationId,
    metric_name: "day_average_tick_duration_ms",
    value: summary.averageTickDurationMs,
    meta: { day, dayId },
  });

  // Per-agent daily metrics
  agentSummaries.forEach((agent) => {
    metrics.push({
      simulation_id: simulationId,
      metric_name: "agent_day_revenue",
      value: agent.totalRevenue,
      meta: { day, dayId, agentId: agent.agentId, modelName: agent.modelName },
    });

    metrics.push({
      simulation_id: simulationId,
      metric_name: "agent_day_customers",
      value: agent.totalCustomersServed,
      meta: { day, dayId, agentId: agent.agentId, modelName: agent.modelName },
    });

    metrics.push({
      simulation_id: simulationId,
      metric_name: "agent_day_market_share_avg",
      value: agent.marketShareAverage,
      meta: { day, dayId, agentId: agent.agentId, modelName: agent.modelName },
    });
  });

  // Batch insert
  await db.insert(simulation_metrics).values(metrics);
}
