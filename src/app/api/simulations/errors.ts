/**
 * Custom error class for Simulation API errors.
 * Includes HTTP status code and optional error code for client handling.
 */
export class SimulationApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "SimulationApiError";
  }
}

/**
 * Factory functions for common Simulation API errors.
 */
export const SimulationErrors = {
  NOT_FOUND: (id: string): SimulationApiError =>
    new SimulationApiError(
      404,
      `Simulation ${id} not found`,
      "SIMULATION_NOT_FOUND"
    ),

  ALREADY_RUNNING: (id: string): SimulationApiError =>
    new SimulationApiError(
      409,
      `Simulation ${id} is already running`,
      "ALREADY_RUNNING"
    ),

  OLLAMA_UNAVAILABLE: (): SimulationApiError =>
    new SimulationApiError(
      503,
      "Ollama service is unavailable",
      "OLLAMA_UNAVAILABLE"
    ),

  MODEL_NOT_FOUND: (model: string): SimulationApiError =>
    new SimulationApiError(
      400,
      `Model "${model}" not found in Ollama`,
      "MODEL_NOT_FOUND"
    ),

  INVALID_DAY: (day: number, max: number): SimulationApiError =>
    new SimulationApiError(
      400,
      `Day ${day} is invalid. Must be between 1 and ${max}`,
      "INVALID_DAY"
    ),

  INVALID_STATUS: (status: string): SimulationApiError =>
    new SimulationApiError(
      400,
      `Cannot run simulation with status "${status}"`,
      "INVALID_STATUS"
    ),

  DATABASE_ERROR: (operation: string): SimulationApiError =>
    new SimulationApiError(
      500,
      `Database error during ${operation}`,
      "DATABASE_ERROR"
    ),

  RUN_LOCK_FAILED: (id: string): SimulationApiError =>
    new SimulationApiError(
      409,
      `Failed to acquire run lock for simulation ${id}. It may have been started by another request.`,
      "RUN_LOCK_FAILED"
    ),
};
