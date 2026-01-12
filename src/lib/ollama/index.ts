// Public API for Ollama integration
export {
  listModels,
  ollamaHealthCheck,
  generateTextWrapper,
  ollama,
} from "./client";

export type {
  OllamaModel,
  OllamaModelDetails,
  OllamaModelsResponse,
  OllamaHealthStatus,
  GenerateTextOptions,
  GenerateTextResult,
} from "./types";

export {
  ollamaModelSchema,
  ollamaModelsResponseSchema,
  ollamaHealthStatusSchema,
  testRequestSchema,
  testResponseSchema,
} from "./schemas";

export type { TestRequest, TestResponse } from "./schemas";
