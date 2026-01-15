import { generateText } from "ai-sdk-ollama";
import { eq, and } from "drizzle-orm";
import { ollama } from "../../ollama";
import db from "../../db/drizzle";
import { agent_decisions, simulation_artifacts } from "../../db/drizzle/schema";
import { buildDecisionPrompt, type BuiltPrompt } from "../prompts";
import {
  parseAgentDecision,
  createFallbackDecision,
  type AgentDecision,
} from "../decisions";
import type {
  AgentTurnParams,
  AgentTurnResult,
  AgentTurnMetadata,
  LLMAttemptResult,
  AgentTurnArtifactPayload,
  AgentTurnLogEntry,
} from "./types";

// ========================================
// Configuration
// ========================================

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries

/**
 * Calculate retry delay with exponential backoff.
 * Attempt 1 -> no delay (initial)
 * Attempt 2 -> 500ms delay
 * Attempt 3 -> 1000ms delay
 */
function getRetryDelay(attemptNumber: number): number {
  return Math.pow(2, attemptNumber - 1) * 500;
}

/**
 * Promise-based delay helper.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========================================
// Logging (CLAUDE.md Compliant)
// ========================================

/**
 * Structured logging helper (per CLAUDE.md guidelines).
 * Only logs in development to avoid noise in production.
 * NEVER logs raw prompts or responses.
 */
function logAgentTurnOperation(entry: AgentTurnLogEntry): void {
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(entry));
  }
}

// ========================================
// Main Function
// ========================================

/**
 * Run a single agent for one tick.
 *
 * This function:
 * 1. Builds the decision prompt
 * 2. Calls the LLM with up to 2 retries
 * 3. Validates and parses the response
 * 4. Falls back to previous/default decision if all attempts fail
 * 5. Persists the decision to agent_decisions table
 * 6. Writes an agent_turn artifact (redacted by default)
 *
 * IMPORTANT: This function NEVER throws. All errors are captured in the result.
 */
export async function runAgentTurn(
  params: AgentTurnParams
): Promise<AgentTurnResult> {
  const startTime = Date.now();
  const {
    simulationId,
    agentId,
    tickId,
    day,
    hour,
    modelName,
    promptContext,
    previousDecision,
  } = params;

  logAgentTurnOperation({
    timestamp: new Date().toISOString(),
    operation: "runAgentTurn",
    status: "start",
    simulationId,
    agentId,
    tickId,
    day,
    hour,
    model: modelName,
  });

  // Step 1: Build prompt
  const builtPrompt = buildDecisionPrompt(promptContext);

  // Step 2: Attempt LLM call with retries
  let lastError: string | undefined;
  let attemptCount = 0;
  let decision: AgentDecision | undefined;
  let wasCoerced = false;
  let reasoningTruncated = false;
  let rawResponse: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptCount = attempt;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "llmAttempt",
      status: attempt === 1 ? "start" : "retry",
      simulationId,
      agentId,
      tickId,
      day,
      hour,
      model: modelName,
      attemptNumber: attempt,
      promptHash: builtPrompt.promptHash,
    });

    const attemptResult = await attemptLLMCall(
      modelName,
      builtPrompt.prompt,
      agentId
    );

    if (attemptResult.success && attemptResult.decision) {
      decision = attemptResult.decision;
      wasCoerced = attemptResult.wasCoerced;
      reasoningTruncated = attemptResult.reasoningTruncated;
      rawResponse = attemptResult.rawResponse;

      logAgentTurnOperation({
        timestamp: new Date().toISOString(),
        operation: "llmAttempt",
        status: "success",
        simulationId,
        agentId,
        tickId,
        day,
        hour,
        model: modelName,
        attemptNumber: attempt,
        promptHash: builtPrompt.promptHash,
      });

      break;
    }

    lastError = attemptResult.error;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "llmAttempt",
      status: "error",
      simulationId,
      agentId,
      tickId,
      day,
      hour,
      model: modelName,
      attemptNumber: attempt,
      promptHash: builtPrompt.promptHash,
      error: lastError,
    });

    // Don't delay after last attempt
    if (attempt < MAX_ATTEMPTS) {
      await delay(getRetryDelay(attempt));
    }
  }

  // Step 3: Use fallback if all attempts failed
  const usedFallback = !decision;
  if (!decision) {
    decision = createFallbackDecision({ agentId, previousDecision });

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "runAgentTurn",
      status: "fallback",
      simulationId,
      agentId,
      tickId,
      day,
      hour,
      model: modelName,
      promptHash: builtPrompt.promptHash,
      error: lastError,
    });
  }

  const durationMs = Date.now() - startTime;

  // Step 4: Build metadata
  const metadata: AgentTurnMetadata = {
    modelName,
    promptHash: builtPrompt.promptHash,
    schemaHash: builtPrompt.schemaHash,
    durationMs,
    attemptCount,
    usedFallback,
    wasCoerced,
    reasoningTruncated,
  };

  // Step 5: Persist decision and artifact
  const { decisionId, artifactId } = await persistTurnData({
    params,
    decision,
    metadata,
    builtPrompt,
    rawResponse,
    error: usedFallback ? lastError : undefined,
  });

  logAgentTurnOperation({
    timestamp: new Date().toISOString(),
    operation: "runAgentTurn",
    status: usedFallback ? "error" : "success",
    simulationId,
    agentId,
    tickId,
    day,
    hour,
    model: modelName,
    duration: durationMs,
    promptHash: builtPrompt.promptHash,
    error: usedFallback ? lastError : undefined,
  });

  // Step 6: Return result
  if (usedFallback) {
    return {
      success: false,
      decision,
      decisionId,
      artifactId,
      error: lastError ?? "All LLM attempts failed",
      metadata,
    };
  }

  return {
    success: true,
    decision,
    decisionId,
    artifactId,
    metadata,
  };
}

