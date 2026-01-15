import type { TickRunnerLogEntry, TickSummary, TickAgentOutcome } from "../types";

// ========================================
// Configuration
// ========================================

/** Maximum history entries to include in agent context */
export const MAX_HISTORY_ENTRIES = 10;

// ========================================
// Logging (CLAUDE.md Compliant)
// ========================================

/**
 * Structured logging helper (per CLAUDE.md guidelines).
 * Only logs in development to avoid noise in production.
 * NEVER logs raw prompts or responses.
 */
export function logTickOperation(entry: TickRunnerLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

// ========================================
// Summary Calculation
// ========================================

/**
 * Calculate tick summary statistics.
 */
export function calculateSummary(outcomes: TickAgentOutcome[]): TickSummary {
  const totalAgents = outcomes.length;
  const successfulAgents = outcomes.filter((o) => o.success).length;
  const failedAgents = outcomes.filter((o) => !o.success).length;
  const fallbackCount = outcomes.filter((o) => o.usedFallback).length;
  const totalDuration = outcomes.reduce((sum, o) => sum + o.durationMs, 0);
  const averageDurationMs = totalAgents > 0 ? totalDuration / totalAgents : 0;

  return {
    totalAgents,
    successfulAgents,
    failedAgents,
    averageDurationMs: Math.round(averageDurationMs),
    fallbackCount,
  };
}

// ========================================
// Type Guards
// ========================================

/**
 * Type guard for agent_turn artifact payload.
 * Used to safely extract usedFallback from the artifact JSON.
 */
export function isAgentTurnPayload(payload: unknown): payload is { usedFallback?: boolean } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (!("usedFallback" in payload) ||
      typeof (payload as Record<string, unknown>).usedFallback === "boolean")
  );
}
