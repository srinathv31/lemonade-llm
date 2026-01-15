import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import { simulations, simulation_artifacts } from "@/lib/db/drizzle/schema";
import {
  runDay,
  type SimulationConfig,
  type RunDayResult,
} from "@/lib/sim/engine";
import {
  runSimulationRequestSchema,
  type RunSimulationResponse,
} from "../../schemas";
import { SimulationErrors } from "../../errors";
import {
  acquireRunLock,
  updateSimulationStatus,
  releaseRunLock,
  handleApiError,
  logApiOperation,
} from "../../utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300; // 5 minute timeout

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface AgentRanking {
  rank: number;
  agentId: string;
  modelName: string;
  totalRevenue: number;
  totalCustomers: number;
  daysParticipated: number;
}

interface RunSummaryArtifactPayload {
  version: 1;
  simulationId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  daysConfigured: number;
  daysRun: number;
  daysCompleted: number;
  daysFailed: number;
  daysPartial: number;
  dayOutcomes: Array<{
    day: number;
    status: "completed" | "partial" | "failed";
    durationMs: number;
    ticksCompleted: number;
    totalRevenue: number;
    totalCustomers: number;
  }>;
  agentRankings: AgentRanking[];
  winner?: {
    agentId: string;
    modelName: string;
    totalRevenue: number;
    margin: number;
  };
}

/**
 * Aggregate agent summaries across all days.
 */
function aggregateAgentResults(
  dayResults: RunDayResult[]
): Map<string, { modelName: string; totalRevenue: number; totalCustomers: number; daysParticipated: number }> {
  const agentMap = new Map<
    string,
    { modelName: string; totalRevenue: number; totalCustomers: number; daysParticipated: number }
  >();

  for (const day of dayResults) {
    for (const agent of day.agentDailySummaries) {
      const existing = agentMap.get(agent.agentId);
      if (existing) {
        existing.totalRevenue += agent.totalRevenue;
        existing.totalCustomers += agent.totalCustomersServed;
        existing.daysParticipated += 1;
      } else {
        agentMap.set(agent.agentId, {
          modelName: agent.modelName,
          totalRevenue: agent.totalRevenue,
          totalCustomers: agent.totalCustomersServed,
          daysParticipated: 1,
        });
      }
    }
  }

  return agentMap;
}

/**
 * Calculate agent rankings by total revenue.
 */
