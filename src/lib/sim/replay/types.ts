import type {
  DayStatus,
  TickStatus,
  AgentDailySummary,
  DayArtifactPayload,
  TickArtifactPayload,
} from "../engine/types";
import type { EnvironmentSnapshot, TickSnapshot } from "../prompts";
import type { DemandFactors } from "../customers";

// ========================================
// Day Replay (Overview)
// ========================================

/**
 * Day replay response - overview with tick summaries.
 * Loaded by dayId, provides navigation to individual ticks.
 */
export interface DayReplayResponse {
  simulationId: string;
  dayId: string;
  day: number;
  seed: number;
  status: DayStatus;
  environment: EnvironmentSnapshot;
  startedAt: string | null;
  finishedAt: string | null;
  artifact: DayArtifactPayload | null;
  ticks: Array<TickSummaryEntry>;
  agentSummaries: AgentDailySummary[];
}

/**
 * Tick summary within day (for navigation).
 * Extracted from day artifact's tickSummaries.
 */
export interface TickSummaryEntry {
  hour: number;
  tickId: string;
  tickArtifactId: string;
  status: "completed" | "partial" | "failed";
  durationMs: number;
  agentCount: number;
  successfulAgents: number;
  totalCustomers: number;
  totalRevenue: number;
}

// ========================================
// Tick Replay (Full Details)
// ========================================

/**
 * Tick replay response - full agent decisions + customer outcomes.
 * Loaded by tickId for detailed drill-down.
 */
export interface TickReplayResponse {
  simulationId: string;
  dayId: string;
  tickId: string;
  day: number;
  hour: number;
  status: TickStatus;
  tickSnapshot: TickSnapshot | null;
  environment: EnvironmentSnapshot | null;
  startedAt: string | null;
  finishedAt: string | null;
  artifact: TickArtifactPayload | null;
  agentTurns: Array<AgentTurnEntry>;
}

/**
 * Per-agent turn data within a tick.
 * Combines decision, outcome, and metadata.
 */
export interface AgentTurnEntry {
  agentId: string;
  modelName: string;
  decision: {
    price: number;
    quality: number;
    marketing: number;
    reasoning: string | null;
  };
  outcome: {
    customersServed: number;
    salesVolume: number;
    revenue: number;
    marketShare: number;
    demandFactors: DemandFactors | null;
  } | null;
  metadata: {
    artifactId: string | null;
    durationMs: number | null;
    usedFallback: boolean;
    error: string | null;
  };
}
