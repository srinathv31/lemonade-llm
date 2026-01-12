import type { PromptContext, BuiltPrompt } from "./types";
import { computePromptHash, CURRENT_SCHEMA_HASH } from "../decisions";
import {
  JSON_SYSTEM_INSTRUCTION,
  OUTPUT_SCHEMA_DESCRIPTION,
  ROLE_DESCRIPTION,
  FACTORS_TO_CONSIDER,
  FINAL_INSTRUCTION,
} from "./templates";
import {
  normalizeContext,
  formatHour,
  formatEnvironment,
  formatOwnHistory,
  formatCompetitorDecisions,
  formatPreviousMarketOutcome,
  createContextSummary,
} from "./context";

/**
 * Build a deterministic decision prompt for an agent.
 *
 * IMPORTANT: This function produces a deterministic prompt string
 * given the same input context. The prompt hash can be used for
 * provenance tracking without storing the raw prompt.
 *
 * @param context - Complete context for the agent's decision
 * @returns BuiltPrompt with the prompt string and its hash
 */
export function buildDecisionPrompt(context: PromptContext): BuiltPrompt {
  // Normalize context for deterministic output
  const normalized = normalizeContext(context);

  // Build prompt sections in deterministic order
  const sections: string[] = [
    // Section 1: System instruction
    JSON_SYSTEM_INSTRUCTION,

    // Section 2: Role
    ROLE_DESCRIPTION,

    // Section 3: Current situation
    buildCurrentSituationSection(normalized),

    // Section 4: Environment
    buildEnvironmentSection(normalized),

    // Section 5: Your history
    buildHistorySection(normalized),

    // Section 6: Competitors
    buildCompetitorsSection(normalized),

    // Section 7: Previous market outcome
    buildMarketOutcomeSection(normalized),

    // Section 8: Decision factors
    FACTORS_TO_CONSIDER,

    // Section 9: Expected output format
    buildOutputFormatSection(),

    // Section 10: Final instruction
    FINAL_INSTRUCTION,
  ];

  // Join with double newlines for readability (deterministic)
  const prompt = sections.join("\n\n");

  // Compute hash for provenance
  const promptHash = computePromptHash(prompt);

  return {
    prompt,
    promptHash,
    schemaHash: CURRENT_SCHEMA_HASH,
    contextSummary: createContextSummary(normalized),
  };
}

/**
 * Build the current situation section.
 */
function buildCurrentSituationSection(context: PromptContext): string {
  const lines = [
    "=== CURRENT SITUATION ===",
    `Day: ${context.day}`,
    `Time: ${formatHour(context.hour)}`,
  ];

  if (context.tickSnapshot?.event) {
    lines.push(`Current event: ${context.tickSnapshot.event}`);
  }

  return lines.join("\n");
}

/**
 * Build the environment section.
 */
function buildEnvironmentSection(context: PromptContext): string {
  return `=== TODAY'S CONDITIONS ===\n${formatEnvironment(context.environment)}`;
}

/**
 * Build the history section.
 */
function buildHistorySection(context: PromptContext): string {
  return `=== YOUR RECENT PERFORMANCE ===\n${formatOwnHistory(context.ownHistory)}`;
}

/**
 * Build the competitors section.
 */
function buildCompetitorsSection(context: PromptContext): string {
  return `=== COMPETITOR DECISIONS THIS HOUR ===\n${formatCompetitorDecisions(context.competitorDecisions)}`;
}

/**
 * Build the market outcome section.
 */
function buildMarketOutcomeSection(context: PromptContext): string {
  return `=== PREVIOUS HOUR MARKET RESULTS ===\n${formatPreviousMarketOutcome(context.previousMarketOutcome)}`;
}

/**
 * Build the output format section.
 */
function buildOutputFormatSection(): string {
  return `=== REQUIRED OUTPUT FORMAT ===
Respond with a JSON object in this exact format:
${OUTPUT_SCHEMA_DESCRIPTION}`;
}
