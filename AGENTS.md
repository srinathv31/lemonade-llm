# AGENTS.md — Engineering Runbook

This is the step-by-step guide for building the Lemonade Stand simulation.

---

## Core Concepts

### Data Responsibilities

Understanding which data structures answer which questions is critical for maintaining simulation integrity.

#### Business Logic Tables

**Purpose:** Answer "What happened?"

| Table | Question Answered |
|-------|-------------------|
| `agent_decisions` | What price/quality/marketing did agent X choose at tick Y? |
| `customer_events` | How many customers did agent X serve at tick Y? |
| `simulation_metrics` | What are the aggregate statistics for simulation Z? |

**Characteristics:**
- Optimized for queries and analytics
- May be joined, aggregated, filtered
- SHOULD NOT be used for replay (missing context)

#### Artifacts

**Purpose:** Answer "Why and how did it happen?"

| Kind | Question Answered |
|------|-------------------|
| `agent_turn` | What context did the agent see? What did the model return? |
| `tick` | What was the complete state at this hour? |
| `day` | What seed and environment drove this day? |
| `run_summary` | What was the final outcome of the entire simulation? |

**Characteristics:**
- Immutable after creation
- Complete context for debugging
- MUST NOT be queried for live simulation decisions
- Read-only, post-hoc analysis only

#### Key Principle

- **Live decisions:** Read from normalized tables (`agent_decisions`, `customer_events`)
- **Debugging/replay:** Read from `simulation_artifacts`
- **Never:** Query artifacts to inform agent behavior during simulation

---

## Artifacts & Replay Conceptual Model

### What is an Artifact?

An artifact is an immutable JSON blob stored in `simulation_artifacts` that captures the complete context of a simulation event. Artifacts enable:

- **Replay:** Step through exactly what happened without re-running
- **Debugging:** Inspect agent reasoning and model behavior
- **Auditing:** Prove provenance of decisions

### Artifact Types

#### `agent_turn` Artifact

**Scope:** Single agent, single tick

**Contains:**
- Agent ID and model name
- Tick context (day, hour, tick_id)
- Decision output (price, quality, marketing)
- Timing metadata (LLM call duration)
- Provenance hashes (prompt_hash, tool_schema_hash)
- Redaction status

**Does NOT contain (when redacted):**
- Raw prompt text
- Raw LLM response
- Chain-of-thought reasoning

#### `tick` Artifact

**Scope:** All agents, single hour

**Contains:**
- Tick ID and simulation context
- All agent decisions for this tick (references, not duplicates)
- Customer engine inputs (demand factors, weather)
- Customer engine outputs (purchases per agent)
- Tick-level timing and status

#### `day` Artifact

**Scope:** Full simulation day (8 ticks)

**Contains:**
- Day ID and simulation context
- RNG seed used for this day
- Environment snapshot (weather baseline, demand parameters)
- Summary metrics (total revenue, rankings)
- References to all tick artifacts

#### `run_summary` Artifact

**Scope:** Entire simulation

**Contains:**
- Simulation ID and configuration
- Final rankings and scores
- Aggregate statistics
- References to all day artifacts

### Artifact Relationships

```
run_summary (kind='run_summary')
└── day artifacts (kind='day')
    └── tick artifacts (kind='tick')
        └── agent_turn artifacts (kind='agent_turn')
```

Each level references the level below via tick_id/day_id foreign keys.

---

## Roadmap

> **Progress Tracking:** See [PROGRESS.md](./PROGRESS.md) for the current status checklist.

### Step 1: Ollama Provider Setup ✅

**Goal:** Create a reusable Ollama client using the Vercel AI SDK.

**Status:** Complete

**Files created:**
```
src/lib/ollama/
├── client.ts      # Provider instance + health check
├── schemas.ts     # Zod validation schemas
├── types.ts       # TypeScript interfaces
└── index.ts       # Barrel export
```

---

### Step 2: Database Schema ✅

**Goal:** Define all database tables for simulation persistence.

**Status:** Complete

**File:** `src/lib/db/drizzle/schema.ts`

