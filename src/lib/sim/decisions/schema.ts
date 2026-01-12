import { z } from "zod";

// ========================================
// Constants for validation bounds
// ========================================
export const DECISION_CONSTRAINTS = {
  price: {
    min: 0.5,
    max: 10.0,
    default: 2.0,
  },
  quality: {
    min: 1,
    max: 10,
    default: 5,
  },
  marketing: {
    min: 0,
    max: 100,
    default: 50,
  },
  reasoning: {
    maxChars: 500,
  },
} as const;

// ========================================
// Main Agent Decision Schema
// ========================================
/**
 * Schema for LLM-generated agent decisions.
 * Used with AI SDK's generateObject() for structured output.
 *
 * IMPORTANT: This schema is designed to prevent chain-of-thought leakage.
 * The reasoning field is constrained to brief strategic explanations only.
 */
export const agentDecisionSchema = z.object({
  price: z
    .number()
    .min(DECISION_CONSTRAINTS.price.min)
    .max(DECISION_CONSTRAINTS.price.max)
    .describe("Price per cup of lemonade in dollars (0.50–10.00)"),

  quality: z
    .number()
    .int()
    .min(DECISION_CONSTRAINTS.quality.min)
    .max(DECISION_CONSTRAINTS.quality.max)
    .describe("Lemonade quality level from 1 (worst) to 10 (best)"),

  marketing: z
    .number()
    .int()
    .min(DECISION_CONSTRAINTS.marketing.min)
    .max(DECISION_CONSTRAINTS.marketing.max)
    .describe("Marketing effort level from 0 (none) to 100 (maximum)"),

  reasoning: z
    .string()
    .max(DECISION_CONSTRAINTS.reasoning.maxChars)
    .describe("Brief strategic explanation for these choices"),
});

// ========================================
// Raw LLM Response Schema (for lenient parsing)
// ========================================
/**
 * Lenient schema for initial parsing of LLM responses.
 * Allows coercion and provides defaults where safe.
 */
export const rawLLMDecisionSchema = z.object({
  price: z.coerce.number().optional(),
  quality: z.coerce.number().optional(),
  marketing: z.coerce.number().optional(),
  reasoning: z.string().optional(),
});

// ========================================
// Inferred Types
// ========================================
export type AgentDecision = z.infer<typeof agentDecisionSchema>;
export type RawLLMDecision = z.infer<typeof rawLLMDecisionSchema>;
