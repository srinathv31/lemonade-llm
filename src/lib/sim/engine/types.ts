import type {
  PromptContext,
  AgentDecision,
  EnvironmentSnapshot,
  TickSnapshot,
} from "../prompts";
import type {
  CustomerEngineOutput,
  CustomerEngineArtifactSection,
} from "../customers";

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
 *
 * Note: Some fields are optional to support regenerated artifacts where
 * original metadata was lost. Check `wasRegenerated` to identify these.
 */
export interface AgentTurnArtifactPayload {
  // Always present (even when redacted)
  version: 1;
  agentId: string;
  modelName: string;
  day: number;
  hour: number;

  // Timing (optional for regenerated artifacts)
  startedAt: string; // ISO timestamp
  finishedAt: string; // ISO timestamp
  durationMs?: number; // undefined if regenerated

  // Attempt tracking (optional for regenerated artifacts)
  attemptCount?: number; // undefined if regenerated
  usedFallback?: boolean; // undefined if regenerated

  // Decision outcome (always present)
  decision: {
    price: number;
    quality: number;
    marketing: number;
    // reasoning EXCLUDED from artifact - it's in agent_decisions table
  };

  // Parsing metadata (optional for regenerated artifacts)
  wasCoerced?: boolean; // undefined if regenerated
  reasoningTruncated?: boolean; // undefined if regenerated

  // Error info (if failed)
  error?: string;

  // Raw LLM I/O - ONLY when STORE_RAW_LLM_IO=true AND non-production
  rawPrompt?: string;
  rawResponse?: string;

  // Regeneration marker - true if artifact was regenerated after original insert failed
  wasRegenerated?: boolean;
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
  status: "start" | "success" | "error" | "retry" | "fallback" | "conflict_resolved" | "skipped_integrity" | "regenerating" | "regenerated";
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
  reason?: string;
}

// ========================================
// Timeline Types (Step 6)
// ========================================

/**
 * Simulation configuration stored in simulations.config JSONB.
 * Environment and tick snapshots can be overridden here.
 */
export interface SimulationConfig {
  modelName?: string;
  numDays?: number;
  environment?: Partial<EnvironmentSnapshot>;
  tickSnapshots?: Record<number, Partial<TickSnapshot>>;
}

/**
 * Status for simulation days.
 */
export type DayStatus = "pending" | "running" | "completed" | "failed";

/**
 * Status for simulation ticks.
 */
export type TickStatus = "pending" | "running" | "completed" | "partial" | "failed";

/**
 * Database row shape for simulation_days.
 */
export interface DayRecord {
  id: string;
  simulationId: string;
  day: number;
  seed: number | null;
  envSnapshot: EnvironmentSnapshot | null;
  status: DayStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/**
 * Database row shape for simulation_ticks.
 */
export interface TickRecord {
  id: string;
  simulationId: string;
  day: number;
  hour: number;
  tickSnapshot: TickSnapshot | null;
  status: TickStatus;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

/**
 * Parameters for ensuring a day record exists.
 */
export interface EnsureDayParams {
  simulationId: string;
  day: number;
  seed?: number;
  config?: SimulationConfig;
}

/**
 * Result from ensuring a day record.
 */
export interface EnsureDayResult {
  dayId: string;
  day: number;
  seed: number;
  envSnapshot: EnvironmentSnapshot;
  wasCreated: boolean;
}

/**
 * Parameters for ensuring a tick record exists.
 */
export interface EnsureTickParams {
  simulationId: string;
  dayId: string;
  day: number;
  hour: number;
  daySeed: number;
  config?: SimulationConfig;
}

/**
 * Result from ensuring a tick record.
 */
export interface EnsureTickResult {
  tickId: string;
  day: number;
  hour: number;
  tickSnapshot: TickSnapshot;
  wasCreated: boolean;
}

/**
 * Parameters for resolving environment snapshot.
 */
export interface ResolveEnvironmentParams {
  config?: SimulationConfig;
  seed: number;
}

/**
 * Parameters for resolving tick snapshot.
 */
export interface ResolveTickSnapshotParams {
  config?: SimulationConfig;
  daySeed: number;
  hour: number;
}

// ========================================
// Tick Runner Types (Step 7)
// ========================================

/**
 * Agent info needed to run a tick.
 */
export interface TickAgent {
  id: string;
  modelName: string;
  strategy?: Record<string, unknown>;
}

/**
 * Parameters for running a single tick.
 */
export interface RunTickParams {
  simulationId: string;
  day: number;
  hour: number;
  /** Optional: pre-fetched agents (if not provided, will be fetched) */
  agents?: TickAgent[];
  /** Optional: simulation config for environment/tick snapshot overrides */
  config?: SimulationConfig;
  /** Optional: run agents sequentially instead of in parallel (default: false) */
  sequential?: boolean;
}

/**
 * Individual agent result within a tick.
 */
export interface TickAgentOutcome {
  agentId: string;
  modelName: string;
  success: boolean;
  decisionId: string;
  artifactId: string;
  decision: AgentDecision;
  durationMs: number;
  usedFallback: boolean;
  /** True if agent was skipped due to existing decision (idempotent retry) */
  skipped?: boolean;
  error?: string;
}

/**
 * Summary statistics for a tick.
 */
export interface TickSummary {
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  averageDurationMs: number;
  fallbackCount: number;
}

/**
 * Result of running a tick.
 */
export interface RunTickResult {
  tickId: string;
  dayId: string;
  day: number;
  hour: number;
  status: "completed" | "partial" | "failed";
  agentOutcomes: TickAgentOutcome[];
  tickArtifactId: string;
  durationMs: number;
  summary: TickSummary;
  /** Customer engine results (Step 8) */
  customerOutcomes?: CustomerEngineOutput;
  error?: string;
}

/**
 * Artifact payload structure for tick kind.
 * This is what gets stored in simulation_artifacts.artifact JSONB.
 */
export interface TickArtifactPayload {
  version: 1;
  day: number;
  hour: number;

  // Timing
  startedAt: string; // ISO timestamp
  finishedAt: string; // ISO timestamp
  durationMs: number;

  // Summary metrics
  totalAgents: number;
  successfulAgents: number;
  failedAgents: number;
  fallbackCount: number;
  averageAgentDurationMs: number;

  // Per-agent outcomes (reference agent_turn artifacts for decision data)
  agentOutcomes: Array<{
    agentId: string;
    modelName: string;
    success: boolean;
    usedFallback: boolean;
    durationMs: number;
    artifactId: string; // Reference to canonical agent_turn artifact
    error?: string;
  }>;

  // Environment context for replay
  environment: EnvironmentSnapshot;
  tickSnapshot: TickSnapshot;

  // Customer engine results (Step 8)
  customerEngine?: CustomerEngineArtifactSection;
}

/**
 * Structured log entry for tick runner operations.
 * Per CLAUDE.md guidelines: log metadata, not raw prompts/responses.
 */
export interface TickRunnerLogEntry {
  timestamp: string;
  operation:
    | "runTick"
    | "fetchAgents"
    | "buildContext"
    | "runAgentTurn"
    | "persistArtifact"
    | "regenerateArtifact";
  status: "start" | "success" | "error" | "partial" | "skipped";
  simulationId: string;
  day: number;
  hour: number;
  tickId?: string;
  agentId?: string;
  agentCount?: number;
  duration?: number;
  error?: string;
  /** Reason for skipping (when status is "skipped") */
  reason?: string;
}
