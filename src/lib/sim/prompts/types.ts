import type { AgentDecision } from "../decisions";

/**
 * Environment snapshot from simulation_days.env_snapshot
 */
export interface EnvironmentSnapshot {
  weather: "sunny" | "cloudy" | "rainy" | "hot" | "cold";
  temperature: number; // Fahrenheit
  baseDemand: number; // Base customer count (e.g., 50-200)
  specialEvent?: string; // Optional: "parade", "festival", etc.
}

/**
 * Tick snapshot from simulation_ticks.tick_snapshot
 */
export interface TickSnapshot {
  event?: string; // "rush_hour", "slow_period", etc.
  demandMultiplier?: number; // 0.5 - 2.0
}

/**
 * Historical decision record for agent's own history
 */
export interface HistoricalDecision {
  day: number;
  hour: number;
  price: number;
  quality: number;
  marketing: number;
  revenue?: number; // From customer_events (if available)
  customersServed?: number; // From customer_events (if available)
}

/**
 * Competitor's visible decision (current tick only)
 */
export interface CompetitorDecision {
  agentId: string;
  modelName: string;
  price: number;
  quality: number;
  marketing: number;
}

/**
 * Market outcome summary from previous tick
 */
export interface MarketOutcome {
  day: number;
  hour: number;
  totalCustomers: number; // Sum across all agents
  averagePrice: number; // Market average price
  ownRevenue?: number; // This agent's revenue
  ownCustomersServed?: number; // This agent's customers
}

/**
 * Complete context for building an agent decision prompt
 */
export interface PromptContext {
  // Simulation identity
  simulationId: string;
  agentId: string;
  modelName: string;

  // Current time
  day: number;
  hour: number; // 9-16 (9am-5pm)

  // Environment
  environment: EnvironmentSnapshot;
  tickSnapshot?: TickSnapshot;

  // Agent's own history (most recent first, up to N entries)
  ownHistory: HistoricalDecision[];

  // Competitors' decisions for THIS tick (may be empty if agent goes first)
  competitorDecisions: CompetitorDecision[];

  // Market outcomes from PREVIOUS tick (may be empty for first tick)
  previousMarketOutcome?: MarketOutcome;

  // Agent strategy hints (optional, from agents.strategy JSONB)
  strategyHints?: Record<string, unknown>;
}

/**
 * Result of building a prompt: the prompt string and its hash
 */
export interface BuiltPrompt {
  prompt: string;
  promptHash: string;
  schemaHash: string;
  contextSummary: PromptContextSummary;
}

/**
 * Non-sensitive summary of prompt context for logging
 */
export interface PromptContextSummary {
  day: number;
  hour: number;
  weather: string;
  historyLength: number;
  competitorCount: number;
  hasPreviousMarketOutcome: boolean;
}

// Re-export AgentDecision for convenience
export type { AgentDecision };
