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

## In Progress
- [ ] Step 6: Timeline Bootstrap (Days & Ticks)
  - Ensure simulation_day exists (seed, env snapshot)
  - Ensure simulation_tick exists (tick snapshot, status)

- [ ] Step 7: Tick Runner
  - Run all agents for one tick
  - Update tick status
  - Write tick artifact (summary + metadata)

- [ ] Step 8: Customer Engine
  - Deterministic demand calculation
  - Insert customer_events
  - Attach outcomes to tick replay

- [ ] Step 9: Day Runner
  - Loop through 8 ticks (9am–5pm)
  - Post-day aggregation
  - Write day artifact + summary metrics

- [ ] Step 10: Replay Queries
  - Load full simulation replay
  - Load per-tick replay (fast drill-down)

- [ ] Step 11: Simulation API
  - Create / start simulations
  - Trigger day or full run
  - Server-only orchestration

- [ ] Step 12: Dashboard UI
  - Simulation list + detail
  - Replay view (day/tick timeline)
  - Basic metrics & charts