// ========================================
// LLM Call
// ========================================

/**
 * Attempt a single LLM call with validation.
 * Returns structured result - never throws.
 */
async function attemptLLMCall(
  modelName: string,
  prompt: string,
  agentId: string
): Promise<LLMAttemptResult> {
  try {
    // Use structuredOutputs: true to enable Ollama's native JSON mode
    const result = await generateText({
      model: ollama(modelName, { structuredOutputs: true }),
      prompt,
    });

    // The LLM returns JSON as text when structuredOutputs is enabled
    // Parse and validate through parseAgentDecision
    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(result.text);
    } catch {
      return {
        success: false,
        error: `Failed to parse LLM response as JSON: ${result.text.slice(0, 100)}...`,
        wasCoerced: false,
        reasoningTruncated: false,
      };
    }

    const parseResult = parseAgentDecision(rawResponse, agentId);

    if (parseResult.success) {
      return {
        success: true,
        decision: parseResult.decision,
        rawResponse,
        wasCoerced: parseResult.metadata.wasCoerced,
        reasoningTruncated: parseResult.metadata.reasoningTruncated,
      };
    }

    return {
      success: false,
      error: parseResult.error,
      rawResponse,
      wasCoerced: false,
      reasoningTruncated: false,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown LLM error";
    return {
      success: false,
      error: errorMessage,
      wasCoerced: false,
      reasoningTruncated: false,
    };
  }
}

// ========================================
// Persistence
// ========================================

interface PersistTurnDataParams {
  params: AgentTurnParams;
  decision: AgentDecision;
  metadata: AgentTurnMetadata;
  builtPrompt: BuiltPrompt;
  rawResponse?: unknown;
  error?: string;
}

interface PersistTurnDataResult {
  decisionId: string;
  artifactId: string;
}

/**
 * Persist decision and artifact to database.
 *
 * Note: Neon HTTP driver doesn't support transactions.
 * Inserts are performed sequentially. If artifact insert fails,
 * the decision will still be persisted (acceptable for debugging).
 *
 * Order:
 * 1. INSERT agent_decisions (normalized business state)
 * 2. INSERT simulation_artifacts (immutable audit log)
 */
