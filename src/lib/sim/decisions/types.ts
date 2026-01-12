import type { AgentDecision } from "./schema";

/**
 * Result of successfully parsing and validating an LLM decision response
 */
export interface DecisionParseResult {
  success: true;
  decision: AgentDecision;
  metadata: DecisionMetadata;
}

/**
 * Result when parsing/validation fails
 */
export interface DecisionParseError {
  success: false;
  error: string;
  rawInput?: unknown;
  metadata: DecisionMetadata;
}

/**
 * Union type for decision parsing results
 */
export type DecisionResult = DecisionParseResult | DecisionParseError;

/**
 * Metadata captured during decision parsing for provenance tracking
 */
export interface DecisionMetadata {
  /** ISO timestamp when parsing occurred */
  parsedAt: string;
  /** Schema version for future migrations */
  schemaVersion: number;
  /** True if values were coerced to valid range */
  wasCoerced: boolean;
  /** True if reasoning was truncated */
  reasoningTruncated: boolean;
  /** Original reasoning length before truncation (if truncated) */
  originalReasoningLength?: number;
}

/**
 * Context needed to build a fallback decision
 */
export interface FallbackContext {
  agentId: string;
  previousDecision?: AgentDecision;
}

/**
 * Structured log entry for decision validation (per CLAUDE.md)
 * IMPORTANT: Never include raw prompt/response content here
 */
export interface DecisionLogEntry {
  timestamp: string;
  operation: "parseDecision" | "validateDecision" | "hashSchema";
  status: "success" | "error" | "coerced";
  agentId?: string;
  tickId?: string;
  duration?: number;
  error?: string;
}
