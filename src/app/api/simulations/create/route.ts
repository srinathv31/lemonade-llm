import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db/drizzle";
import { simulations, agents } from "@/lib/db/drizzle/schema";
import { listModels, ollamaHealthCheck } from "@/lib/ollama";
import {
  createSimulationRequestSchema,
  type CreateSimulationResponse,
} from "../schemas";
import { SimulationErrors } from "../errors";
import { successResponse, handleApiError, logApiOperation } from "../utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/simulations/create
 * Create a new simulation with agents.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateSimulationResponse>> {
  const route = "/api/simulations/create";

  try {
    logApiOperation(route, "createSimulation", "start");

    // Parse and validate request body
    const body = await request.json();
    const validated = createSimulationRequestSchema.parse(body);

    // Check Ollama health
    const health = await ollamaHealthCheck();
    if (!health.healthy) {
      throw SimulationErrors.OLLAMA_UNAVAILABLE();
    }

    // Validate all model names exist in Ollama
    const modelsResponse = await listModels();
    const availableModels = new Set(modelsResponse.models.map((m) => m.name));

    for (const agent of validated.agents) {
      if (!availableModels.has(agent.modelName)) {
        throw SimulationErrors.MODEL_NOT_FOUND(agent.modelName);
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

    logApiOperation(route, "createSimulation", "success", {
      simulationId: simulation.id,
      agentCount: validated.agents.length,
    });

    return successResponse({
      simulation: {
        id: simulation.id,
        name: simulation.name,
        status: simulation.status,
        agentCount: validated.agents.length,
        config: simulation.config as Record<string, unknown>,
        createdAt: simulation.created_at.toISOString(),
      },
    }) as NextResponse<CreateSimulationResponse>;
  } catch (error) {
    return handleApiError(error, route) as NextResponse<CreateSimulationResponse>;
  }
}