**Tables created:**
- `simulations` - Top-level simulation runs
- `agents` - AI agents in each simulation
- `simulation_days` - Per-day seed, env snapshot
- `simulation_ticks` - Per-tick state
- `agent_decisions` - Per-tick price/quality/marketing
- `customer_events` - Demand results
- `simulation_artifacts` - Immutable replay blobs

---

### Step 3: Agent Decision Schema & Validation ✅

**Goal:** Define the data contract for agent decisions with runtime validation.

**Status:** Complete

**Schema bounds:**
| Field | Type | Range | Default |
|-------|------|-------|---------|
| `price` | number | 0.50–10.00 | 2.00 |
| `quality` | integer | 1–10 | 5 |
| `marketing` | integer | 0–100 | 50 |
| `reasoning` | string | max 500 chars | — |

**Files created:**
```
src/lib/sim/decisions/
├── schema.ts       # Zod schemas + constraints
├── types.ts        # TypeScript interfaces
├── validation.ts   # Parsing + validation helpers
├── provenance.ts   # SHA-256 hashing utilities
└── index.ts        # Barrel export
```

**Features:**
- Two-tier validation (strict → lenient with coercion)
- Chain-of-thought stripping from reasoning
- Fallback decision generation
- Provenance hashing for artifacts

---

### Step 4: Prompt Builder

**Goal:** Create prompt templates that produce valid JSON decisions.

**Tasks:**
- [ ] Create base prompt template for agent decisions
- [ ] Add context injection (day, hour, history, competitors)
- [ ] Implement stable prompt hashing
- [ ] Test with multiple Ollama models for JSON compliance

**Prompt structure:**
```
You are an AI running a lemonade stand.
Today is Day {day}, Hour {hour} (9am = hour 0, 5pm = hour 8).

Your past performance: {history}
Competitor prices: {competitors}

Decide your strategy. Respond ONLY with valid JSON:
{
  "price": <number 0.50-10.00>,
  "quality": <integer 1-10>,
  "marketing": <integer 0-100>,
  "reasoning": "<brief explanation>"
}
```

**Files to create:**
```
src/lib/sim/prompts/
├── decision.ts    # Decision prompt builder
├── templates.ts   # Reusable prompt fragments
└── index.ts
```

**Definition of Done:**
- Prompts consistently produce valid JSON from gemma3, llama3, mistral
- Context is properly injected
- Prompt hashing works correctly
- No prompt injection vulnerabilities

---

### Step 5: Agent Turn Runner

**Goal:** Execute a single agent's decision for one tick.

**Tasks:**
- [ ] Load agent config from database
- [ ] Build prompt with current context
- [ ] Call Ollama and parse response
- [ ] Insert decision into `agent_decisions` table
- [ ] Write `agent_turn` artifact (redacted by default)
- [ ] Handle errors gracefully (retry, fallback)

**Function signature:**
```typescript
async function runAgentTurn(params: {
  simulationId: string;
  agentId: string;
  tickId: string;
  day: number;
  hour: number;
}): Promise<AgentDecision>
```

**Files to create:**
```
src/lib/sim/engine/
├── agent-turn.ts   # Single agent execution
└── index.ts
```

**Definition of Done:**
- Single agent can make one decision
- Decision is persisted to database
- `agent_turn` artifact created with provenance hashes
- Errors are logged with context
- Fallback to previous decision on failure

#### Artifacts & Provenance

**Artifact produced:** `agent_turn`

**MUST capture:**
- `agent_id`, `tick_id`, `simulation_id`
- `model_name` (e.g., "gemma3")
- `prompt_hash` (SHA-256 of full prompt)
- `tool_schema_hash` (SHA-256 of Zod schema)
- `duration_ms` (LLM call timing)
- `is_redacted` (true in production)

**MUST NOT store (when redacted):**
- Raw prompt text
- Raw LLM response
- Chain-of-thought or reasoning beyond summary

**Provenance guarantee:** Even when redacted, the hash values allow verification that the same prompt/schema was used.

---

### Step 6: Timeline Bootstrap (Days & Ticks)

**Goal:** Ensure simulation timeline records exist before running.

