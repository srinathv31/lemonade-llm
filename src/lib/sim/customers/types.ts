import type { EnvironmentSnapshot, TickSnapshot, AgentDecision } from "../prompts";

/**
 * Weather modifier values for demand and quality calculations
 */
export interface WeatherModifier {
  /** Multiplier for base demand */
  demandMultiplier: number;
  /** Multiplier for quality importance in scoring */
  qualityImportance: number;
}

/**
 * Breakdown of all factors used in demand calculation
 * Stored in customer_events.demand_factors for auditability
 */
export interface DemandFactors {
  // Input values
  baseDemand: number;
  demandMultiplier: number;
  weather: string;
  specialEvent?: string;

  // Agent decision inputs
  price: number;
  quality: number;
  marketing: number;

  // Calculated scores
  priceScore: number;
  qualityScore: number;
  marketingScore: number;
  totalAgentScore: number;

  // Market context
  totalMarketScore: number;
  marketShare: number;

  // Modifiers applied
  weatherDemandModifier: number;
  weatherQualityImportance: number;
  eventModifier: number;

  // Final calculation
  totalAvailableCustomers: number;
  customersAllocated: number;
}

/**
 * Per-agent customer outcome
 */
export interface AgentCustomerOutcome {
  agentId: string;
  customersServed: number;
  salesVolume: number;
  revenue: number;
  marketShare: number;
  demandFactors: DemandFactors;
  /** ID of the inserted customer_events record */
  customerEventId: string;
}

/**
 * Input for running the customer engine
 */
export interface CustomerEngineInput {
  simulationId: string;
  tickId: string;
  dayId: string;
  day: number;
  hour: number;
  envSnapshot: EnvironmentSnapshot;
  tickSnapshot: TickSnapshot;
  agentDecisions: Array<{
    agentId: string;
    decision: AgentDecision;
  }>;
  /** RNG seed for deterministic rounding/tie-breaking */
  seed: number;
}

/**
 * Output from customer engine
 */
export interface CustomerEngineOutput {
  totalDemand: number;
  agentOutcomes: AgentCustomerOutcome[];
  durationMs: number;
}

/**
 * Result of running the customer engine (success or failure)
 */
export type CustomerEngineResult =
  | CustomerEngineSuccess
  | CustomerEngineFailure;

export interface CustomerEngineSuccess {
  success: true;
  output: CustomerEngineOutput;
}

export interface CustomerEngineFailure {
  success: false;
  output: CustomerEngineOutput;
  error: string;
}

/**
 * Customer engine section for tick artifact
 */
export interface CustomerEngineArtifactSection {
  version: 1;
  totalDemand: number;
  weatherModifier: number;
  eventModifier: number;
  agentOutcomes: Array<{
    agentId: string;
    customersServed: number;
    salesVolume: number;
    revenue: number;
    marketShare: number;
  }>;
}
