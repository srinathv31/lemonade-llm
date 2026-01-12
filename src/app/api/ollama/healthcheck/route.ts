import { NextRequest, NextResponse } from "next/server";
import { generateTextWrapper, ollamaHealthCheck } from "@/lib/ollama";
import { testRequestSchema, type TestResponse } from "@/lib/ollama/schemas";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ollama/test
 * Test calling a model with a prompt
 *
 * Request body:
 * {
 *   "model": "gemma3",
 *   "prompt": "Say hello in one sentence",
 *   "temperature": 0.7,  // optional, default 0.7
 *   "maxTokens": 256     // optional, default 256
 * }
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<TestResponse>> {
  try {
    // Parse and validate request body
    const body: unknown = await request.json();
    const validated = testRequestSchema.parse(body);

    // Check Ollama health first
    const health = await ollamaHealthCheck();

    if (!health.healthy) {
      return NextResponse.json(
        {
          success: false,
          model: validated.model,
          duration: 0,
          error: `Ollama is not available: ${health.error ?? "Unknown error"}`,
        },
        { status: 503 }
      );
    }

    // Generate text
    const result = await generateTextWrapper({
      model: validated.model,
      prompt: validated.prompt,
      temperature: validated.temperature,
      maxTokens: validated.maxTokens,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      model: result.model,
      duration: result.duration,
      finishReason: result.finishReason,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const issues = error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      );

      return NextResponse.json(
        {
          success: false,
          model: "unknown",
          duration: 0,
          error: `Validation error: ${issues.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          model: "unknown",
          duration: 0,
          error: "Invalid JSON in request body",
        },
        { status: 400 }
      );
    }

    // Handle other errors
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        route: "/api/ollama/test",
        error: errorMessage,
      })
    );

    return NextResponse.json(
      {
        success: false,
        model: "unknown",
        duration: 0,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
