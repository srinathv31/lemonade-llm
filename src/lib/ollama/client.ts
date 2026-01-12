import { ollama } from "ai-sdk-ollama";
import { generateText as aiGenerateText } from "ai";
import type {
  OllamaModelsResponse,
  OllamaHealthStatus,
  GenerateTextOptions,
  GenerateTextResult,
  OllamaLogEntry,
} from "./types";
import { ollamaModelsResponseSchema } from "./schemas";

// Default configuration
const DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * Get the configured Ollama base URL from environment or default
 */
function getBaseUrl(): string {
  return process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
}

/**
 * Structured logging helper following CLAUDE.md guidelines
 */
function logOperation(entry: OllamaLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

/**
 * List all available models from Ollama
 * Fetches from /api/tags endpoint and validates response with Zod
 */
export async function listModels(): Promise<OllamaModelsResponse> {
  const baseUrl = getBaseUrl();
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`
      );
    }

    const data: unknown = await response.json();

    // Validate response with Zod
    const validated = ollamaModelsResponseSchema.parse(data);

    logOperation({
      timestamp: new Date().toISOString(),
      operation: "listModels",
      status: "success",
      duration: Date.now() - startTime,
    });

    return validated;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logOperation({
      timestamp: new Date().toISOString(),
      operation: "listModels",
      status: "error",
      duration: Date.now() - startTime,
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Check if Ollama is running and accessible
 * Uses /api/tags as a health probe (common pattern per Ollama docs)
 */
export async function ollamaHealthCheck(): Promise<OllamaHealthStatus> {
  const baseUrl = getBaseUrl();
  const startTime = Date.now();

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: unknown = await response.json();
    const validated = ollamaModelsResponseSchema.parse(data);

    const result: OllamaHealthStatus = {
      healthy: true,
      timestamp: new Date().toISOString(),
      baseUrl,
      modelCount: validated.models.length,
    };

    logOperation({
      timestamp: result.timestamp,
      operation: "healthCheck",
      status: "success",
      duration: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logOperation({
      timestamp: new Date().toISOString(),
      operation: "healthCheck",
      status: "error",
      duration: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      healthy: false,
      timestamp: new Date().toISOString(),
      baseUrl,
      error: errorMessage,
    };
  }
}

/**
 * Thin wrapper around AI SDK's generateText for Ollama
 * Provides consistent interface with logging and error handling
 */
export async function generateTextWrapper(
  options: GenerateTextOptions
): Promise<GenerateTextResult> {
  const { model, prompt, temperature = 0.7, maxTokens = 256 } = options;
  const startTime = Date.now();

  try {
    const result = await aiGenerateText({
      model: ollama(model),
      prompt,
      temperature,
      maxOutputTokens: maxTokens,
    });

    const duration = Date.now() - startTime;

    logOperation({
      timestamp: new Date().toISOString(),
      operation: "generateText",
      status: "success",
      duration,
      model,
    });

    return {
      text: result.text,
      model,
      duration,
      finishReason: result.finishReason ?? "unknown",
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - startTime;

    logOperation({
      timestamp: new Date().toISOString(),
      operation: "generateText",
      status: "error",
      duration,
      model,
      error: errorMessage,
    });

    throw new Error(
      `Failed to generate text with model ${model}: ${errorMessage}`
    );
  }
}

// Re-export the ollama provider for direct use when needed
export { ollama };
