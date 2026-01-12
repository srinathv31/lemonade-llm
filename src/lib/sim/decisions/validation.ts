import {
  agentDecisionSchema,
  rawLLMDecisionSchema,
  DECISION_CONSTRAINTS,
  type AgentDecision,
} from "./schema";
import type {
  DecisionResult,
  DecisionMetadata,
  FallbackContext,
  DecisionLogEntry,
} from "./types";

/**
 * Structured logging helper (per CLAUDE.md guidelines)
 * Only logs in development to avoid noise in production
 */
function logDecisionOperation(entry: DecisionLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

// ========================================
// Primary Parsing Function
// ========================================
/**
 * Parse and validate an LLM response into a typed AgentDecision.
 *
 * This function handles:
 * 1. Strict validation against agentDecisionSchema
 * 2. Coercion of out-of-range values to valid bounds
 * 3. Truncation of reasoning that exceeds limits
 * 4. Stripping of chain-of-thought patterns
 *
 * @param input - Raw LLM response (should be object from generateObject)
 * @param agentId - For logging context only
 * @returns DecisionResult with success status and metadata
 */
export function parseAgentDecision(
  input: unknown,
  agentId?: string
): DecisionResult {
  const startTime = Date.now();
  const metadata: DecisionMetadata = {
    parsedAt: new Date().toISOString(),
    schemaVersion: 1,
    wasCoerced: false,
    reasoningTruncated: false,
  };

  try {
    // Step 1: Attempt strict parse
    const strictResult = agentDecisionSchema.safeParse(input);

    if (strictResult.success) {
      // Clean reasoning even if valid
      const cleanedDecision = cleanReasoning(strictResult.data);
      if (cleanedDecision.reasoning !== strictResult.data.reasoning) {
        metadata.reasoningTruncated = true;
        metadata.originalReasoningLength = strictResult.data.reasoning.length;
      }

      logDecisionOperation({
        timestamp: metadata.parsedAt,
        operation: "parseDecision",
        status: "success",
        agentId,
        duration: Date.now() - startTime,
      });

      return { success: true, decision: cleanedDecision, metadata };
    }

    // Step 2: Attempt lenient parse + coercion
    const lenientResult = rawLLMDecisionSchema.safeParse(input);

    if (lenientResult.success) {
      const coerced = coerceToValidDecision(lenientResult.data);
      metadata.wasCoerced = true;

      logDecisionOperation({
        timestamp: metadata.parsedAt,
        operation: "parseDecision",
        status: "coerced",
        agentId,
        duration: Date.now() - startTime,
      });

      return { success: true, decision: coerced, metadata };
    }

    // Step 3: Complete failure
    const errorMessage = strictResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");

    logDecisionOperation({
      timestamp: metadata.parsedAt,
      operation: "parseDecision",
      status: "error",
      agentId,
      duration: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      rawInput: input,
      metadata,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    logDecisionOperation({
      timestamp: new Date().toISOString(),
      operation: "parseDecision",
      status: "error",
      agentId,
      duration: Date.now() - startTime,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
      rawInput: input,
      metadata,
    };
  }
}

// ========================================
// Coercion Helpers
// ========================================
/**
 * Coerce raw values to valid decision bounds.
 * Uses defaults for missing values, clamps out-of-range values.
 */
function coerceToValidDecision(raw: {
  price?: number;
  quality?: number;
  marketing?: number;
  reasoning?: string;
}): AgentDecision {
  const { price, quality, marketing } = DECISION_CONSTRAINTS;

  return {
    price: clamp(raw.price ?? price.default, price.min, price.max),
    quality: Math.round(
      clamp(raw.quality ?? quality.default, quality.min, quality.max)
    ),
    marketing: Math.round(
      clamp(raw.marketing ?? marketing.default, marketing.min, marketing.max)
    ),
    reasoning: cleanReasoningText(raw.reasoning ?? "No reasoning provided."),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ========================================
// Reasoning Cleanup
// ========================================
/**
 * Clean and truncate reasoning text in a decision.
 * Removes chain-of-thought patterns and enforces limits.
 */
function cleanReasoning(decision: AgentDecision): AgentDecision {
  return {
    ...decision,
    reasoning: cleanReasoningText(decision.reasoning),
  };
}

/**
 * Strip chain-of-thought patterns and enforce character limits.
 *
 * CoT patterns we strip:
 * - "Let me think..." / "I need to consider..."
 * - "Step 1:", "First,", "Second," etc.
 * - Long analytical passages
 */
function cleanReasoningText(text: string): string {
  const { maxChars } = DECISION_CONSTRAINTS.reasoning;

  // Remove common CoT patterns
  const cotPatterns = [
    /^(let me think|i need to consider|thinking about|analyzing|let's see)[^.]*\.\s*/gi,
    /^(step \d+[:.]\s*)/gi,
    /^(first(ly)?|second(ly)?|third(ly)?|finally)[,:\s]+/gi,
    /^(however|therefore|thus|hence)[,:\s]+/gi,
  ];

  let cleaned = text.trim();
  for (const pattern of cotPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Truncate to character limit
  if (cleaned.length > maxChars) {
    // Try to truncate at sentence boundary
    const truncated = cleaned.slice(0, maxChars);
    const lastPeriod = truncated.lastIndexOf(".");

    if (lastPeriod > maxChars * 0.5) {
      return truncated.slice(0, lastPeriod + 1);
    }
    const ellipsis = "...";
    if (maxChars <= ellipsis.length) {
      return truncated.trim();
    }
    const maxEllipsisChars = maxChars - ellipsis.length;
    return cleaned.slice(0, maxEllipsisChars).trim() + ellipsis;
  }

  return cleaned;
}

// ========================================
// Fallback Decision
// ========================================
/**
 * Generate a safe fallback decision when LLM fails completely.
 * Uses previous decision if available, otherwise uses conservative defaults.
 */
export function createFallbackDecision(context: FallbackContext): AgentDecision {
  if (context.previousDecision) {
    return {
      ...context.previousDecision,
      reasoning: "Repeated previous decision due to processing error.",
    };
  }

  return {
    price: DECISION_CONSTRAINTS.price.default,
    quality: DECISION_CONSTRAINTS.quality.default,
    marketing: DECISION_CONSTRAINTS.marketing.default,
    reasoning: "Using default values due to initial processing error.",
  };
}

// ========================================
// Validation-Only Function
// ========================================
/**
 * Validate a decision without coercion.
 * Returns detailed Zod error if invalid.
 */
export function validateDecision(
  decision: unknown
): ReturnType<typeof agentDecisionSchema.safeParse> {
  return agentDecisionSchema.safeParse(decision);
}

/**
 * Type guard for AgentDecision
 */
export function isValidDecision(value: unknown): value is AgentDecision {
  return agentDecisionSchema.safeParse(value).success;
}
