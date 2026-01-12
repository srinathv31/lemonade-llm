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

## In Progress
- [ ] Step 3: Agent Decision Schema & Validation
  - Zod schema for decisions
  - Parsing + validation helpers
  - Brief reasoning rules (no chain-of-thought)

- [ ] Step 4: Prompt Builder
  - JSON-only prompts
  - Context injection (day, hour, history, competitors)
  - Stable prompt hashing

- [ ] Step 5: Agent Turn Runner
  - Run a single agent for one tick
  - Validation + retries + fallback
  - Persist agent_decisions
  - Write agent_turn artifact (redacted by default)

## Upcoming
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
