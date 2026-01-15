import { NextRequest, NextResponse } from "next/server";
import { eq, count, desc } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import { simulations, agents } from "@/lib/db/drizzle/schema";
import {
  listSimulationsQuerySchema,
  type ListSimulationsResponse,
} from "../schemas";
import { successResponse, handleApiError, logApiOperation } from "../utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/simulations/list
 * List all simulations with pagination and optional status filter.
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<ListSimulationsResponse>> {
  const route = "/api/simulations/list";

  try {
    logApiOperation(route, "listSimulations", "start");

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const query = listSimulationsQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    // Build the base query
    const baseCondition = query.status
      ? eq(simulations.status, query.status)
      : undefined;

    // Get total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(simulations)
      .where(baseCondition);
    const total = totalResult?.count ?? 0;

    // Get simulations with agent counts
    const simulationRows = await db
      .select({
        id: simulations.id,
        name: simulations.name,
        status: simulations.status,
        createdAt: simulations.created_at,
        finishedAt: simulations.finished_at,
      })
      .from(simulations)
      .where(baseCondition)
      .orderBy(desc(simulations.created_at))
      .limit(query.limit)
      .offset(query.offset);

    // Get agent counts for each simulation
    const agentCounts = await db
      .select({
        simulationId: agents.simulation_id,
        count: count(),
      })
      .from(agents)
      .groupBy(agents.simulation_id);

    const agentCountMap = new Map(
      agentCounts.map((ac) => [ac.simulationId, ac.count])
    );

    // Format response
    const simulationList = simulationRows.map((sim) => ({
      id: sim.id,
      name: sim.name,
      status: sim.status,
      agentCount: agentCountMap.get(sim.id) ?? 0,
      createdAt: sim.createdAt.toISOString(),
      finishedAt: sim.finishedAt?.toISOString(),
    }));

    logApiOperation(route, "listSimulations", "success", {
      count: simulationList.length,
      total,
    });

    return successResponse({
      simulations: simulationList,
      total,
    }) as NextResponse<ListSimulationsResponse>;
  } catch (error) {
    return handleApiError(error, route) as NextResponse<ListSimulationsResponse>;
  }
}
