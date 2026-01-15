import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { eq, and, or } from "drizzle-orm";
import db from "@/lib/db/drizzle";
import { simulations } from "@/lib/db/drizzle/schema";
import { SimulationApiError } from "./errors";

// ========================================
// Response Helpers
// ========================================

/**
 * Create a success JSON response.
 */
export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200
): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

/**
 * Create an error JSON response.
 */
export function errorResponse(
  status: number,
  message: string,
  code?: string
): NextResponse {
  return NextResponse.json(
    { success: false, error: message, ...(code && { code }) },
    { status }
  );
}

/**
 * Handle errors in a consistent way across all simulation API routes.
 */
export function handleApiError(error: unknown, route: string): NextResponse {
  // Zod validation errors
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return errorResponse(400, `Validation error: ${issues.join(", ")}`);
  }

  // Custom API errors
  if (error instanceof SimulationApiError) {
    return errorResponse(error.statusCode, error.message, error.code);
  }

  // JSON parse errors
  if (error instanceof SyntaxError) {
    return errorResponse(400, "Invalid JSON in request body");
  }

  // Unknown errors
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      route,
      error: errorMessage,
    })
  );

  return errorResponse(500, errorMessage);
}

// ========================================
// Status Management
// ========================================

/**
 * Atomically acquire a run lock for a simulation.
 * Returns true if the lock was acquired, false if the simulation is already running
 * or was modified by another request.
 */
export async function acquireRunLock(simulationId: string): Promise<boolean> {
  const result = await db
    .update(simulations)
    .set({ status: "running" })
    .where(
      and(
        eq(simulations.id, simulationId),
        or(
          eq(simulations.status, "pending"),
          eq(simulations.status, "completed"),
          eq(simulations.status, "partial"),
          eq(simulations.status, "failed")
        )
      )
    )
    .returning({ id: simulations.id });

  return result.length > 0;
}

/**
 * Update simulation status after a run completes.
 */
export async function updateSimulationStatus(
  simulationId: string,
  status: string,
  finishedAt?: Date
): Promise<void> {
  await db
    .update(simulations)
    .set({
      status,
      finished_at: finishedAt ?? null,
    })
    .where(eq(simulations.id, simulationId));
}

/**
 * Release a run lock by setting status back to pending (for error recovery).
 */
export async function releaseRunLock(
  simulationId: string,
  errorStatus = "failed"
): Promise<void> {
  await db
    .update(simulations)
    .set({ status: errorStatus })
    .where(eq(simulations.id, simulationId));
}

// ========================================
// Logging
// ========================================

/**
 * Log a structured API operation entry.
 */
export function logApiOperation(
  route: string,
  operation: string,
  status: "start" | "success" | "error",
  meta?: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      route,
      operation,
      status,
      ...meta,
    })
  );
}
