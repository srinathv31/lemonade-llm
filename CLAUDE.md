# CLAUDE.md

This file instructs Claude Code how to work effectively in this repository.

## Project Overview

**Lemonade Stand Economy Simulation** — A multi-agent simulation where AI models (via Ollama) compete by running lemonade stands.

### How It Works
- **Discrete turns:** Each simulated day runs from 9am–5pm (8 hourly ticks)
- **Agent decisions:** Each tick, agents decide price, quality, and marketing spend
- **Customer engine:** Rule-based demand calculation (not LLM) determines purchases
- **Persistence:** All actions and outcomes stored in PostgreSQL via Drizzle

### Non-Goals (for now)
- No RL training
- No LLM-based customers (prevents gaming)
- No premature scaling infrastructure

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL (Neon serverless) + Drizzle ORM |
| LLM | Ollama (local) via Vercel AI SDK |
| Package Manager | pnpm |

---

## Core Architecture Concepts

### Artifact-First Mental Model

This simulation uses an **artifact-first** approach to data persistence. Understanding the distinction between normalized tables and artifacts is critical.

#### What is a Simulation Artifact?

A **simulation artifact** is an immutable JSON blob that captures the complete context of a simulation event. Artifacts exist for:

- **Replayability:** Reconstruct exactly what happened at any point in the simulation
- **Auditability:** Prove what inputs led to what outputs
- **Debugging:** Investigate agent behavior without re-running simulations

#### Normalized Tables vs. Artifacts

| Aspect | Normalized Tables | Artifacts |
|--------|-------------------|-----------|
| **Purpose** | Business state, analytics, queries | Immutable truth logs, replay/debug |
| **Mutability** | MAY be updated (e.g., status changes) | MUST NOT be mutated after creation |
| **Schema** | Relational, indexed for queries | Versioned JSON blobs |
| **Examples** | `agent_decisions`, `customer_events` | `simulation_artifacts` |
| **Use case** | "What is the current state?" | "What exactly happened and why?" |

#### Artifact Rules (HARD REQUIREMENTS)

- **Append-only:** Artifacts MUST only be inserted, never updated or deleted
- **Immutable:** Once created, an artifact's content MUST NOT change
- **Hashed:** Artifacts MUST include provenance hashes (`prompt_hash`, `tool_schema_hash`) even when content is redacted
- **Redacted by default:** The `is_redacted` flag MUST default to `true` in production

#### Artifact Types

| Kind | Scope | Contains |
|------|-------|----------|
| `agent_turn` | Single agent, single tick | Decision context, model response metadata, timing |
| `tick` | All agents, single hour | Aggregated tick state, customer engine inputs/outputs |
| `day` | Full simulation day | Day seed, environment snapshot, summary metrics |
| `run_summary` | Entire simulation | Final rankings, aggregate statistics |

---

### Deterministic Simulation Guarantees

The simulation engine is designed for **deterministic replay** where possible.

#### Where Determinism Lives

- **Day-level seeds:** Each `simulation_day` record stores an RNG `seed`
- **Environment snapshots:** `env_snapshot` captures weather, base demand, and other factors
- **Tick derivation:** Ticks derive deterministically from the day seed + tick snapshot

#### Replay Guarantee

Given the same:
- Simulation configuration
- Day seed
- Environment snapshot

The **customer engine** and **demand calculations** MUST produce identical outcomes.

#### LLM Nondeterminism (Expected)

LLM responses are inherently nondeterministic. This is **expected and tolerated**:

- Different runs MAY produce different agent decisions
- Artifacts capture the actual LLM output for each run
- Replay of artifacts shows what happened, not what would happen

#### Determinism Enforcement Points

| Component | Deterministic? | Notes |
|-----------|---------------|-------|
| Customer engine | YES | Same inputs = same demand calculation |
| Demand factors | YES | Weather, time-of-day, competitor effects |
| LLM agent decisions | NO | Model responses may vary |
| Random events | YES | Seeded from `simulation_day.seed` |

---

## Development Commands

```bash
# Development
pnpm dev              # Start dev server (http://localhost:3000)
pnpm lint             # Run ESLint
pnpm build            # Production build

# Database
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run pending migrations
pnpm db:push          # Push schema changes (dev only)
pnpm db:studio        # Open Drizzle Studio GUI
```

---

## File Organization

```
src/
├── app/                    # Next.js routes, pages, API routes
│   └── api/                # API route handlers
├── components/
│   ├── ui/                 # shadcn UI components
│   └── ai-elements/        # AI-specific UI components
├── lib/
│   ├── db/drizzle/         # Database schema and client
│   ├── ollama/             # Ollama + AI SDK provider wrappers
│   └── sim/                # Simulation engine
│       ├── prompts/        # Prompt templates
│       ├── engine/         # Tick/day runners
│       └── customers/      # Customer demand logic
```

---

## Coding Standards

### React & Next.js
- **RSC-first:** Prefer React Server Components by default
- **Server Actions:** Use for mutations where appropriate
- **API Routes:** Only for integration boundaries (webhooks, simulation triggers)
- **No client-side LLM calls:** Ollama calls MUST be server-side only

### TypeScript
- **Strict mode:** Already enabled, maintain it
- **No `any`:** If unavoidable, isolate and document
- **Explicit returns:** All exported functions must have explicit return types
- **Zod validation:** All LLM outputs and external API payloads

