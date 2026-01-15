import { eq, desc, count, sql } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import {
  simulations,
  agents,
  simulation_days,
  simulation_ticks,
  customer_events,
} from "@/lib/db/drizzle/schema";

// ========================================
// Types
// ========================================

export type SimulationStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "failed";

export interface SimulationListItem {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  createdAt: Date;
  finishedAt: Date | null;
}

export interface SimulationAgent {
  id: string;
  modelName: string;
  strategy: Record<string, unknown> | null;
}

export interface SimulationDayStatus {
  id: string;
  day: number;
  status: string;
  tickCount: number;
  completedTicks: number;
}

export interface SimulationWithDetails {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: Date;
  finishedAt: Date | null;
  agents: SimulationAgent[];
  days: SimulationDayStatus[];
  summary?: {
    totalDays: number;
    completedDays: number;
    totalTicks: number;
    completedTicks: number;
    totalRevenue: number;
  };
}

export interface GetSimulationsParams {
  status?: SimulationStatus;
  limit?: number;
  offset?: number;
}

export interface GetSimulationsResult {
  simulations: SimulationListItem[];
  total: number;
}

// ========================================
// Query Functions
// ========================================

/**
 * Get paginated list of simulations with optional status filter.
 */
export async function getSimulations(
  params: GetSimulationsParams = {}
): Promise<GetSimulationsResult> {
  const { status, limit = 50, offset = 0 } = params;

  // Build where clause
  const whereClause = status ? eq(simulations.status, status) : undefined;

  // Count total matching simulations
  const [totalResult] = await db
    .select({ count: count() })
    .from(simulations)
    .where(whereClause);

  const total = totalResult?.count ?? 0;

  // Fetch simulations with agent count
  const simulationRows = await db
    .select({
      id: simulations.id,
      name: simulations.name,
      status: simulations.status,
      createdAt: simulations.created_at,
      finishedAt: simulations.finished_at,
    })
    .from(simulations)
    .where(whereClause)
    .orderBy(desc(simulations.created_at))
    .limit(limit)
    .offset(offset);

  // Fetch agent counts for each simulation
  const simulationIds = simulationRows.map((s) => s.id);

  if (simulationIds.length === 0) {
    return { simulations: [], total };
  }

  // Get agent counts in a single query
  const agentCounts = await db
    .select({
      simulationId: agents.simulation_id,
      count: count(),
    })
    .from(agents)
    .where(sql`${agents.simulation_id} IN ${simulationIds}`)
    .groupBy(agents.simulation_id);

  // Map counts to simulations
  const countMap = new Map(
    agentCounts.map((ac) => [ac.simulationId, ac.count])
  );

  const simulationsList: SimulationListItem[] = simulationRows.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    agentCount: countMap.get(s.id) ?? 0,
    createdAt: s.createdAt,
    finishedAt: s.finishedAt,
  }));

  return { simulations: simulationsList, total };
}

/**
 * Get simulation with full details including agents, days, and summary.
 * Returns null if not found.
 */
export async function getSimulation(
  id: string
): Promise<SimulationWithDetails | null> {
  // 1. Fetch simulation record
  const [simulation] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  if (!simulation) {
    return null;
  }

  // 2. Parallel fetches for related data
  const [simulationAgents, days, tickCounts, revenueResult] = await Promise.all(
    [
      // Fetch agents
      db
        .select({
          id: agents.id,
          modelName: agents.model_name,
          strategy: agents.strategy,
        })
        .from(agents)
        .where(eq(agents.simulation_id, id)),

      // Fetch days
      db
        .select({
          id: simulation_days.id,
          day: simulation_days.day,
          status: simulation_days.status,
        })
        .from(simulation_days)
        .where(eq(simulation_days.simulation_id, id))
        .orderBy(simulation_days.day),

      // Fetch tick counts per day
      db
        .select({
          day: simulation_ticks.day,
          total: count(),
          completed: sql<number>`COUNT(CASE WHEN ${simulation_ticks.status} = 'completed' THEN 1 END)`,
        })
        .from(simulation_ticks)
        .where(eq(simulation_ticks.simulation_id, id))
        .groupBy(simulation_ticks.day),

      // Fetch total revenue
      db
        .select({
          totalRevenue: sql<number>`COALESCE(SUM(${customer_events.revenue}), 0)`,
        })
        .from(customer_events)
        .where(eq(customer_events.simulation_id, id)),
    ]
  );

  // 3. Build tick count map
  const tickCountMap = new Map(
    tickCounts.map((tc) => [
      tc.day,
      { total: tc.total, completed: tc.completed },
    ])
  );

  // 4. Map days with tick counts
  const daysWithTicks: SimulationDayStatus[] = days.map((d) => {
    const counts = tickCountMap.get(d.day) ?? { total: 0, completed: 0 };
    return {
      id: d.id,
      day: d.day,
      status: d.status,
      tickCount: counts.total,
      completedTicks: counts.completed,
    };
  });

  // 5. Calculate summary
  const config = simulation.config as Record<string, unknown>;
  const numDays = (config?.numDays as number) ?? 5;
  const completedDays = days.filter((d) => d.status === "completed").length;
  const totalTicks = tickCounts.reduce((sum, tc) => sum + tc.total, 0);
  const completedTicks = tickCounts.reduce((sum, tc) => sum + tc.completed, 0);
  const totalRevenue = revenueResult[0]?.totalRevenue ?? 0;

  return {
    id: simulation.id,
    name: simulation.name,
    status: simulation.status,
    config: config,
    createdAt: simulation.created_at,
    finishedAt: simulation.finished_at,
    agents: simulationAgents.map((a) => ({
      id: a.id,
      modelName: a.modelName,
      strategy: a.strategy as Record<string, unknown> | null,
    })),
    days: daysWithTicks,
    summary: {
      totalDays: numDays,
      completedDays,
      totalTicks,
      completedTicks,
      totalRevenue,
    },
  };
}
