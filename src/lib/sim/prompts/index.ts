// Core builder function
export { buildDecisionPrompt } from "./builder";

// Types
export type {
  PromptContext,
  BuiltPrompt,
  EnvironmentSnapshot,
  TickSnapshot,
  HistoricalDecision,
  CompetitorDecision,
  MarketOutcome,
  PromptContextSummary,
  AgentDecision,
} from "./types";

// Context helpers (for consumers who need to build PromptContext)
export {
  MAX_HISTORY_ENTRIES,
  formatHour,
  createContextSummary,
  normalizeContext,
} from "./context";

// Templates (for testing/debugging only)
export {
  JSON_SYSTEM_INSTRUCTION,
  OUTPUT_SCHEMA_DESCRIPTION,
} from "./templates";
