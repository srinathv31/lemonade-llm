import { NextRequest, NextResponse } from "next/server";
import { eq, count, sql } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import {
  simulations,
  agents,
  simulation_days,
  simulation_ticks,
  agent_decisions,
  customer_events,
  simulation_artifacts,
} from "@/lib/db/drizzle/schema";
import {
  type GetSimulationResponse,
  type DeleteSimulationResponse,
} from "../schemas";
import { SimulationErrors } from "../errors";
import { successResponse, handleApiError, logApiOperation } from "../utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/simulations/[id]
 * Get detailed information about a specific simulation.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<GetSimulationResponse>> {
  const route = "/api/simulations/[id]";
  const { id } = await params;

  try {
    logApiOperation(route, "getSimulation", "start", { simulationId: id });

    // Fetch simulation
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id));

    if (!simulation) {
      throw SimulationErrors.NOT_FOUND(id);
    }

    // Fetch agents
    const agentRows = await db
      .select({
        id: agents.id,
        modelName: agents.model_name,
        strategy: agents.strategy,
      })
      .from(agents)
      .where(eq(agents.simulation_id, id));

    // Fetch day statuses with tick counts
    const dayRows = await db
      .select({
        day: simulation_days.day,
        status: simulation_days.status,
      })
      .from(simulation_days)
      .where(eq(simulation_days.simulation_id, id))
      .orderBy(simulation_days.day);

    // Get tick counts per day
    const tickCounts = await db
      .select({
        day: simulation_ticks.day,
        total: count(),
        completed: sql<number>`count(*) filter (where ${simulation_ticks.status} = 'completed')`,
      })
      .from(simulation_ticks)
      .where(eq(simulation_ticks.simulation_id, id))
      .groupBy(simulation_ticks.day);

    const tickCountMap = new Map(
      tickCounts.map((tc) => [
        tc.day,
        { total: tc.total, completed: tc.completed },
      ])
    );

    const days = dayRows.map((day) => ({
      day: day.day,
      status: day.status,
      tickCount: tickCountMap.get(day.day)?.total ?? 0,
      completedTicks: tickCountMap.get(day.day)?.completed ?? 0,
    }));

    // Calculate summary if there are completed days
    let summary;
    if (days.length > 0) {
      const totalDays = days.length;
      const completedDays = days.filter((d) => d.status === "completed").length;
      const totalTicks = days.reduce((sum, d) => sum + d.tickCount, 0);
      const completedTicks = days.reduce((sum, d) => sum + d.completedTicks, 0);

      // Get total revenue from customer events
      const [revenueResult] = await db
        .select({
          totalRevenue: sql<number>`coalesce(sum(${customer_events.revenue}), 0)`,
        })
        .from(customer_events)
        .where(eq(customer_events.simulation_id, id));

      summary = {
        totalDays,
        completedDays,
        totalTicks,
        completedTicks,
        totalRevenue: revenueResult?.totalRevenue ?? 0,
      };
    }

    logApiOperation(route, "getSimulation", "success", { simulationId: id });

    return successResponse({
      simulation: {
        id: simulation.id,
        name: simulation.name,
        status: simulation.status,
        config: simulation.config as Record<string, unknown>,
        createdAt: simulation.created_at.toISOString(),
        finishedAt: simulation.finished_at?.toISOString(),
        agents: agentRows.map((a) => ({
          id: a.id,
          modelName: a.modelName,
          strategy: a.strategy as Record<string, unknown> | undefined,
        })),
        days,
        summary,
      },
    }) as NextResponse<GetSimulationResponse>;
  } catch (error) {
    return handleApiError(error, route) as NextResponse<GetSimulationResponse>;
  }
}

/**
 * DELETE /api/simulations/[id]
 * Delete a simulation and all associated data.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<DeleteSimulationResponse>> {
  const route = "/api/simulations/[id]";
  const { id } = await params;

  try {
    logApiOperation(route, "deleteSimulation", "start", { simulationId: id });

    // Verify simulation exists
    const [simulation] = await db
      .select({ id: simulations.id, status: simulations.status })
      .from(simulations)
      .where(eq(simulations.id, id));

    if (!simulation) {
      throw SimulationErrors.NOT_FOUND(id);
    }

    // Prevent deleting running simulations
    if (simulation.status === "running") {
      throw SimulationErrors.INVALID_STATUS(simulation.status);
    }

    // Delete in order to respect foreign key constraints
    // 1. Delete artifacts
    await db
      .delete(simulation_artifacts)
      .where(eq(simulation_artifacts.simulation_id, id));

    // 2. Delete customer events
    await db
      .delete(customer_events)
      .where(eq(customer_events.simulation_id, id));

    // 3. Delete agent decisions
    await db
      .delete(agent_decisions)
      .where(eq(agent_decisions.simulation_id, id));

    // 4. Delete ticks
    await db
      .delete(simulation_ticks)
      .where(eq(simulation_ticks.simulation_id, id));

    // 5. Delete days
    await db
      .delete(simulation_days)
      .where(eq(simulation_days.simulation_id, id));

    // 6. Delete agents
    await db.delete(agents).where(eq(agents.simulation_id, id));

    // 7. Delete simulation
    await db.delete(simulations).where(eq(simulations.id, id));

    logApiOperation(route, "deleteSimulation", "success", { simulationId: id });

    return successResponse({
      message: `Simulation ${id} deleted successfully`,
    }) as NextResponse<DeleteSimulationResponse>;
  } catch (error) {
    return handleApiError(
      error,
      route
    ) as NextResponse<DeleteSimulationResponse>;
  }
}