**Tasks:**
- [ ] Create `simulation_day` record with seed and env snapshot
- [ ] Create `simulation_tick` records for all 8 hours
- [ ] Implement idempotent bootstrap (safe to re-run)

**Function signature:**
```typescript
async function bootstrapDay(params: {
  simulationId: string;
  day: number;
}): Promise<{ dayId: string; tickIds: string[] }>
```

**Definition of Done:**
- Day record created with RNG seed
- 8 tick records created (hours 9-16)
- Re-running doesn't create duplicates

---

### Step 7: Tick Runner

**Goal:** Execute all agents for a single hourly tick.

**Tasks:**
- [ ] Load all agents for simulation
- [ ] Run agent turns (parallel or sequential)
- [ ] Update tick status
- [ ] Write `tick` artifact (summary + metadata)
- [ ] Handle partial failures

**Function signature:**
```typescript
async function runTick(params: {
  simulationId: string;
  tickId: string;
  day: number;
  hour: number;
}): Promise<TickResult>
```

**Files to create:**
```
src/lib/sim/engine/
├── tick.ts         # All agents for one hour
└── ...
```

**Definition of Done:**
- All agents execute for one tick
- Tick status updated in database
- `tick` artifact created with references
- Partial failures don't crash entire tick

#### Artifacts & Provenance

**Artifact produced:** `tick`

**MUST capture:**
- `tick_id`, `simulation_id`, `day`, `hour`
- References to all `agent_turn` artifacts for this tick
- Customer engine inputs (demand factors snapshot)
- Customer engine outputs (per-agent results)
- Tick status and timing

**MUST NOT store:**
- Duplicates of agent decision data (reference via artifact IDs)
- Raw prompts or responses from agent turns

**Relationship:** The tick artifact SHOULD reference its child `agent_turn` artifacts by ID, not embed them.

---

### Step 8: Customer Engine

**Goal:** Rule-based demand calculation based on agent decisions.

**Tasks:**
- [ ] Define demand formula (price sensitivity, quality bonus, marketing effect)
- [ ] Add environmental factors (weather, time of day)
- [ ] Calculate purchases per agent (deterministic)
- [ ] Insert results to `customer_events` table
- [ ] Attach outcomes to tick replay

**Demand factors:**
```typescript
interface DemandFactors {
  baseTraffic: number;       // Time-of-day foot traffic
  priceSensitivity: number;  // Lower price = more customers
  qualityBonus: number;      // Higher quality = more retention
  marketingReach: number;    // Marketing spend effectiveness
  competitorEffect: number;  // Relative pricing impact
}
```

**Files to create:**
```
src/lib/sim/customers/
├── demand.ts       # Demand calculation
├── factors.ts      # Factor definitions
└── index.ts
```

**Definition of Done:**
- Demand is calculated deterministically from inputs
- Results are inserted to `customer_events`
- Same inputs always produce same outputs
- Formula is tunable via configuration

---

### Step 9: Day Runner

**Goal:** Execute a full simulated day (8 ticks, 9am–5pm).

**Tasks:**
- [ ] Loop through 8 ticks sequentially
- [ ] Run customer engine after each tick
- [ ] Implement post-day aggregation
- [ ] Write `day` artifact + summary metrics

**Function signature:**
```typescript
async function runDay(params: {
  simulationId: string;
  dayId: string;
  day: number;
}): Promise<DayResult>
```

**Files to create:**
```
src/lib/sim/engine/
├── day.ts          # Full day loop
└── ...
```

**Definition of Done:**
- Full 8-tick day runs to completion
- Customer engine runs after agent decisions
- `day` artifact created with summary
- Day summary metrics calculated and stored

#### Artifacts & Provenance

**Artifact produced:** `day`

**MUST capture:**
- `day_id`, `simulation_id`, `day` number
- RNG `seed` used for this day
- `env_snapshot` (weather, base demand, market conditions)
- References to all 8 `tick` artifacts
- Day summary metrics (total revenue, customer count)
- Day status and timing

**MUST NOT store:**
- Embedded tick or agent_turn data (reference only)
- Raw prompts or responses

**Determinism note:** The seed and env_snapshot enable deterministic replay of the customer engine.

---

### Step 10: Replay Queries

