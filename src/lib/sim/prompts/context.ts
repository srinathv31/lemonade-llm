import type {
  PromptContext,
  HistoricalDecision,
  CompetitorDecision,
  MarketOutcome,
  EnvironmentSnapshot,
  PromptContextSummary,
} from "./types";

/**
 * Maximum number of historical decisions to include in prompt.
 * Balances context richness vs. prompt length.
 */
export const MAX_HISTORY_ENTRIES = 8;

/**
 * Hour labels for human-readable time display.
 */
const HOUR_LABELS: Record<number, string> = {
  9: "9:00 AM",
  10: "10:00 AM",
  11: "11:00 AM",
  12: "12:00 PM (noon)",
  13: "1:00 PM",
  14: "2:00 PM",
  15: "3:00 PM",
  16: "4:00 PM",
};

/**
 * Format hour number to human-readable string.
 */
export function formatHour(hour: number): string {
  return HOUR_LABELS[hour] ?? `${hour}:00`;
}

/**
 * Format environment snapshot to prompt-friendly string.
 */
export function formatEnvironment(env: EnvironmentSnapshot): string {
  const parts: string[] = [
    `Weather: ${env.weather}`,
    `Temperature: ${env.temperature}°F`,
    `Expected base customer traffic: ${env.baseDemand} customers/hour`,
  ];

  if (env.specialEvent) {
    parts.push(`Special event today: ${env.specialEvent}`);
  }

  return parts.join("\n");
}

/**
 * Format historical decisions to prompt-friendly string.
 * Sorted by recency (most recent first).
 */
export function formatOwnHistory(history: HistoricalDecision[]): string {
  if (history.length === 0) {
    return "No previous decisions yet (this is your first hour).";
  }

  const lines = history.map((h) => {
    const base = `Day ${h.day}, ${formatHour(h.hour)}: price=$${h.price.toFixed(2)}, quality=${h.quality}, marketing=${h.marketing}`;

    if (h.revenue !== undefined && h.customersServed !== undefined) {
      return `${base} -> ${h.customersServed} customers, $${h.revenue.toFixed(2)} revenue`;
    }

    return base;
  });

  return lines.join("\n");
}

/**
 * Format competitor decisions for current tick.
 */
export function formatCompetitorDecisions(
  competitors: CompetitorDecision[]
): string {
  if (competitors.length === 0) {
    return "No competitor information available yet for this hour.";
  }

  const lines = competitors.map(
    (c) =>
      `- ${c.modelName}: price=$${c.price.toFixed(2)}, quality=${c.quality}, marketing=${c.marketing}`
  );

  return lines.join("\n");
}

/**
 * Format previous market outcome.
 */
export function formatPreviousMarketOutcome(
  outcome: MarketOutcome | undefined
): string {
  if (!outcome) {
    return "No previous market data available (this is the first hour).";
  }

  const lines: string[] = [
    `Previous hour (Day ${outcome.day}, ${formatHour(outcome.hour)}):`,
    `- Total market customers: ${outcome.totalCustomers}`,
    `- Average market price: $${outcome.averagePrice.toFixed(2)}`,
  ];

  if (
    outcome.ownRevenue !== undefined &&
    outcome.ownCustomersServed !== undefined
  ) {
    lines.push(`- Your customers: ${outcome.ownCustomersServed}`);
    lines.push(`- Your revenue: $${outcome.ownRevenue.toFixed(2)}`);
  }

  return lines.join("\n");
}

/**
 * Create a non-sensitive summary of the prompt context for logging.
 */
export function createContextSummary(
  context: PromptContext
): PromptContextSummary {
  return {
    day: context.day,
    hour: context.hour,
    weather: context.environment.weather,
    historyLength: context.ownHistory.length,
    competitorCount: context.competitorDecisions.length,
    hasPreviousMarketOutcome: context.previousMarketOutcome !== undefined,
  };
}

/**
 * Normalize context for deterministic prompt building.
 * - Sorts arrays by consistent keys
 * - Limits history length
 * - Ensures consistent field ordering
 */
export function normalizeContext(context: PromptContext): PromptContext {
  return {
    ...context,
    // Sort history by (day DESC, hour DESC) for consistent ordering
    ownHistory: [...context.ownHistory]
      .sort((a, b) => {
        if (a.day !== b.day) return b.day - a.day;
        return b.hour - a.hour;
      })
      .slice(0, MAX_HISTORY_ENTRIES),
    // Sort competitors by agentId for deterministic ordering (locale-independent)
    competitorDecisions: [...context.competitorDecisions].sort((a, b) =>
      a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0
    ),
  };
}
