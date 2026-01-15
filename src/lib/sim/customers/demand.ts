import type {
  EnvironmentSnapshot,
  TickSnapshot,
  AgentDecision,
} from "../prompts";
import type { DemandFactors, WeatherModifier } from "./types";
import { getWeatherModifier, getSpecialEventModifier } from "./modifiers";

// ========================================
// Deterministic RNG (Mulberry32)
// ========================================

/**
 * Mulberry32 PRNG - fast, deterministic, produces [0,1)
 * Same implementation as timeline.ts for consistency
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ========================================
// Scoring Functions
// ========================================

/**
 * Calculate price score (inverse - lower price is better)
 * Formula: max(0.1, 2.0 / price)
 * Range: ~0.2 (at $10) to 4.0 (at $0.50)
 */
export function calculatePriceScore(price: number): number {
  return Math.max(0.1, 2.0 / price);
}

/**
 * Calculate quality score (linear scaling)
 * Formula: 0.5 + (quality - 1) * (1.0 / 9) * qualityImportance
 * Base range: 0.5 (quality 1) to 1.5 (quality 10)
 * Modified by weather's quality importance factor
 */
export function calculateQualityScore(
  quality: number,
  qualityImportance: number
): number {
  const baseScore = 0.5 + ((quality - 1) * 1.0) / 9;
  // Apply quality importance: values > 1 amplify quality differences
  return 0.5 + (baseScore - 0.5) * qualityImportance;
}

/**
 * Calculate marketing score (diminishing returns via sqrt)
 * Formula: 0.5 + 0.5 * sqrt(marketing / 100)
 * Range: 0.5 (marketing 0) to 1.0 (marketing 100)
 */
export function calculateMarketingScore(marketing: number): number {
  return 0.5 + 0.5 * Math.sqrt(marketing / 100);
}

/**
 * Calculate total agent score (multiplicative)
 * Formula: PriceScore × QualityScore × MarketingScore
 */
export function calculateAgentScore(
  decision: AgentDecision,
  weatherMod: WeatherModifier
): {
  score: number;
  priceScore: number;
  qualityScore: number;
  marketingScore: number;
} {
  const priceScore = calculatePriceScore(decision.price);
  const qualityScore = calculateQualityScore(
    decision.quality,
    weatherMod.qualityImportance
  );
  const marketingScore = calculateMarketingScore(decision.marketing);

  return {
    score: priceScore * qualityScore * marketingScore,
    priceScore,
    qualityScore,
    marketingScore,
  };
}

// ========================================
// Demand Calculation
// ========================================

/**
 * Calculate total market demand for a tick
 * Formula: BaseDemand × TickMultiplier × WeatherMod × EventMod
 */
export function calculateTotalDemand(
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot
): { totalDemand: number; weatherDemandMod: number; eventMod: number } {
  const weatherMod = getWeatherModifier(envSnapshot.weather);
  const eventMod = getSpecialEventModifier(envSnapshot.specialEvent);
  const tickMultiplier = tickSnapshot.demandMultiplier ?? 1.0;

  const totalDemand = Math.round(
    envSnapshot.baseDemand *
      tickMultiplier *
      weatherMod.demandMultiplier *
      eventMod
  );

  return {
    totalDemand,
    weatherDemandMod: weatherMod.demandMultiplier,
    eventMod,
  };
}

// ========================================
// Customer Distribution
// ========================================

interface AgentAllocation {
  agentId: string;
  decision: AgentDecision;
  score: number;
  priceScore: number;
  qualityScore: number;
  marketingScore: number;
  marketShare: number;
  customers: number;
}

/**
 * Distribute customers among agents proportionally based on scores
 * Uses seeded RNG for deterministic tie-breaking in rounding
 */
