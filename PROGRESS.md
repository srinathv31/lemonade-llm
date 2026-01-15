# Lemonade Stand Simulation – Progress

## Completed
- [x] Step 1: Ollama Provider Setup
  - AI SDK integration
  - Health check
  - Model listing

- [x] Step 2: Database Schema
  - simulations / agents
  - simulation_days / simulation_ticks
  - agent_decisions / customer_events
  - simulation_artifacts (replay + provenance)

- [x] Step 3: Agent Decision Schema & Validation
  - Zod schema for decisions (price, quality, marketing, reasoning)
  - Parsing + validation helpers with coercion
  - Brief reasoning rules (CoT stripping, 300 char limit)
  - Provenance hashing (SHA-256 for prompts and schema)

- [x] Step 4: Prompt Builder
  - JSON-only prompts with explicit schema instructions
  - Context injection (day, hour, environment, history, competitors, market outcomes)
  - Deterministic prompt construction with stable hashing
  - Files: `src/lib/sim/prompts/{types,templates,context,builder,index}.ts`

- [x] Step 5: Agent Turn Runner
  - `runAgentTurn()` function with generateObject + agentDecisionSchema
  - 2 retries with exponential backoff (500ms, 1000ms)
  - Fallback to previous/default decision if all attempts fail
  - Persists to `agent_decisions` and `simulation_artifacts` tables
  - Artifacts redacted by default (raw I/O only with `STORE_RAW_LLM_IO=true` in non-prod)
  - Files: `src/lib/sim/engine/{types,agent-turn,index}.ts`

- [x] Step 6: Timeline Bootstrap (Days & Ticks)
  - `ensureDay()` / `ensureTick()` with idempotent INSERT...ON CONFLICT
  - Deterministic RNG (Mulberry32) for seeded environment/tick generation
  - `updateDayStatus()` / `updateTickStatus()` with retry support
  - Files: `src/lib/sim/engine/timeline.ts`

- [x] Step 7: Tick Runner
  - `runTick()` orchestrates all agents for one tick
  - Parallel execution (default) or sequential via config
  - Fetches agent history, competitor decisions, market outcomes
  - Writes tick artifact (kind: "tick", always redacted)
  - Files: `src/lib/sim/engine/tick-runner.ts`

- [x] Step 8: Customer Engine
  - Deterministic demand calculation with proportional market share
  - Multiplicative scoring: `AgentScore = PriceScore × QualityScore × MarketingScore`
  - Weather and special event modifiers affect base demand
  - Seeded RNG (Mulberry32) for deterministic customer distribution
  - Persists to `customer_events` table with full `demand_factors` breakdown
  - Integrated into tick runner, outcomes attached to tick artifact
  - Files: `src/lib/sim/customers/{types,modifiers,demand,engine,index}.ts`

- [x] Step 9: Day Runner
  - `runDay()` orchestrates 8 ticks (hours 9-16)
  - Aggregates results: `calculateDaySummary()`, `aggregateAgentDailySummaries()`
  - Writes day artifact (kind: "day") with tick references
  - Persists summary metrics to `simulation_metrics` table
  - Files: `src/lib/sim/engine/day-runner/{run-day,aggregation,artifact,metrics,utils,index}.ts`

- [x] Step 10: Replay Queries
  - `loadDayReplay(dayId)` - Day overview with tick summaries
  - `loadTickReplay(tickId)` - Full tick details with agent decisions and outcomes
  - Result types with discriminated unions for success/error
  - Files: `src/lib/sim/replay/{types,queries,errors,index}.ts`

- [x] Step 11: Simulation API
  - Full CRUD: create, list, get, delete simulations
  - Run endpoints: `run-day` (single day) and `run` (full simulation)
  - Blocking execution with status management (pending/running/completed/partial/failed)
  - Atomic run lock to prevent concurrent runs
  - Persists `run_summary` artifact with agent rankings and winner
  - Files: `src/app/api/simulations/{schemas,errors,utils}.ts`
  - Routes: `create/`, `list/`, `[id]/`, `[id]/run-day/`, `[id]/run/`

## In Progress

- [ ] Step 12: Dashboard UI
  - Simulation list + detail
  - Replay view (day/tick timeline)
  - Basic metrics & charts
