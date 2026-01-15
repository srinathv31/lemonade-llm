// Customer Engine - Step 8
// Deterministic demand calculation and customer distribution

export { runCustomerEngine, buildCustomerEngineArtifactSection } from "./engine";

export type {
  CustomerEngineInput,
  CustomerEngineOutput,
  CustomerEngineResult,
  CustomerEngineSuccess,
  CustomerEngineFailure,
  AgentCustomerOutcome,
  DemandFactors,
  WeatherModifier,
  CustomerEngineArtifactSection,
} from "./types";

// Re-export modifiers for testing/debugging
export { getWeatherModifier, getSpecialEventModifier } from "./modifiers";

// Re-export demand functions for testing/debugging
export {
  calculatePriceScore,
  calculateQualityScore,
  calculateMarketingScore,
  calculateAgentScore,
  calculateTotalDemand,
  distributeCustomers,
  buildDemandFactors,
} from "./demand";