export function distributeCustomers(
  agents: Array<{ agentId: string; decision: AgentDecision }>,
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot,
  seed: number
): {
  allocations: AgentAllocation[];
  totalDemand: number;
  totalMarketScore: number;
  weatherMod: WeatherModifier;
  eventMod: number;
} {
  // Handle edge case: no agents
  if (agents.length === 0) {
    return {
      allocations: [],
      totalDemand: 0,
      totalMarketScore: 0,
      weatherMod: getWeatherModifier(envSnapshot.weather),
      eventMod: getSpecialEventModifier(envSnapshot.specialEvent),
    };
  }

  const weatherMod = getWeatherModifier(envSnapshot.weather);
  const { totalDemand, eventMod } = calculateTotalDemand(
    envSnapshot,
    tickSnapshot
  );

  // Calculate scores for each agent
  const agentsWithScores = agents.map((a) => {
    const scoreResult = calculateAgentScore(a.decision, weatherMod);
    return {
      agentId: a.agentId,
      decision: a.decision,
      ...scoreResult,
    };
  });

  const totalMarketScore = agentsWithScores.reduce(
    (sum, a) => sum + a.score,
    0
  );

  // Handle edge case: all agents have 0 score (distribute equally)
  if (totalMarketScore === 0) {
    const equalShare = 1 / agents.length;
    const equalCustomers = Math.floor(totalDemand / agents.length);
    const remainder = totalDemand - equalCustomers * agents.length;

    const rng = mulberry32(seed);
    const allocations: AgentAllocation[] = agentsWithScores.map((a, i) => ({
      ...a,
      marketShare: equalShare,
      // Give extra customers to first N agents (deterministic)
      customers: equalCustomers + (i < remainder ? 1 : 0),
    }));

    // Shuffle to distribute remainder fairly using seeded RNG
    allocations.sort(() => rng() - 0.5);

    return {
      allocations,
      totalDemand,
      totalMarketScore: 0,
      weatherMod,
      eventMod,
    };
  }

  // Calculate market share and initial customer allocation
  const allocationsWithRemainders = agentsWithScores.map((a) => {
    const marketShare = a.score / totalMarketScore;
    const exactCustomers = totalDemand * marketShare;
    const baseCustomers = Math.floor(exactCustomers);
    const remainder = exactCustomers - baseCustomers;

    return {
      ...a,
      marketShare,
      customers: baseCustomers,
      remainder,
    };
  });

  // Distribute remaining customers using largest remainder method
  // with seeded RNG for tie-breaking
  const distributed = allocationsWithRemainders.reduce(
    (sum, a) => sum + a.customers,
    0
  );
  const remaining = totalDemand - distributed;

  if (remaining > 0) {
    const rng = mulberry32(seed);

    // Sort by remainder descending, with seeded tie-breaker
    const sorted = [...allocationsWithRemainders].sort((a, b) => {
      const diff = b.remainder - a.remainder;
      if (Math.abs(diff) < 0.0001) {
        return rng() - 0.5; // Seeded tie-breaker
      }
      return diff;
    });

    // Give extra customer to top N agents
    for (let i = 0; i < remaining; i++) {
      sorted[i].customers += 1;
    }
  }

  // Remove remainder field from final output
  const allocations: AgentAllocation[] = allocationsWithRemainders.map(
    ({ remainder: _, ...rest }) => rest
  );

  return { allocations, totalDemand, totalMarketScore, weatherMod, eventMod };
}

/**
 * Build demand factors breakdown for a single agent
 */
export function buildDemandFactors(
  allocation: AgentAllocation,
  envSnapshot: EnvironmentSnapshot,
  tickSnapshot: TickSnapshot,
  totalDemand: number,
  totalMarketScore: number,
  weatherMod: WeatherModifier,
  eventMod: number
): DemandFactors {
  return {
    // Input values
    baseDemand: envSnapshot.baseDemand,
    demandMultiplier: tickSnapshot.demandMultiplier ?? 1.0,
    weather: envSnapshot.weather,
    specialEvent: envSnapshot.specialEvent,

    // Agent decision inputs
    price: allocation.decision.price,
    quality: allocation.decision.quality,
    marketing: allocation.decision.marketing,

    // Calculated scores
    priceScore: roundToDecimals(allocation.priceScore, 4),
    qualityScore: roundToDecimals(allocation.qualityScore, 4),
    marketingScore: roundToDecimals(allocation.marketingScore, 4),
    totalAgentScore: roundToDecimals(allocation.score, 4),

    // Market context
    totalMarketScore: roundToDecimals(totalMarketScore, 4),
    marketShare: roundToDecimals(allocation.marketShare, 4),

    // Modifiers applied
    weatherDemandModifier: weatherMod.demandMultiplier,
    weatherQualityImportance: weatherMod.qualityImportance,
    eventModifier: eventMod,

    // Final calculation
    totalAvailableCustomers: totalDemand,
    customersAllocated: allocation.customers,
  };
}

/**
 * Round a number to specified decimal places
 */
function roundToDecimals(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}