### Code Style
- **Small modules:** Composable functions, avoid giant files
- **No over-engineering:** Only add what's needed for the current task
- **No premature abstraction:** Three similar lines > unnecessary helper

---

## Incremental Delivery

Build the smallest working vertical slice first:

1. Make it work (single happy path)
2. Make it correct (error handling, edge cases)
3. Make it fast (optimization if needed)

Each PR should represent one cohesive, reviewable change.

---

## Safety & Logging Rules

### HARD REQUIREMENTS (Non-Negotiable)

These rules MUST be followed. Violations are considered security issues.

#### Raw LLM I/O Handling

- **MUST NOT** log raw prompts to console, files, or external services in production
- **MUST NOT** log raw LLM responses to console, files, or external services in production
- **MUST NOT** store raw prompts in normalized database tables
- **MUST NOT** store raw LLM responses in normalized database tables

#### Artifact Storage of LLM I/O

- Raw prompts and responses MAY ONLY be stored in `simulation_artifacts` when:
  1. A dev-only flag is explicitly enabled (e.g., `STORE_RAW_LLM_IO=true`)
  2. The environment is explicitly non-production
- When raw I/O is stored, the artifact `is_redacted` field MUST be `false`
- When raw I/O is NOT stored, the artifact MUST still include:
  - `prompt_hash` (SHA-256 of the full prompt)
  - `tool_schema_hash` (SHA-256 of the Zod schema used)
  - Model name and timing metadata

#### Redaction Rules

- Production artifacts MUST have `is_redacted = true` by default
- Redacted artifacts MUST NOT contain raw prompt text
- Redacted artifacts MUST NOT contain raw LLM response text
- Redacted artifacts MUST NOT contain chain-of-thought reasoning
- Redacted artifacts MUST still contain hashes for provenance verification

### Structured Logging (Permitted)

#### DO Log
- `simulationId`, `agentId`, `model` name
- Tick info (`day_id`, `tick_id`, day number, hour)
- Duration of LLM calls (in milliseconds)
- Error codes and error messages (not stack traces in prod)
- Hash values for provenance

#### DO NOT Log (Production)
- Full prompts or prompt fragments
- Full LLM responses or response fragments
- Chain-of-thought or reasoning text
- Sensitive configuration values
- Database connection strings

#### Log Format

Use structured JSON logging:
```typescript
console.log(JSON.stringify({
  simulationId,
  agentId,
  model: 'gemma3',
  day: 1,
  hour: 9,
  duration: 1234,
  promptHash: 'sha256:abc123...',
  status: 'success'
}));
```

---

## Database Schema

### Table Overview

| Table | Purpose | Mutability |
|-------|---------|------------|
| `simulations` | Top-level simulation runs | Updatable (status) |
| `agents` | AI agents in each simulation | Updatable (strategy) |
| `simulation_days` | Per-day seed, env snapshot, status | Updatable (status) |
| `simulation_ticks` | Per-tick state, status, errors | Updatable (status) |
| `agent_decisions` | Per-tick price/quality/marketing | Insert-only |
| `customer_events` | Demand results and sales per tick | Insert-only |
| `simulation_metrics` | Aggregated metrics for analysis | Insert-only |
| `simulation_artifacts` | Immutable JSON blobs for replay | **Append-only** |

### Key Relationships

```
simulations
├── agents (1:N)
├── simulation_days (1:N)
│   └── simulation_ticks (1:N per day)
│       ├── agent_decisions (tick_id FK)
│       ├── customer_events (tick_id FK)
│       └── simulation_artifacts (tick_id FK)
└── simulation_artifacts (simulation_id FK)
```

### Canonical Foreign Keys

- `agent_decisions.tick_id` → `simulation_ticks.id` (NOT NULL)
- `customer_events.tick_id` → `simulation_ticks.id` (NOT NULL)
- `simulation_artifacts.day_id` → `simulation_days.id` (nullable)
- `simulation_artifacts.tick_id` → `simulation_ticks.id` (nullable)

The `day` and `hour` integer columns are kept for query convenience but are NOT the source of truth. Always join via `tick_id` or `day_id` for authoritative relationships.

---

## Working with LLMs

### Provider Setup
Use the Vercel AI SDK with the Ollama provider:
```typescript
import { createOllama } from 'ollama-ai-provider';
import { generateObject } from 'ai';

const ollama = createOllama({ baseURL: 'http://localhost:11434/api' });
```

### Structured Output
Always request JSON and validate with Zod:
```typescript
const result = await generateObject({
  model: ollama('gemma3'),
  schema: agentDecisionSchema,
  prompt: buildAgentPrompt(context),
});
```

### Error Handling
- Wrap LLM calls in try/catch
- Log failures with context (agentId, tick) — NOT the prompt or response
- Have fallback behavior (e.g., repeat last decision)
- Always record timing metadata in artifacts

### Provenance Tracking

For every LLM call, capture:
- Model name (e.g., `gemma3`, `llama3`)
- Prompt hash (SHA-256)
- Tool/schema hash (SHA-256 of Zod schema)
- Call duration (milliseconds)
- Success/failure status

Store this metadata in `simulation_artifacts` regardless of redaction status.
