// src/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
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
export const agents = pgTable("agents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  simulation_id: uuid("simulation_id")
    .notNull()
    .references(() => simulations.id),
  model_name: text("model_name").notNull(), // e.g., "gemma3", "vicuna"
  strategy: jsonb("strategy"), // optional agent config
});

// ---------------------------
// Agent Decisions Per Tick
// ---------------------------
export const agent_decisions = pgTable("agent_decisions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  simulation_id: uuid("simulation_id")
    .notNull()
    .references(() => simulations.id),
  agent_id: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  day: integer("day").notNull(), // simulation day count
  hour: integer("hour").notNull(), // 0–23 or 9–16 for 9am-5pm schedule
  price: doublePrecision("price").notNull(),
  quality: integer("quality"), // eg. 0–10 scale
  marketing: integer("marketing"), // marketing effort level
  reasoning: text("reasoning"), // LLM thought process (if stored)
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// ---------------------------
// Customer Results / Outcomes
// ---------------------------
export const customer_events = pgTable("customer_events", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  simulation_id: uuid("simulation_id")
    .notNull()
    .references(() => simulations.id),
  agent_id: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  day: integer("day").notNull(),
  hour: integer("hour").notNull(),
  customers_served: integer("customers_served").notNull(),
  sales_volume: integer("sales_volume").notNull(),
  revenue: doublePrecision("revenue").notNull(),
  demand_factors: jsonb("demand_factors"), // weather, marketing effects, etc.
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

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