async function persistTurnData(
  data: PersistTurnDataParams
): Promise<PersistTurnDataResult> {
  const { params, decision, metadata, builtPrompt, rawResponse, error } = data;

  const { payload, isRedacted } = buildArtifactPayload(
    params,
    decision,
    metadata,
    builtPrompt,
    error,
    rawResponse
  );

  // Insert decision record (with conflict handling for idempotent retries)
  const insertResult = await db
    .insert(agent_decisions)
    .values({
      simulation_id: params.simulationId,
      agent_id: params.agentId,
      tick_id: params.tickId,
      day: params.day,
      hour: params.hour,
      price: decision.price,
      quality: decision.quality,
      marketing: decision.marketing,
      reasoning: decision.reasoning,
    })
    .onConflictDoNothing() // Safety net for race conditions
    .returning({ id: agent_decisions.id });

  // Handle case where insert was skipped due to conflict (race condition)
  let decisionId: string;
  const decisionConflict = insertResult.length === 0;

  if (decisionConflict) {
    // Conflict occurred - fetch existing decision ID
    const [existingDecision] = await db
      .select({ id: agent_decisions.id })
      .from(agent_decisions)
      .where(
        and(
          eq(agent_decisions.tick_id, params.tickId),
          eq(agent_decisions.agent_id, params.agentId)
        )
      )
      .limit(1);

    if (!existingDecision) {
      throw new Error(
        "Decision insert conflict but no existing decision found - this should not happen"
      );
    }
    decisionId = existingDecision.id;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistDecision",
      status: "conflict_resolved",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
    });

    // Decision conflict means artifact should already exist - fetch it
    const [existingArtifact] = await db
      .select({ id: simulation_artifacts.id })
      .from(simulation_artifacts)
      .where(
        and(
          eq(simulation_artifacts.tick_id, params.tickId),
          eq(simulation_artifacts.agent_id, params.agentId),
          eq(simulation_artifacts.kind, "agent_turn")
        )
      )
      .limit(1);

    if (existingArtifact) {
      logAgentTurnOperation({
        timestamp: new Date().toISOString(),
        operation: "persistArtifact",
        status: "conflict_resolved",
        simulationId: params.simulationId,
        agentId: params.agentId,
        tickId: params.tickId,
        day: params.day,
        hour: params.hour,
      });

      return { decisionId, artifactId: existingArtifact.id };
    }

    // Edge case: decision exists but artifact is missing (original artifact insert failed)
    // Regenerate artifact from canonical decision values to maintain integrity
    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "regenerating",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
      reason: "Decision conflict but artifact missing - regenerating from canonical decision",
    });

    // Fetch canonical decision values
    const [canonicalDecision] = await db
      .select({
        price: agent_decisions.price,
        quality: agent_decisions.quality,
        marketing: agent_decisions.marketing,
      })
      .from(agent_decisions)
      .where(eq(agent_decisions.id, decisionId))
      .limit(1);

    if (!canonicalDecision) {
      // Shouldn't happen - we just fetched the decision ID
      throw new Error("Failed to fetch canonical decision for artifact regeneration");
    }

    // Build regenerated artifact with canonical values
    const regeneratedPayload = buildRegeneratedArtifactPayload(
      params,
      canonicalDecision
    );

    // Insert regenerated artifact
    // Note: Use "regenerated" sentinel for hashes since original prompt/schema is unknown
    const [regeneratedArtifact] = await db
      .insert(simulation_artifacts)
      .values({
        simulation_id: params.simulationId,
        day_id: params.dayId,
        tick_id: params.tickId,
        day: params.day,
        hour: params.hour,
        agent_id: params.agentId,
        kind: "agent_turn",
        schema_version: 1,
        model_name: params.modelName,
        prompt_hash: "regenerated",
        tool_schema_hash: "regenerated",
        artifact: regeneratedPayload,
        is_redacted: true,
      })
      .onConflictDoNothing()
      .returning({ id: simulation_artifacts.id });

    // Handle race condition where artifact was inserted by another process
    if (!regeneratedArtifact) {
      const [existingArtifact] = await db
        .select({ id: simulation_artifacts.id })
        .from(simulation_artifacts)
        .where(
          and(
            eq(simulation_artifacts.tick_id, params.tickId),
            eq(simulation_artifacts.agent_id, params.agentId),
            eq(simulation_artifacts.kind, "agent_turn")
          )
        )
        .limit(1);

      return { decisionId, artifactId: existingArtifact?.id ?? "" };
    }

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "regenerated",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
    });

    return { decisionId, artifactId: regeneratedArtifact.id };
  } else {
    decisionId = insertResult[0].id;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistDecision",
      status: "success",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
    });
  }

  // Insert artifact record (with conflict handling for race conditions)
  const artifactInsertResult = await db
    .insert(simulation_artifacts)
    .values({
      simulation_id: params.simulationId,
      day_id: params.dayId,
      tick_id: params.tickId,
      day: params.day,
      hour: params.hour,
      agent_id: params.agentId,
      kind: "agent_turn",
      schema_version: 1,
      model_name: params.modelName,
      prompt_hash: builtPrompt.promptHash,
      tool_schema_hash: builtPrompt.schemaHash,
      artifact: payload,
      is_redacted: isRedacted,
    })
    .onConflictDoNothing() // Safety net for race conditions (unique constraint on tick_id, agent_id, kind)
    .returning({ id: simulation_artifacts.id });

  let artifactId: string;
  if (artifactInsertResult.length === 0) {
    // Conflict occurred - fetch existing artifact ID
    const [existingArtifact] = await db
      .select({ id: simulation_artifacts.id })
      .from(simulation_artifacts)
      .where(
        and(
          eq(simulation_artifacts.tick_id, params.tickId),
          eq(simulation_artifacts.agent_id, params.agentId),
          eq(simulation_artifacts.kind, "agent_turn")
        )
      )
      .limit(1);

    if (!existingArtifact) {
      throw new Error(
        "Artifact insert conflict but no existing artifact found - this should not happen"
      );
    }
    artifactId = existingArtifact.id;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "conflict_resolved",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
    });
  } else {
    artifactId = artifactInsertResult[0].id;

    logAgentTurnOperation({
      timestamp: new Date().toISOString(),
      operation: "persistArtifact",
      status: "success",
      simulationId: params.simulationId,
      agentId: params.agentId,
      tickId: params.tickId,
      day: params.day,
      hour: params.hour,
    });
  }

  return { decisionId, artifactId };
}

