// src/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------
// Simulation Runs (Top Level)
// ---------------------------
export const simulations = pgTable("simulations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`), // requires pgcrypto extension
  name: text("name").notNull(),
  config: jsonb("config").notNull(), // stores all parameters
  status: text("status").notNull(), // e.g., "running" | "completed"
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finished_at: timestamp("finished_at", { withTimezone: true }),
});

// ---------------------------
// Agent Entities (AI Stand)
// ---------------------------
export const agents = pgTable(
  "agents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),
    model_name: text("model_name").notNull(), // e.g., "gemma3", "vicuna"
    strategy: jsonb("strategy"), // optional agent config
  },
  (table) => [
    uniqueIndex("agents_sim_model_idx").on(table.simulation_id, table.model_name),
    index("agents_sim_idx").on(table.simulation_id),
  ]
);

// ---------------------------
// Agent Decisions Per Tick
// ---------------------------
export const agent_decisions = pgTable(
  "agent_decisions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),
    agent_id: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    tick_id: uuid("tick_id")
      .notNull()
      .references(() => simulation_ticks.id), // canonical link to tick
    day: integer("day").notNull(), // simulation day count (kept for query convenience)
    hour: integer("hour").notNull(), // 9–16 for 9am-5pm schedule
    price: doublePrecision("price").notNull(),
    quality: integer("quality"), // eg. 0–10 scale
    marketing: integer("marketing"), // marketing effort level
    reasoning: text("reasoning"), // brief explanation (1-3 sentences, raw output in artifacts)
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("agent_decisions_sim_agent_day_hour_idx").on(
      table.simulation_id,
      table.agent_id,
      table.day,
      table.hour
    ),
    index("agent_decisions_sim_day_hour_idx").on(
      table.simulation_id,
      table.day,
      table.hour
    ),
    index("agent_decisions_tick_idx").on(table.tick_id),
  ]
);

// ---------------------------
// Customer Results / Outcomes
// ---------------------------
export const customer_events = pgTable(
  "customer_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),
    agent_id: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    tick_id: uuid("tick_id")
      .notNull()
      .references(() => simulation_ticks.id), // canonical link to tick
    day: integer("day").notNull(), // kept for query convenience
    hour: integer("hour").notNull(),
    customers_served: integer("customers_served").notNull(),
    sales_volume: integer("sales_volume").notNull(),
    revenue: doublePrecision("revenue").notNull(),
    demand_factors: jsonb("demand_factors"), // weather, marketing effects, etc.
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("customer_events_sim_agent_day_hour_idx").on(
      table.simulation_id,
      table.agent_id,
      table.day,
      table.hour
    ),
    index("customer_events_sim_day_hour_idx").on(
      table.simulation_id,
      table.day,
      table.hour
    ),
    index("customer_events_tick_idx").on(table.tick_id),
  ]
);

// ---------------------------
// Optional Summary Metrics
// ---------------------------
export const simulation_metrics = pgTable("simulation_metrics", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  simulation_id: uuid("simulation_id")
    .notNull()
    .references(() => simulations.id),
  metric_name: text("metric_name").notNull(), // e.g., "total_profit"
  value: doublePrecision("value").notNull(),
  meta: jsonb("meta"), // optional additional info
  recorded_at: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ---------------------------
// Simulation Days
// ---------------------------
export const simulation_days = pgTable(
  "simulation_days",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),

    day: integer("day").notNull(), // 1..N

    // Optional but useful
    seed: integer("seed"), // RNG seed for deterministic replay
    env_snapshot: jsonb("env_snapshot"), // weather baseline, demand params, etc.

    status: text("status").notNull().default("pending"), // pending|running|completed|failed
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("simulation_days_sim_day_idx").on(
      table.simulation_id,
      table.day
    ),
  ]
);

// ---------------------------
// Simulation Ticks (Hour within Day)
// ---------------------------
export const simulation_ticks = pgTable(
  "simulation_ticks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),

    day: integer("day").notNull(),
    hour: integer("hour").notNull(), // 9..16 for your 9am–5pm ticks

    // Optional tick-level env snapshot
    tick_snapshot: jsonb("tick_snapshot"), // e.g., weather change, events

    status: text("status").notNull().default("pending"), // pending|running|completed|failed
    error: text("error"),

    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("simulation_ticks_sim_day_hour_idx").on(
      table.simulation_id,
      table.day,
      table.hour
    ),
  ]
);

// ---------------------------
// Simulation Artifacts (Immutable replay/debug blobs)
// ---------------------------
export const simulation_artifacts = pgTable(
  "simulation_artifacts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),

    simulation_id: uuid("simulation_id")
      .notNull()
      .references(() => simulations.id),

    // Canonical FK links (preferred for joins)
    day_id: uuid("day_id").references(() => simulation_days.id), // nullable
    tick_id: uuid("tick_id").references(() => simulation_ticks.id), // nullable

    // Kept for query convenience
    day: integer("day"), // nullable
    hour: integer("hour"), // nullable
    agent_id: uuid("agent_id").references(() => agents.id), // nullable

    kind: text("kind").notNull(), // 'day' | 'tick' | 'agent_turn' | 'run_summary'
    schema_version: integer("schema_version").notNull().default(1),

    // Provenance (optional but extremely helpful)
    model_name: text("model_name"),
    prompt_hash: text("prompt_hash"),
    tool_schema_hash: text("tool_schema_hash"),

    // Storage options
    artifact: jsonb("artifact"), // store in DB now
    artifact_uri: text("artifact_uri"), // later: file server/object storage

    // Safety / logging control
    is_redacted: boolean("is_redacted").notNull().default(true),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("simulation_artifacts_sim_idx").on(table.simulation_id),
    index("simulation_artifacts_sim_kind_idx").on(
      table.simulation_id,
      table.kind
    ),
    index("simulation_artifacts_sim_day_idx").on(
      table.simulation_id,
      table.day
    ),
    index("simulation_artifacts_sim_day_hour_idx").on(
      table.simulation_id,
      table.day,
      table.hour
    ),
    index("simulation_artifacts_sim_agent_day_hour_idx").on(
      table.simulation_id,
      table.agent_id,
      table.day,
      table.hour
    ),
    index("simulation_artifacts_day_id_idx").on(table.day_id),
    index("simulation_artifacts_tick_id_idx").on(table.tick_id),
  ]
);
