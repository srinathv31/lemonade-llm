import { z } from "zod";

// ========================================
// Create Simulation
// ========================================

export const createSimulationAgentSchema = z.object({
  modelName: z.string().min(1, "Model name is required"),
  strategy: z.record(z.string(), z.unknown()).optional(),
});

export const createSimulationEnvironmentSchema = z.object({
  weather: z
    .enum(["sunny", "cloudy", "rainy", "hot", "cold"])
    .optional(),
  temperature: z.number().min(30).max(110).optional(),
  baseDemand: z.number().min(10).max(500).optional(),
  specialEvent: z.string().optional(),
});

export const createSimulationConfigSchema = z.object({
  numDays: z.number().int().min(1).max(30).default(5),
  environment: createSimulationEnvironmentSchema.optional(),
});

export const createSimulationRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Simulation name is required")
    .max(100, "Simulation name must be 100 characters or less"),
  agents: z
    .array(createSimulationAgentSchema)
    .min(1, "At least one agent is required")
    .max(10, "Maximum 10 agents allowed"),
  config: createSimulationConfigSchema.optional(),
});

export type CreateSimulationRequest = z.infer<
  typeof createSimulationRequestSchema
>;

// ========================================
// Run Day
// ========================================

export const runDayRequestSchema = z.object({
  day: z.number().int().min(1, "Day must be at least 1"),
  sequential: z.boolean().optional().default(false),
});

export type RunDayRequest = z.infer<typeof runDayRequestSchema>;

// ========================================
// Run Full Simulation
// ========================================

export const runSimulationRequestSchema = z.object({
  sequential: z.boolean().optional().default(false),
  startDay: z.number().int().min(1).optional(),
});

export type RunSimulationRequest = z.infer<typeof runSimulationRequestSchema>;

// ========================================
// Query Parameters
// ========================================

export const listSimulationsQuerySchema = z.object({
  status: z
    .enum(["pending", "running", "completed", "partial", "failed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListSimulationsQuery = z.infer<typeof listSimulationsQuerySchema>;

// ========================================
// Response Types
// ========================================

export interface SimulationListItem {
  id: string;
  name: string;
  status: string;
  agentCount: number;
  createdAt: string;
  finishedAt?: string;
}

export interface SimulationAgent {
  id: string;
  modelName: string;
  strategy?: Record<string, unknown>;
}

export interface SimulationDayStatus {
  day: number;
  status: string;
  tickCount: number;
  completedTicks: number;
}

export interface SimulationDetail {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: string;
  finishedAt?: string;
  agents: SimulationAgent[];
  days: SimulationDayStatus[];
  summary?: {
    totalDays: number;
    completedDays: number;
    totalTicks: number;
    completedTicks: number;
    totalRevenue: number;
  };
}

export interface CreateSimulationResponse {
  success: boolean;
  simulation?: {
    id: string;
    name: string;
    status: string;
    agentCount: number;
    config: Record<string, unknown>;
    createdAt: string;
  };
  error?: string;
}

export interface ListSimulationsResponse {
  success: boolean;
  simulations?: SimulationListItem[];
  total?: number;
  error?: string;
}

export interface GetSimulationResponse {
  success: boolean;
  simulation?: SimulationDetail;
  error?: string;
}

export interface DeleteSimulationResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface RunDayResponse {
  success: boolean;
  result?: {
    dayId: string;
    day: number;
    status: "completed" | "partial" | "failed";
    durationMs: number;
    summary: {
      totalTicks: number;
      completedTicks: number;
      totalCustomers: number;
      totalRevenue: number;
    };
    agentSummaries: Array<{
      agentId: string;
      modelName: string;
      totalRevenue: number;
      totalCustomersServed: number;
    }>;
  };
  error?: string;
  duration?: number;
}

export interface RunSimulationResponse {
  success: boolean;
  result?: {
    simulationId: string;
    status: "completed" | "partial" | "failed";
    durationMs: number;
    daysRun: number;
    daysCompleted: number;
    daysFailed: number;
    dayResults: Array<{
      day: number;
      status: string;
      durationMs: number;
      totalRevenue: number;
    }>;
    summary?: {
      totalRevenue: number;
      totalCustomers: number;
      winningAgent?: {
        agentId: string;
        modelName: string;
        totalRevenue: number;
      };
    };
  };
  error?: string;
  duration?: number;
}
