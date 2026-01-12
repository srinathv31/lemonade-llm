import type { PromptContext, AgentDecision } from "../prompts";

// ========================================
// Input Parameters
// ========================================

/**
 * Parameters required to run a single agent turn.
 */
export interface AgentTurnParams {
  // Identifiers
  simulationId: string;
  agentId: string;
  tickId: string;
  dayId: string;

  // Time coordinates
  day: number;
  hour: number;

  // Agent info
  modelName: string;

  // Context for prompt building
  promptContext: PromptContext;

  // Optional: previous decision for fallback
  previousDecision?: AgentDecision;
}

// ========================================
// Result Types
// ========================================

/**
 * Outcome of an agent turn - always returns structured result, never throws.
 */
export type AgentTurnResult = AgentTurnSuccess | AgentTurnFailure;

export interface AgentTurnSuccess {
  success: true;
  decision: AgentDecision;
  decisionId: string;
  artifactId: string;
  metadata: AgentTurnMetadata;
}

export interface AgentTurnFailure {
  success: false;
  decision: AgentDecision; // Fallback decision (still persisted)
  decisionId: string;
  artifactId: string;
  error: string;
  metadata: AgentTurnMetadata;
}

export interface AgentTurnMetadata {
  modelName: string;
  promptHash: string;
  schemaHash: string;
  durationMs: number;
  attemptCount: number; // 1-3 (1 = first try, 2 = first retry, 3 = second retry)
  usedFallback: boolean;
  wasCoerced: boolean;
  reasoningTruncated: boolean;
}

// ========================================
// Internal Types
// ========================================

/**
 * Internal attempt result for retry logic.
 */
export interface LLMAttemptResult {
  success: boolean;
  decision?: AgentDecision;
  rawResponse?: unknown;
  error?: string;
  wasCoerced: boolean;
  reasoningTruncated: boolean;
}

// ========================================
// Artifact Types
// ========================================

/**
 * Artifact payload structure for agent_turn kind.
 * This is what gets stored in simulation_artifacts.artifact JSONB.
 */
export interface AgentTurnArtifactPayload {
  // Always present (even when redacted)
  version: 1;
  agentId: string;
  modelName: string;
  day: number;
  hour: number;

  // Timing
  startedAt: string; // ISO timestamp
  finishedAt: string; // ISO timestamp
  durationMs: number;

  // Attempt tracking
  attemptCount: number;
  usedFallback: boolean;

  // Decision outcome (always present)
  decision: {
    price: number;
    quality: number;
    marketing: number;
    // reasoning EXCLUDED from artifact - it's in agent_decisions table
  };

  // Parsing metadata
  wasCoerced: boolean;
  reasoningTruncated: boolean;

  // Error info (if failed)
  error?: string;

  // Raw LLM I/O - ONLY when STORE_RAW_LLM_IO=true AND non-production
  rawPrompt?: string;
  rawResponse?: string;
}

// ========================================
// Logging Types
// ========================================

/**
 * Structured log entry for agent turn operations.
 * Per CLAUDE.md guidelines: log metadata, not raw prompts/responses.
 */
export interface AgentTurnLogEntry {
  timestamp: string;
  operation:
    | "runAgentTurn"
    | "llmAttempt"
    | "persistDecision"
    | "persistArtifact";
  status: "start" | "success" | "error" | "retry" | "fallback";
  simulationId: string;
  agentId: string;
  tickId: string;
  day: number;
  hour: number;
  model?: string;
  duration?: number;
  attemptNumber?: number;
  promptHash?: string;
  error?: string;
}
