import { createHash } from "crypto";
import { agentDecisionSchema } from "./schema";

/**
 * Compute SHA-256 hash of the agent decision Zod schema.
 * Used for provenance tracking in simulation_artifacts.
 *
 * The hash captures the schema structure so we can detect
 * when the schema changes between simulation runs.
 */
export function computeSchemaHash(): string {
  // Serialize the schema shape for hashing
  // We use a custom replacer to handle Zod's internal structures
  const schemaDefinition = JSON.stringify(
    agentDecisionSchema.shape,
    (_key, value) => {
      // Handle Zod's internal structures
      if (typeof value === "function") {
        return value.name || "function";
      }
      if (value?._def) {
        return {
          typeName: value._def.typeName,
          checks: value._def.checks,
          description: value._def.description,
        };
      }
      return value;
    }
  );

  return `sha256:${createHash("sha256").update(schemaDefinition).digest("hex")}`;
}

/**
 * Compute SHA-256 hash of a prompt string.
 * Used for provenance tracking without storing raw prompts.
 *
 * IMPORTANT: This allows verification that the same prompt was used
 * without violating the "no raw prompts in logs" rule from CLAUDE.md.
 */
export function computePromptHash(prompt: string): string {
  return `sha256:${createHash("sha256").update(prompt).digest("hex")}`;
}

/**
 * Pre-computed schema hash for the current schema version.
 * Re-computed at module load time.
 */
export const CURRENT_SCHEMA_HASH = computeSchemaHash();
