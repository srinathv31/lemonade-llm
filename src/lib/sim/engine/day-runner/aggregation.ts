import type {
  RunTickResult,
  DaySummary,
  AgentDailySummary,
} from "../types";
import { roundToDecimals } from "./utils";

/**
 * Calculate day-level summary from tick results.
 */
export function calculateDaySummary(tickResults: RunTickResult[]): DaySummary {
  const totalTicks = tickResults.length;
  const completedTicks = tickResults.filter(
    (t) => t.status === "completed"
  ).length;
  const partialTicks = tickResults.filter((t) => t.status === "partial").length;
  const failedTicks = tickResults.filter((t) => t.status === "failed").length;

  // Agent turn aggregation
  let totalAgentTurns = 0;
  let successfulAgentTurns = 0;
  let failedAgentTurns = 0;
  let fallbackCount = 0;

  tickResults.forEach((tick) => {
    totalAgentTurns += tick.summary.totalAgents;
    successfulAgentTurns += tick.summary.successfulAgents;
    failedAgentTurns += tick.summary.failedAgents;
    fallbackCount += tick.summary.fallbackCount;
  });

  // Duration aggregation
  const totalDuration = tickResults.reduce((sum, t) => sum + t.durationMs, 0);
  const averageTickDurationMs =
    totalTicks > 0 ? Math.round(totalDuration / totalTicks) : 0;

  // Customer/revenue aggregation from customerOutcomes
  let totalCustomers = 0;
  let totalRevenue = 0;

  tickResults.forEach((tick) => {
    if (tick.customerOutcomes) {
      tick.customerOutcomes.agentOutcomes.forEach((outcome) => {
        totalCustomers += outcome.customersServed;
        totalRevenue += outcome.revenue;
      });
    }
  });

  return {
    totalTicks,
    completedTicks,
    partialTicks,
    failedTicks,
    totalAgentTurns,
    successfulAgentTurns,
    failedAgentTurns,
    fallbackCount,
    averageTickDurationMs,
    totalCustomers,
    totalRevenue: roundToDecimals(totalRevenue, 2),
  };
}

/**
 * Internal accumulator for per-agent data.
 */
interface AgentAccumulator {
  agentId: string;
  modelName: string;
  ticksParticipated: number;
  successfulDecisions: number;
  fallbackDecisions: number;
  totalCustomersServed: number;
  totalRevenue: number;
  priceSum: number;
  qualitySum: number;
  marketingSum: number;
  marketShareSum: number;
  decisionCount: number;
}

/**
 * Aggregate per-agent summaries across all ticks.
 */
export function aggregateAgentDailySummaries(
  tickResults: RunTickResult[]
): AgentDailySummary[] {
  // Map to accumulate per-agent data
  const agentMap = new Map<string, AgentAccumulator>();

  tickResults.forEach((tick) => {
    // Process agent outcomes from tick
    tick.agentOutcomes.forEach((outcome) => {
      let agent = agentMap.get(outcome.agentId);
      if (!agent) {
        agent = {
          agentId: outcome.agentId,
          modelName: outcome.modelName,
          ticksParticipated: 0,
          successfulDecisions: 0,
          fallbackDecisions: 0,
          totalCustomersServed: 0,
          totalRevenue: 0,
          priceSum: 0,
          qualitySum: 0,
          marketingSum: 0,
          marketShareSum: 0,
          decisionCount: 0,
        };
        agentMap.set(outcome.agentId, agent);
      }

      agent.ticksParticipated++;
      if (outcome.success) {
        agent.successfulDecisions++;
      }
      if (outcome.usedFallback) {
        agent.fallbackDecisions++;
      }

      // Accumulate decision values for averaging
      agent.priceSum += outcome.decision.price;
      agent.qualitySum += outcome.decision.quality;
      agent.marketingSum += outcome.decision.marketing;
      agent.decisionCount++;
    });

    // Process customer outcomes for revenue/customers
    if (tick.customerOutcomes) {
      tick.customerOutcomes.agentOutcomes.forEach((custOutcome) => {
        const agent = agentMap.get(custOutcome.agentId);
        if (agent) {
          agent.totalCustomersServed += custOutcome.customersServed;
          agent.totalRevenue += custOutcome.revenue;
          agent.marketShareSum += custOutcome.marketShare;
        }
      });
    }
  });

  // Convert to final summaries with averages
  return Array.from(agentMap.values()).map((agent) => ({
    agentId: agent.agentId,
    modelName: agent.modelName,
    ticksParticipated: agent.ticksParticipated,
    successfulDecisions: agent.successfulDecisions,
    fallbackDecisions: agent.fallbackDecisions,
    totalCustomersServed: agent.totalCustomersServed,
    totalRevenue: roundToDecimals(agent.totalRevenue, 2),
    averagePrice:
      agent.decisionCount > 0
        ? roundToDecimals(agent.priceSum / agent.decisionCount, 2)
        : 0,
    averageQuality:
      agent.decisionCount > 0
        ? roundToDecimals(agent.qualitySum / agent.decisionCount, 1)
        : 0,
    averageMarketing:
      agent.decisionCount > 0
        ? Math.round(agent.marketingSum / agent.decisionCount)
        : 0,
    marketShareAverage:
      agent.ticksParticipated > 0
        ? roundToDecimals(agent.marketShareSum / agent.ticksParticipated, 4)
        : 0,
  }));
}
