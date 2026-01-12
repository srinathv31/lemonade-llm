import { z } from "zod";

// Schema for model details from Ollama API
export const ollamaModelDetailsSchema = z.object({
  format: z.string(),
  family: z.string(),
  families: z.array(z.string()).nullable(),
  parameter_size: z.string(),
  quantization_level: z.string(),
});

// Schema for individual model
export const ollamaModelSchema = z.object({
  name: z.string(),
  modified_at: z.string(),
  size: z.number(),
  digest: z.string(),
  details: ollamaModelDetailsSchema,
});

// Schema for models list response
export const ollamaModelsResponseSchema = z.object({
  models: z.array(ollamaModelSchema),
});

// Schema for health check response
export const ollamaHealthStatusSchema = z.object({
  healthy: z.boolean(),
  timestamp: z.string(),
  baseUrl: z.string(),
  modelCount: z.number().optional(),
  error: z.string().optional(),
});

// Schema for test endpoint request body
export const testRequestSchema = z.object({
  model: z.string().min(1, "Model name is required"),
  prompt: z.string().min(1, "Prompt is required").max(1000, "Prompt too long"),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().min(1).max(4096).optional().default(256),
});

// Schema for test endpoint response
export const testResponseSchema = z.object({
  success: z.boolean(),
  text: z.string().optional(),
  model: z.string(),
  duration: z.number(),
  finishReason: z.string().optional(),
  error: z.string().optional(),
});

// Inferred types from schemas
export type TestRequest = z.infer<typeof testRequestSchema>;
export type TestResponse = z.infer<typeof testResponseSchema>;
