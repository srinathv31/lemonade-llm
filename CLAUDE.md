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

## Logging Guidelines

### DO Log
- `simulationId`, `agentId`, `model` name
- Tick info (day, hour)
- Duration of LLM calls
- Error codes and messages

### DO NOT Log (in production)
- Full prompts
- Full LLM responses
- Sensitive configuration

Use structured logging format:
```typescript
console.log(JSON.stringify({
  simulationId,
  agentId,
  model: 'gemma3',
  day: 1,
  hour: 9,
  duration: 1234,
  status: 'success'
}));
```

---

## Database Schema

Five main tables (see `src/lib/db/drizzle/schema.ts`):

| Table | Purpose |
|-------|---------|
| `simulations` | Top-level simulation runs |
| `agents` | AI agents in each simulation |
| `agent_decisions` | Per-tick price/quality/marketing decisions |
| `customer_events` | Demand results and sales per tick |
| `simulation_metrics` | Aggregated metrics for analysis |

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
- Log failures with context (agentId, tick)
- Have fallback behavior (e.g., repeat last decision)