**Goal:** Load simulation artifacts for replay views.

**Tasks:**
- [ ] Load full simulation replay (all days)
- [ ] Load per-tick replay (fast drill-down)
- [ ] Efficient artifact traversal

**Definition of Done:**
- Can reconstruct full simulation timeline from artifacts
- Per-tick detail loads quickly
- Handles missing/incomplete artifacts gracefully

---

### Step 11: Simulation API

**Goal:** API endpoints to orchestrate simulations.

**Tasks:**
- [ ] Create / configure simulations
- [ ] Start simulation (trigger day run)
- [ ] Get simulation status
- [ ] Server-only orchestration (no client-side LLM calls)

**Definition of Done:**
- Can create simulations via API
- Can trigger simulation runs
- Status accurately reflects progress

---

### Step 12: Dashboard UI

**Goal:** Web interface to run and observe simulations.

**Tasks:**
- [ ] Simulation launcher (create new simulation, select models)
- [ ] Live tick display (real-time updates as simulation runs)
- [ ] Historical replay (step through past simulations)
- [ ] Metrics visualization (charts, rankings, trends)

**Routes to create:**
```
src/app/
├── page.tsx                    # Landing / dashboard
├── simulations/
│   ├── page.tsx               # List simulations
│   ├── new/page.tsx           # Create simulation
│   └── [id]/
│       ├── page.tsx           # Simulation detail
│       ├── live/page.tsx      # Live view
│       └── replay/page.tsx    # Historical replay
└── api/
    └── simulations/
        ├── route.ts           # CRUD endpoints
        └── [id]/
            └── run/route.ts   # Trigger simulation
```

**Definition of Done:**
- Can create and start simulations from UI
- Can observe live tick updates
- Can replay historical simulations
- Basic charts show agent performance

---

## Replay & Debugging

### Mental Model

There are two distinct ways to view simulation data:

#### Dashboard Views (Metrics & Analytics)

**Source:** Normalized tables (`agent_decisions`, `customer_events`, `simulation_metrics`)

**Use cases:**
- Charts showing revenue over time
- Leaderboards and rankings
- Aggregate statistics
- Performance comparisons

**Characteristics:**
- Fast queries via indexes
- Aggregatable and filterable
- Missing full context (by design)

#### Replay Views (Step-by-Step Investigation)

**Source:** `simulation_artifacts` table

**Use cases:**
- "What did agent X see at tick Y?"
- "Why did agent X choose that price?"
- "What were the exact demand factors?"
- "Did the model respond correctly?"

**Characteristics:**
- Complete context preserved
- Immutable historical record
- Slower to query (JSON blobs)
- Enables debugging without re-running

### Debugging Workflow

When investigating unexpected agent behavior:

1. **Identify the tick:** Use dashboard views to find anomalies
2. **Load the artifact:** Query `simulation_artifacts` for `kind='agent_turn'` at that tick
3. **Inspect context:** Review what the agent saw (competitors, history, environment)
4. **Check provenance:** Verify prompt_hash and model_name
5. **Compare artifacts:** Look at adjacent ticks for patterns

### What Artifacts Enable

| Without Artifacts | With Artifacts |
|-------------------|----------------|
| Re-run simulation to debug | Inspect historical state directly |
| Guess what model saw | Know exactly what context was provided |
| Trust that code worked | Verify via hashes and metadata |
| Lose debugging context | Permanent audit trail |

### Replay Limitations

- **LLM decisions cannot be replayed deterministically:** The same prompt may produce different outputs
- **Artifacts show what happened, not what would happen:** They are historical records, not re-execution
- **Customer engine CAN be replayed:** Given the same inputs (from artifacts), it produces identical outputs

---

## PR Guidelines

### Commit Messages
- Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
- Keep subject line under 72 characters
- Reference issue numbers if applicable

### PR Size
- One logical change per PR
- Include schema changes with their usage
- Keep PRs reviewable (ideally < 400 lines)

### Before Submitting
```bash
pnpm lint          # Fix any lint errors
pnpm build         # Ensure production build works
```