// ========================================
// Artifact Building
// ========================================

/**
 * Build artifact payload based on redaction rules.
 *
 * HARD REQUIREMENTS (from CLAUDE.md):
 * - is_redacted MUST default to true
 * - Raw prompts/responses ONLY stored when STORE_RAW_LLM_IO=true AND non-production
 * - Hashes MUST always be stored for provenance
 */
function buildArtifactPayload(
  params: AgentTurnParams,
  decision: AgentDecision,
  metadata: AgentTurnMetadata,
  builtPrompt: BuiltPrompt,
  error?: string,
  rawResponse?: unknown
): { payload: AgentTurnArtifactPayload; isRedacted: boolean } {
  const now = new Date().toISOString();
  const startedAt = new Date(Date.now() - metadata.durationMs).toISOString();

  const basePayload: AgentTurnArtifactPayload = {
    version: 1,
    agentId: params.agentId,
    modelName: params.modelName,
    day: params.day,
    hour: params.hour,
    startedAt,
    finishedAt: now,
    durationMs: metadata.durationMs,
    attemptCount: metadata.attemptCount,
    usedFallback: metadata.usedFallback,
    decision: {
      price: decision.price,
      quality: decision.quality,
      marketing: decision.marketing,
      // reasoning intentionally excluded - stored in agent_decisions table
    },
    wasCoerced: metadata.wasCoerced,
    reasoningTruncated: metadata.reasoningTruncated,
  };

  if (error) {
    basePayload.error = error;
  }

  // Check if raw LLM I/O storage is enabled
  const storeRawIO = process.env.STORE_RAW_LLM_IO === "true";
  const isProduction = process.env.NODE_ENV === "production";

  if (storeRawIO && !isProduction) {
    // Store raw data - artifact is NOT redacted
    return {
      payload: {
        ...basePayload,
        rawPrompt: builtPrompt.prompt,
        rawResponse: rawResponse ? JSON.stringify(rawResponse) : undefined,
      },
      isRedacted: false,
    };
  }

  // Default: redacted (no raw prompt/response)
  return {
    payload: basePayload,
    isRedacted: true,
  };
}

/**
 * Build a regenerated artifact payload using canonical decision values.
 * Used when decision conflict occurred but artifact was missing.
 *
 * Note: Original metadata is lost, so fields like durationMs, attemptCount,
 * usedFallback are set to undefined. The wasRegenerated flag marks this artifact.
 */
function buildRegeneratedArtifactPayload(
  params: AgentTurnParams,
  decision: { price: number; quality: number | null; marketing: number | null }
): AgentTurnArtifactPayload {
  const now = new Date().toISOString();
  return {
    version: 1,
    agentId: params.agentId,
    modelName: params.modelName,
    day: params.day,
    hour: params.hour,
    startedAt: now,
    finishedAt: now,
    durationMs: undefined, // Unknown - original metadata lost
    attemptCount: undefined, // Unknown - original metadata lost
    usedFallback: undefined, // Unknown - original metadata lost
    decision: {
      price: decision.price,
      quality: decision.quality ?? 5,
      marketing: decision.marketing ?? 50,
    },
    wasCoerced: undefined, // Unknown - original metadata lost
    reasoningTruncated: undefined, // Unknown - original metadata lost
    wasRegenerated: true, // Marks this as a recovery artifact
  };
}
