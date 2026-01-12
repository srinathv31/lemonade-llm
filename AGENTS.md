# AGENTS.md — Engineering Runbook

This is the step-by-step guide for building the Lemonade Stand simulation.

---

## Roadmap

### Step 1: Ollama Provider Layer

**Goal:** Create a reusable Ollama client using the Vercel AI SDK.

**Tasks:**
- [ ] Install `ollama-ai-provider` package
- [ ] Create `src/lib/ollama/client.ts` with configured provider
- [ ] Create `src/lib/ollama/models.ts` with model constants
- [ ] Add health check utility to verify Ollama is running

**Files to create:**
```
src/lib/ollama/
├── client.ts      # Provider instance
├── models.ts      # Available model names
└── index.ts       # Barrel export
```

**Definition of Done:**
- Can call any local Ollama model and receive a response
- Health check returns model list from Ollama API
- TypeScript types are correct

---

### Step 2: Decision JSON Contract

**Goal:** Define the data contract for agent decisions with runtime validation.

**Tasks:**
- [ ] Create Zod schema for agent decisions
- [ ] Create parsing helpers with error handling
- [ ] Add type exports for use throughout codebase

**Schema structure:**
```typescript
const agentDecisionSchema = z.object({
  price: z.number().min(0.50).max(10.00),
  quality: z.number().int().min(1).max(10),
  marketing: z.number().int().min(0).max(100),
  reasoning: z.string().max(500),
});
```

**Files to create:**
```
src/lib/sim/
├── schemas/
│   ├── decision.ts    # Zod schema + types
│   └── index.ts       # Barrel export
└── parsers/
    ├── decision.ts    # Parse + validate helpers
    └── index.ts
```

**Definition of Done:**
- Schema correctly validates price (0.50–10.00), quality (1–10), marketing (0–100)
- Invalid decisions throw descriptive errors
- Types are exported and usable

---

### Step 3: Prompt Builder

**Goal:** Create prompt templates that produce valid JSON decisions.

**Tasks:**
- [ ] Create base prompt template for agent decisions
- [ ] Add context injection (day, hour, history, competitors)
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
- No prompt injection vulnerabilities

---

### Step 4: Run-Agent-Turn

**Goal:** Execute a single agent's decision for one tick.

**Tasks:**
- [ ] Load agent config from database
- [ ] Build prompt with current context
- [ ] Call Ollama and parse response
- [ ] Insert decision into `agent_decisions` table
- [ ] Handle errors gracefully (retry, fallback)

**Function signature:**
```typescript
async function runAgentTurn(params: {
  simulationId: string;
  agentId: string;
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
- Errors are logged with context
- Fallback to previous decision on failure

---

### Step 5: Run-Tick

**Goal:** Execute all agents for a single hourly tick.

**Tasks:**
- [ ] Load all agents for simulation
- [ ] Run agent turns (parallel or sequential)
- [ ] Collect all decisions for the tick
- [ ] Handle partial failures

**Function signature:**
```typescript
async function runTick(params: {
  simulationId: string;
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
- Decisions are collected and returned
- Partial failures don't crash entire tick

---

### Step 6: Run-Day

**Goal:** Execute a full simulated day (8 ticks, 9am–5pm).

**Tasks:**
- [ ] Implement pre-day setup (weather, random events)
- [ ] Loop through 8 ticks sequentially
- [ ] Run customer engine after each tick
- [ ] Implement post-day summary (totals, rankings)

**Function signature:**
```typescript
async function runDay(params: {
  simulationId: string;
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
- Day summary is calculated and stored

---

### Step 7: Customer Engine

**Goal:** Rule-based demand calculation based on agent decisions.

**Tasks:**
- [ ] Define demand formula (price sensitivity, quality bonus, marketing effect)
- [ ] Add environmental factors (weather, time of day)
- [ ] Calculate purchases per agent
- [ ] Insert results to `customer_events` table

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
- Formula is tunable via configuration

---

### Step 8: UI Dashboards

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

## Quick Reference

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/db/drizzle/schema.ts` | Database schema |
| `src/lib/ollama/client.ts` | Ollama provider (create this) |
| `src/lib/sim/engine/day.ts` | Day runner (create this) |
| `src/lib/sim/customers/demand.ts` | Customer engine (create this) |

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `OLLAMA_BASE_URL` | Ollama API URL (default: http://localhost:11434) |

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
