// Type definitions for Ollama integration

export interface OllamaModelDetails {
  format: string;
  family: string;
  families: string[] | null;
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export interface OllamaHealthStatus {
  healthy: boolean;
  timestamp: string;
  baseUrl: string;
  modelCount?: number;
  error?: string;
}

export interface GenerateTextOptions {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  duration: number;
  finishReason: string;
}

// Structured logging types (per CLAUDE.md guidelines)
export interface OllamaLogEntry {
  timestamp: string;
  operation: "listModels" | "healthCheck" | "generateText";
  status: "success" | "error";
  duration?: number;
  model?: string;
  error?: string;
}
