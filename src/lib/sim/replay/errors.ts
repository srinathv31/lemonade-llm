// ========================================
// Replay Error Types
// ========================================

/**
 * Discriminated union for replay query errors.
 */
export type ReplayError =
  | { kind: "not_found"; entity: "day" | "tick"; id: string }
  | { kind: "database_error"; message: string };

/**
 * Result type for replay queries.
 * Success returns data, failure returns error.
 */
export type ReplayResult<T> =
  | { success: true; data: T }
  | { success: false; error: ReplayError };

// ========================================
// Error Factory Functions
// ========================================

/**
 * Create a not_found error for missing entities.
 */
export function notFoundError(
  entity: "day" | "tick",
  id: string
): ReplayError {
  return { kind: "not_found", entity, id };
}

/**
 * Create a database_error for query failures.
 */
export function databaseError(message: string): ReplayError {
  return { kind: "database_error", message };
}