function calculateRankings(
  agentMap: Map<string, { modelName: string; totalRevenue: number; totalCustomers: number; daysParticipated: number }>
): AgentRanking[] {
  const rankings = Array.from(agentMap.entries())
    .map(([agentId, data]) => ({
      agentId,
      ...data,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map((agent, index) => ({
      rank: index + 1,
      ...agent,
    }));

  return rankings;
}

/**
 * Persist run summary artifact.
 */
async function persistRunSummaryArtifact(
  simulationId: string,
  dayResults: RunDayResult[],
  startedAt: Date,
  finishedAt: Date,
  numDays: number
): Promise<string> {
  const agentMap = aggregateAgentResults(dayResults);
  const rankings = calculateRankings(agentMap);

  const daysCompleted = dayResults.filter((d) => d.status === "completed").length;
  const daysFailed = dayResults.filter((d) => d.status === "failed").length;
  const daysPartial = dayResults.filter((d) => d.status === "partial").length;

  // Determine winner (if any rankings exist)
  let winner;
  if (rankings.length > 0) {
    const firstPlace = rankings[0];
    const secondPlace = rankings[1];
    winner = {
      agentId: firstPlace.agentId,
      modelName: firstPlace.modelName,
      totalRevenue: firstPlace.totalRevenue,
      margin: secondPlace ? firstPlace.totalRevenue - secondPlace.totalRevenue : firstPlace.totalRevenue,
    };
  }

  const payload: RunSummaryArtifactPayload = {
    version: 1,
    simulationId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    daysConfigured: numDays,
    daysRun: dayResults.length,
    daysCompleted,
    daysFailed,
    daysPartial,
    dayOutcomes: dayResults.map((day) => ({
      day: day.day,
      status: day.status,
      durationMs: day.durationMs,
      ticksCompleted: day.summary.completedTicks,
      totalRevenue: day.summary.totalRevenue,
      totalCustomers: day.summary.totalCustomers,
    })),
    agentRankings: rankings,
    winner,
  };

  const [artifact] = await db
    .insert(simulation_artifacts)
    .values({
      simulation_id: simulationId,
      kind: "run_summary",
      schema_version: 1,
      artifact: payload,
      is_redacted: true, // Always redacted for summary artifacts
    })
    .returning({ id: simulation_artifacts.id });

  return artifact.id;
}

/**
 * POST /api/simulations/[id]/run
 * Run the full simulation (all days, blocking).
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<RunSimulationResponse>> {
  const route = "/api/simulations/[id]/run";
  const { id } = await params;
  const startTime = Date.now();
  const startedAt = new Date();

  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = runSimulationRequestSchema.parse(body);

    logApiOperation(route, "runSimulation", "start", { simulationId: id });

    // Fetch simulation
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id));

    if (!simulation) {
      throw SimulationErrors.NOT_FOUND(id);
    }

    const config = simulation.config as SimulationConfig;
    const numDays = config.numDays ?? 5;
    const startDay = validated.startDay ?? 1;

    // Validate start day
    if (startDay > numDays) {
      throw SimulationErrors.INVALID_DAY(startDay, numDays);
    }

    // Acquire run lock
    const lockAcquired = await acquireRunLock(id);
    if (!lockAcquired) {
      throw SimulationErrors.ALREADY_RUNNING(id);
    }

    try {
      const dayResults: RunDayResult[] = [];

      // Run each day sequentially
      for (let day = startDay; day <= numDays; day++) {
        logApiOperation(route, "runDay", "start", {
          simulationId: id,
          day,
          totalDays: numDays,
        });

        const result = await runDay({
          simulationId: id,
          day,
          config,
          sequential: validated.sequential,
        });

        dayResults.push(result);

        logApiOperation(route, "runDay", "success", {
          simulationId: id,
          day,
          status: result.status,
        });
      }

      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;

      // Calculate final status
      const daysCompleted = dayResults.filter((d) => d.status === "completed").length;
      const daysFailed = dayResults.filter((d) => d.status === "failed").length;

      let finalStatus: "completed" | "partial" | "failed";
      if (daysCompleted === dayResults.length) {
        finalStatus = "completed";
      } else if (daysCompleted > 0) {
        finalStatus = "partial";
      } else {
        finalStatus = "failed";
      }

      // Persist run summary artifact
      await persistRunSummaryArtifact(id, dayResults, startedAt, finishedAt, numDays);

      // Update simulation status
      await updateSimulationStatus(id, finalStatus, finishedAt);

      // Aggregate results for response
      const agentMap = aggregateAgentResults(dayResults);
      const rankings = calculateRankings(agentMap);

      const totalRevenue = dayResults.reduce((sum, d) => sum + d.summary.totalRevenue, 0);
      const totalCustomers = dayResults.reduce((sum, d) => sum + d.summary.totalCustomers, 0);

      logApiOperation(route, "runSimulation", "success", {
        simulationId: id,
        status: finalStatus,
        daysRun: dayResults.length,
        daysCompleted,
        duration: durationMs,
      });

      return NextResponse.json({
        success: true,
        result: {
          simulationId: id,
          status: finalStatus,
          durationMs,
          daysRun: dayResults.length,
          daysCompleted,
          daysFailed,
          dayResults: dayResults.map((d) => ({
            day: d.day,
            status: d.status,
            durationMs: d.durationMs,
            totalRevenue: d.summary.totalRevenue,
          })),
          summary: {
            totalRevenue,
            totalCustomers,
            winningAgent:
              rankings.length > 0
                ? {
                    agentId: rankings[0].agentId,
                    modelName: rankings[0].modelName,
                    totalRevenue: rankings[0].totalRevenue,
                  }
                : undefined,
          },
        },
        duration: durationMs,
      }) as NextResponse<RunSimulationResponse>;
    } catch (runError) {
      // Release lock on error
      await releaseRunLock(id, "failed");
      throw runError;
    }
  } catch (error) {
    return handleApiError(error, route) as NextResponse<RunSimulationResponse>;
  }
}
