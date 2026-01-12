import { NextResponse } from "next/server";
import { listModels, ollamaHealthCheck } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ModelsApiResponse {
  success: boolean;
  models?: Array<{
    name: string;
    size: number;
    parameterSize: string;
    family: string;
    quantization: string;
    modifiedAt: string;
  }>;
  count?: number;
  error?: string;
}

/**
 * GET /api/ollama/models
 * Returns available Ollama models
 */
export async function GET(): Promise<NextResponse<ModelsApiResponse>> {
  try {
    // First check if Ollama is healthy
    const health = await ollamaHealthCheck();

    if (!health.healthy) {
      return NextResponse.json(
        {
          success: false,
          error: `Ollama is not available: ${health.error ?? "Unknown error"}`,
        },
        { status: 503 }
      );
    }

    // Fetch models
    const response = await listModels();

    // Transform to cleaner response format
    const models = response.models.map((model) => ({
      name: model.name,
      size: model.size,
      parameterSize: model.details.parameter_size,
      family: model.details.family,
      quantization: model.details.quantization_level,
      modifiedAt: model.modified_at,
    }));

    return NextResponse.json({
      success: true,
      models,
      count: models.length,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        route: "/api/ollama/models",
        error: errorMessage,
      })
    );

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
