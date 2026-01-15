"use server";

import { revalidatePath } from "next/cache";
import { eq, and, or } from "drizzle-orm";
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
import { runDay, type SimulationConfig } from "@/lib/sim/engine";
import { listModels, ollamaHealthCheck } from "@/lib/ollama";
import {
  createSimulationRequestSchema,
  type CreateSimulationRequest,
} from "@/app/api/simulations/schemas";

// ========================================
// Types
// ========================================

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface CreateSimulationData {
  id: string;
  name: string;
  status: string;
  agentCount: number;
}

export interface RunDayData {
  dayId: string;
  day: number;
  status: "completed" | "partial" | "failed";
  durationMs: number;
  summary: {
    totalTicks: number;
    completedTicks: number;
    totalCustomers: number;
    totalRevenue: number;
  };
}

export interface RunSimulationData {
  status: "completed" | "partial" | "failed";
  daysRun: number;
  daysCompleted: number;
  totalRevenue: number;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Atomically acquire a run lock for a simulation.
 */
async function acquireRunLock(simulationId: string): Promise<boolean> {
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
 * Update simulation status.
 */
async function updateSimulationStatus(
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
 * Release run lock on error.
 */
async function releaseRunLock(
  simulationId: string,
  errorStatus = "failed"
): Promise<void> {
  await db
    .update(simulations)
    .set({ status: errorStatus })
    .where(eq(simulations.id, simulationId));
}

// ========================================
// Server Actions
// ========================================

/**
 * Create a new simulation with agents.
 */
export async function createSimulation(
  input: CreateSimulationRequest
): Promise<ActionResult<CreateSimulationData>> {
  try {
    // Validate input
    const validated = createSimulationRequestSchema.parse(input);

    // Check Ollama health
    const health = await ollamaHealthCheck();
    if (!health.healthy) {
      return { success: false, error: "Ollama service is unavailable" };
    }

    // Validate all model names exist in Ollama
    const modelsResponse = await listModels();
    const availableModels = new Set(modelsResponse.models.map((m) => m.name));

    for (const agent of validated.agents) {
      if (!availableModels.has(agent.modelName)) {
        return {
          success: false,
          error: `Model "${agent.modelName}" not found in Ollama`,
        };
      }
    }

    // Build simulation config
    const config = {
      numDays: validated.config?.numDays ?? 5,
      environment: validated.config?.environment,
    };

    // Create simulation record
    const [simulation] = await db
      .insert(simulations)
      .values({
        name: validated.name,
        config,
        status: "pending",
      })
      .returning();

    // Create agent records
    const agentValues = validated.agents.map((agent) => ({
      simulation_id: simulation.id,
      model_name: agent.modelName,
      strategy: agent.strategy ?? null,
    }));

    await db.insert(agents).values(agentValues);

    // Revalidate simulations list
    revalidatePath("/simulations");

    return {
      success: true,
      data: {
        id: simulation.id,
        name: simulation.name,
        status: simulation.status,
        agentCount: validated.agents.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Delete a simulation and all related data.
 */
export async function deleteSimulation(
  id: string
): Promise<ActionResult<void>> {
  try {
    // Verify simulation exists and is not running
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, id))
      .limit(1);

    if (!simulation) {
      return { success: false, error: `Simulation ${id} not found` };
    }

    if (simulation.status === "running") {
      return {
        success: false,
        error: "Cannot delete a running simulation",
      };
    }

    // Delete in FK order (children first)
    // 1. Artifacts (references tick_id, day_id, agent_id, simulation_id)
    await db
      .delete(simulation_artifacts)
      .where(eq(simulation_artifacts.simulation_id, id));

    // 2. Customer events (references tick_id, agent_id, simulation_id)
    await db
      .delete(customer_events)
      .where(eq(customer_events.simulation_id, id));

    // 3. Agent decisions (references tick_id, agent_id, simulation_id)
    await db
      .delete(agent_decisions)
      .where(eq(agent_decisions.simulation_id, id));

    // 4. Simulation ticks (references simulation_id)
    await db
      .delete(simulation_ticks)
      .where(eq(simulation_ticks.simulation_id, id));

    // 5. Simulation days (references simulation_id)
    await db
      .delete(simulation_days)
      .where(eq(simulation_days.simulation_id, id));

    // 6. Agents (references simulation_id)
    await db.delete(agents).where(eq(agents.simulation_id, id));

    // 7. Simulation itself
    await db.delete(simulations).where(eq(simulations.id, id));

    // Revalidate simulations list
    revalidatePath("/simulations");

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Run a specific day of the simulation.
 */
export async function runSimulationDay(
  simulationId: string,
  day: number
): Promise<ActionResult<RunDayData>> {
  try {
    // Fetch simulation
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, simulationId))
      .limit(1);

    if (!simulation) {
      return { success: false, error: `Simulation ${simulationId} not found` };
    }

    const config = simulation.config as SimulationConfig;
    const numDays = config.numDays ?? 5;

    // Validate day number
    if (day < 1 || day > numDays) {
      return {
        success: false,
        error: `Day ${day} is invalid. Must be between 1 and ${numDays}`,
      };
    }

    // Acquire run lock
    const lockAcquired = await acquireRunLock(simulationId);
    if (!lockAcquired) {
      return {
        success: false,
        error: `Simulation ${simulationId} is already running`,
      };
    }

    try {
      // Run the day
      const result = await runDay({
        simulationId,
        day,
        config,
        sequential: false,
      });

      // Determine new status
      let newStatus: string;
      if (result.status === "failed") {
        newStatus = "failed";
      } else if (day >= numDays) {
        newStatus = result.status === "completed" ? "completed" : "partial";
      } else {
        newStatus = "pending";
      }

      // Update simulation status
      await updateSimulationStatus(
        simulationId,
        newStatus,
        newStatus === "completed" || newStatus === "failed"
          ? new Date()
          : undefined
      );

      // Revalidate simulation detail page
      revalidatePath(`/simulations/${simulationId}`);
      revalidatePath("/simulations");

      return {
        success: true,
        data: {
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
        },
      };
    } catch (runError) {
      // Release lock on error
      await releaseRunLock(simulationId, "failed");
      throw runError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Run all remaining days of the simulation.
 */
export async function runFullSimulation(
  simulationId: string
): Promise<ActionResult<RunSimulationData>> {
  try {
    // Fetch simulation
    const [simulation] = await db
      .select()
      .from(simulations)
      .where(eq(simulations.id, simulationId))
      .limit(1);

    if (!simulation) {
      return { success: false, error: `Simulation ${simulationId} not found` };
    }

    const config = simulation.config as SimulationConfig;
    const numDays = config.numDays ?? 5;

    // Determine which days have been completed
    const completedDays = await db
      .select({ day: simulation_days.day })
      .from(simulation_days)
      .where(
        and(
          eq(simulation_days.simulation_id, simulationId),
          eq(simulation_days.status, "completed")
        )
      );

    const completedDaySet = new Set(completedDays.map((d) => d.day));
    const daysToRun = Array.from({ length: numDays }, (_, i) => i + 1).filter(
      (day) => !completedDaySet.has(day)
    );

    if (daysToRun.length === 0) {
      return {
        success: true,
        data: {
          status: "completed",
          daysRun: 0,
          daysCompleted: numDays,
          totalRevenue: 0,
        },
      };
    }

    // Acquire run lock
    const lockAcquired = await acquireRunLock(simulationId);
    if (!lockAcquired) {
      return {
        success: false,
        error: `Simulation ${simulationId} is already running`,
      };
    }

    let daysCompleted = completedDaySet.size;
    let totalRevenue = 0;
    let lastStatus: "completed" | "partial" | "failed" = "completed";

    try {
      for (const day of daysToRun) {
        const result = await runDay({
          simulationId,
          day,
          config,
          sequential: false,
        });

        if (result.status === "completed") {
          daysCompleted++;
          totalRevenue += result.summary.totalRevenue;
        } else if (result.status === "partial") {
          lastStatus = "partial";
          totalRevenue += result.summary.totalRevenue;
        } else {
          lastStatus = "failed";
          break;
        }

        // Revalidate after each day for real-time updates
        revalidatePath(`/simulations/${simulationId}`);
      }

      // Determine final status
      const finalStatus: "completed" | "partial" | "failed" =
        daysCompleted === numDays && lastStatus !== "failed"
          ? "completed"
          : lastStatus === "failed"
            ? "failed"
            : "partial";

      // Update simulation status
      await updateSimulationStatus(
        simulationId,
        finalStatus,
        finalStatus === "completed" || finalStatus === "failed"
          ? new Date()
          : undefined
      );

      // Final revalidation
      revalidatePath(`/simulations/${simulationId}`);
      revalidatePath("/simulations");

      return {
        success: true,
        data: {
          status: finalStatus,
          daysRun: daysToRun.length,
          daysCompleted,
          totalRevenue,
        },
      };
    } catch (runError) {
      // Release lock on error
      await releaseRunLock(simulationId, "failed");
      throw runError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}