### Review Checklist
- [ ] Types are correct (no `any`)
- [ ] Zod validation on external inputs
- [ ] No secrets/credentials in code
- [ ] Errors are logged with context
- [ ] Artifacts are created with correct provenance
- [ ] Raw LLM I/O is not logged or stored inappropriately

---

## Debugging Playbook

### Ollama Offline

**Symptoms:** Connection refused, timeout errors

**Fix:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama (macOS)
ollama serve

# Or restart
pkill ollama && ollama serve
```

---

### Model Not Found

**Symptoms:** `model 'xyz' not found` error

**Fix:**
```bash
# List available models
ollama list

# Pull missing model
ollama pull gemma3
ollama pull llama3
ollama pull mistral
```

---

### Invalid JSON from LLM

**Symptoms:** Zod validation fails, JSON parse errors

**Possible causes:**
1. Model adding explanation text before/after JSON
2. Model using single quotes instead of double quotes
3. Model including trailing commas

**Fixes:**
- Add explicit JSON-only instruction to prompt
- Use regex to extract JSON from response
- Try a different model (some are better at JSON)

```typescript
// Extract JSON from response
function extractJson(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in response');
  return match[0];
}
```

---

### Timeouts

**Symptoms:** Request hangs, eventually fails

**Possible causes:**
1. Model is too large for hardware
2. Ollama is overloaded
3. Network issues

**Fixes:**
- Use smaller model (gemma3 vs llama3:70b)
- Add timeout to AI SDK calls
- Run fewer agents in parallel

```typescript
const result = await generateObject({
  model: ollama('gemma3'),
  schema: decisionSchema,
  prompt: prompt,
  // Add timeout
  abortSignal: AbortSignal.timeout(30000),
});
```

---

### Database Connection Issues

**Symptoms:** Drizzle queries fail, connection errors

**Fix:**
```bash
# Check DATABASE_URL is set
echo $DATABASE_URL

# Test connection
pnpm db:studio

# Regenerate client if schema changed
pnpm db:generate
pnpm db:migrate
```

---

### Missing or Corrupt Artifacts

**Symptoms:** Replay views show incomplete data

**Diagnosis:**
1. Check artifact count matches expected tick count
2. Verify `is_redacted` flag is consistent
3. Check for failed tick status in `simulation_ticks`

**Prevention:**
- Always create artifacts in a transaction with tick updates
- Log artifact creation failures with full context
- Validate artifact structure before insert

---

## Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/db/drizzle/schema.ts` | Database schema |
| `src/lib/ollama/client.ts` | Ollama provider ✅ |
| `src/lib/sim/decisions/schema.ts` | Agent decision Zod schema ✅ |
| `src/lib/sim/decisions/validation.ts` | Decision parsing + validation ✅ |
| `src/lib/sim/prompts/decision.ts` | Prompt builder (create this) |
| `src/lib/sim/engine/agent-turn.ts` | Agent turn runner (create this) |
| `src/lib/sim/engine/tick.ts` | Tick runner (create this) |
| `src/lib/sim/engine/day.ts` | Day runner (create this) |
| `src/lib/sim/customers/demand.ts` | Customer engine (create this) |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `OLLAMA_BASE_URL` | Ollama API URL (default: http://localhost:11434) |
| `STORE_RAW_LLM_IO` | Dev-only: enable raw prompt/response storage in artifacts |

### Useful Commands

```bash
# Development
pnpm dev                    # Start Next.js dev server

# Database
pnpm db:studio              # Visual database browser
pnpm db:push                # Quick schema sync (dev only)

# Ollama
ollama list                 # Show installed models
ollama pull <model>         # Download a model
ollama run <model>          # Test model interactively
```

### Artifact Query Patterns

```sql
-- Find all agent turns for a specific tick
SELECT * FROM simulation_artifacts
WHERE tick_id = ? AND kind = 'agent_turn';

-- Get day artifact with seed
SELECT * FROM simulation_artifacts
WHERE simulation_id = ? AND day = ? AND kind = 'day';

-- Check provenance for a specific agent
SELECT prompt_hash, model_name, duration_ms
FROM simulation_artifacts
WHERE agent_id = ? AND kind = 'agent_turn'
ORDER BY created_at;
```
