import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import { simulations } from "@/lib/db/drizzle/schema";
import { runDay, type SimulationConfig } from "@/lib/sim/engine";
import { runDayRequestSchema, type RunDayResponse } from "../../schemas";
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

/**
 * POST /api/simulations/[id]/run-day
 * Run a specific day of the simulation (blocking).
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<RunDayResponse>> {
  const route = "/api/simulations/[id]/run-day";
  const { id } = await params;
  const startTime = Date.now();

  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = runDayRequestSchema.parse(body);

    logApiOperation(route, "runDay", "start", {
      simulationId: id,
      day: validated.day,
    });

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

    // Validate day number
    if (validated.day > numDays) {
      throw SimulationErrors.INVALID_DAY(validated.day, numDays);
    }

    // Acquire run lock
    const lockAcquired = await acquireRunLock(id);
    if (!lockAcquired) {
      throw SimulationErrors.ALREADY_RUNNING(id);
    }

    try {
      // Run the day
      const result = await runDay({
        simulationId: id,
        day: validated.day,
        config,
        sequential: validated.sequential,
      });

      // Determine new status based on result and day number
      let newStatus: string;
      if (result.status === "failed") {
        newStatus = "failed";
      } else if (validated.day >= numDays) {
        newStatus = result.status === "completed" ? "completed" : "partial";
      } else {
        newStatus = "pending"; // More days to run
      }

      // Update simulation status
      await updateSimulationStatus(
        id,
        newStatus,
        newStatus === "completed" || newStatus === "failed"
          ? new Date()
          : undefined
      );

      const duration = Date.now() - startTime;

      logApiOperation(route, "runDay", "success", {
        simulationId: id,
        day: validated.day,
        status: result.status,
        duration,
      });

      return NextResponse.json({
        success: true,
        result: {
          dayId: result.dayId,
          day: result.day,
          status: result.status,
          durationMs: result.durationMs,
          summary: {
            totalTicks: result.summary.totalTicks,
            completedTicks: result.summary.completedTicks,
            totalCustomers: result.summary.totalCustomers,
            totalRevenue: result.summary.totalRevenue,
          },
          agentSummaries: result.agentDailySummaries.map((a) => ({
            agentId: a.agentId,
            modelName: a.modelName,
            totalRevenue: a.totalRevenue,
            totalCustomersServed: a.totalCustomersServed,
          })),
        },
        duration,
      }) as NextResponse<RunDayResponse>;
    } catch (runError) {
      // Release lock on error
      await releaseRunLock(id, "failed");
      throw runError;
    }
  } catch (error) {
    return handleApiError(error, route) as NextResponse<RunDayResponse>;
  }
}
