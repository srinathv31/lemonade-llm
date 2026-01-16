# Dashboard UI - Implementation Checklist

Step 12 of the Lemonade Stand Simulation project.

**Tech Stack:** Next.js 16 + React 19 + RSC + Server Actions + shadcn (including charts)

---

## Phase 1: Foundation

### Setup

- [x] Install shadcn chart component
  ```bash
  npx shadcn@latest add chart
  ```

### Dashboard Layout

- [x] Create `(dashboard)` route group
  - `src/app/(dashboard)/layout.tsx` - Main layout with sidebar
  - `src/app/(dashboard)/page.tsx` - Redirect to /simulations

### Sidebar Components

- [x] `src/components/dashboard/app-sidebar.tsx` (client)
  - Collapsible sidebar with cookie persistence
  - Responsive: expanded on desktop, collapsed on mobile
  - Toggle button with animation
- [x] `src/components/dashboard/breadcrumb.tsx`
  - Dynamic breadcrumb from route segments
  - Active state highlighting

### Server Actions

- [x] `src/app/actions/simulations.ts`
  - `createSimulation(formData: FormData)` - Create new simulation
  - `deleteSimulation(id: string)` - Delete simulation
  - `runSimulationDay(simulationId, day)` - Run single day
  - `runFullSimulation(simulationId)` - Run all remaining days

### Query Functions

- [x] `src/lib/queries/simulations.ts`
  - `getSimulations(status?, limit?, offset?)` - List simulations
  - `getSimulation(id)` - Get simulation with agents and days
- [x] `src/lib/queries/replay.ts`
  - Re-export from `src/lib/sim/replay/queries.ts`

---

## Phase 2: Simulations List Page

### Page Structure

- [x] `src/app/(dashboard)/simulations/page.tsx` (RSC)
  - Fetch simulations with `getSimulations()`
  - Pass data to list component
- [x] `src/app/(dashboard)/simulations/loading.tsx`
  - Skeleton grid (6 cards)
- [x] `src/app/(dashboard)/simulations/error.tsx`
  - Error alert with retry button

### Components

- [x] `src/components/simulations/simulation-list.tsx`
  - Grid layout (1 col mobile, 2 col tablet, 3 col desktop)
  - Map simulations to cards
  - Empty state when no simulations
- [x] `src/components/simulations/simulation-card.tsx`
  - Card with name, status badge, agent count, date
  - Click navigates to detail page
- [x] `src/components/simulations/simulation-status-badge.tsx`
  - Status-colored badge (pending, running, completed, partial, failed)
  - Colors: pending=gray, running=blue, completed=green, partial=yellow, failed=red

### Dialogs (Client Components)

- [x] `src/components/simulations/create-simulation-dialog.tsx`
  - Dialog with form
  - Fields: name, model selection, numDays config
  - useTransition for loading state
  - Calls `createSimulation` server action
  - revalidatePath on success
- [x] `src/components/simulations/delete-simulation-dialog.tsx`
  - Confirmation dialog
  - Shows simulation name
  - useTransition for loading state
  - Calls `deleteSimulation` server action

### Filters

- [x] Status filter dropdown in page header
  - Options: All, Pending, Running, Completed, Partial, Failed
  - URL search params for state

---

## Phase 3: Simulation Detail Page

### Page Structure

- [x] `src/app/(dashboard)/simulations/[id]/page.tsx` (RSC)
  - Fetch simulation with `getSimulation(id)`
  - Display overview, agents, day progress
- [x] `src/app/(dashboard)/simulations/[id]/loading.tsx`
  - Skeleton for header, agent list, day grid
- [x] `src/app/(dashboard)/simulations/[id]/error.tsx`
  - Error alert with back link

### Components

- [x] `src/components/simulations/simulation-header.tsx`
  - Name, status badge, config summary
  - Created/finished timestamps
- [x] `src/components/simulations/agent-list.tsx`
  - List of agents with model names
  - Strategy info if present
- [x] `src/components/simulations/day-progress-grid.tsx`
  - Grid of day numbers (1 to numDays)
  - Status-colored cells
  - Click navigates to day replay
  - Shows tick completion (e.g., "6/8 ticks")
- [x] `src/components/simulations/run-controls.tsx` (client)
  - "Run Day X" button (next pending day)
  - "Run All" button (remaining days)
  - useTransition for loading state
  - Disable during running status
  - Progress indicator during execution

### Summary Card

- [x] `src/components/simulations/simulation-summary.tsx`
  - Total revenue across all agents
  - Days completed / total
  - Ticks completed / total
  - Leading agent (if simulation in progress)

---

## Phase 4: Day Replay Page

### Page Structure

- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/page.tsx` (RSC)
  - Fetch with `loadDayReplay(dayId)`
  - Display environment, timeline, summaries
- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/loading.tsx`
  - Skeleton for overview, timeline, agent cards
- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/error.tsx`
  - Error alert with back to simulation link

### Components

- [x] `src/components/replay/day-overview.tsx`
  - Day number, status, duration
  - Date/time range
- [x] `src/components/replay/environment-card.tsx`
  - Weather icon + label
  - Temperature display
  - Base demand number
  - Special event (if any)
- [x] `src/components/replay/tick-timeline.tsx` (client)
  - Horizontal 8-hour timeline (9am-5pm)
  - Status-colored tick indicators
  - Clickable to navigate to tick detail
  - Highlight current/selected tick
  - Tooltip with tick summary on hover
- [x] `src/components/replay/agent-daily-summary.tsx`
  - Card per agent
  - Model name, total revenue, customers served
  - Average price/quality/marketing
  - Market share average
  - Success rate (successful/fallback decisions)

### Charts

- [x] `src/components/charts/revenue-chart.tsx` (client)
  - Single line chart showing hourly total revenue
  - X-axis: Hour (9-16)
  - Y-axis: Revenue ($)
  - Uses ChartContainer + ChartConfig from shadcn
  - Tooltip with revenue values
- [x] `src/components/charts/market-share-chart.tsx` (client)
  - Donut chart
  - Shows market share distribution per agent
  - Center text: total customers
  - Tooltip with percentage and customer count

---

## Phase 5: Tick Replay Page

### Page Structure

- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/ticks/[tickId]/page.tsx` (RSC)
  - Fetch with `loadTickReplay(tickId)`
  - Display environment, decisions, outcomes
- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/ticks/[tickId]/loading.tsx`
  - Skeleton for header, decision grid, outcome grid
- [x] `src/app/(dashboard)/simulations/[id]/days/[dayId]/ticks/[tickId]/error.tsx`
  - Error alert with back to day link

### Components

- [x] `src/components/replay/tick-detail.tsx`
  - Hour display (e.g., "Hour 9 (9:00 AM)")
  - Tick status and duration
  - Environment snapshot
- [x] `src/components/replay/tick-navigation.tsx` (client)
  - Previous/Next tick buttons
  - Keyboard navigation (arrow keys)
  - Disable at boundaries (hour 9/16)
- [x] `src/components/replay/agent-decision-card.tsx`
  - Agent model name
  - Price (formatted as currency)
  - Quality (1-10 scale with visual indicator)
  - Marketing spend (0-100 with progress bar)
  - Reasoning text (collapsible if long)
  - Fallback indicator if used
  - LLM call duration
- [x] `src/components/replay/agent-outcome-card.tsx`
  - Customers served count
  - Sales volume
  - Revenue (formatted as currency)
  - Market share percentage
  - Comparison to previous tick (delta indicators)
- [x] `src/components/replay/demand-factors-card.tsx`
  - Collapsible detailed breakdown
  - Input factors: baseDemand, weather, event
  - Calculated scores: price, quality, marketing
  - Market context: totalMarketScore, share
  - Modifiers applied: weather, event
  - Final allocation

---

## Shared UI Components (if not in shadcn)

- [x] `src/components/ui/skeleton.tsx` - Loading placeholder (shadcn)
- [x] `src/components/ui/empty-state.tsx` - Empty list placeholder (custom)
- [x] Currency formatter utility (`src/lib/utils.ts`)
- [x] Date/time formatter utility (`src/lib/utils.ts`)

---

## Data Types Reference

### From API Schemas (`src/app/api/simulations/schemas.ts`)

- `SimulationListItem` - For list view
- `SimulationDetail` - For detail view
- `SimulationAgent` - Agent info
- `SimulationDayStatus` - Day progress

### From Replay Types (`src/lib/sim/replay/types.ts`)

- `DayReplayResponse` - Day replay data
- `TickReplayResponse` - Tick replay data
- `TickSummaryEntry` - Tick overview
- `AgentTurnEntry` - Agent decision + outcome
- `AgentDailySummary` - Daily aggregates

### From Engine Types (`src/lib/sim/engine/types.ts`)

- `EnvironmentSnapshot` - Weather, temp, baseDemand
- `DemandFactors` - Full demand calculation breakdown

---

## Overview

    Tech Stack: Next.js 16 + React 19 + RSC + Server Actions +
     shadcn (including charts)

     ---
     File Structure

     src/
     ├── app/
     │   ├── (dashboard)/                    # Route group for
     dashboard layout
     │   │   ├── layout.tsx                  # Dashboard layout
     with sidebar
     │   │   ├── page.tsx                    # Redirect to
     /simulations
     │   │   └── simulations/
     │   │       ├── page.tsx                # Simulations list
     (RSC)
     │   │       ├── loading.tsx             # Skeleton loader
     │   │       ├── error.tsx               # Error boundary
     │   │       └── [id]/
     │   │           ├── page.tsx            # Simulation detail
     (RSC)
     │   │           ├── loading.tsx
     │   │           ├── error.tsx
     │   │           └── days/
     │   │               └── [dayId]/
     │   │                   ├── page.tsx    # Day replay (RSC)
     │   │                   ├── loading.tsx
     │   │                   ├── error.tsx
     │   │                   └── ticks/
     │   │                       └── [tickId]/
     │   │                           ├── page.tsx  # Tick replay
     (RSC)
     │   │                           ├── loading.tsx
     │   │                           └── error.tsx
     │   └── actions/
     │       └── simulations.ts              # Server Actions
     │
     ├── components/
     │   ├── dashboard/
     │   │   ├── sidebar.tsx                 # Collapsible
     sidebar (client)
     │   │   ├── sidebar-nav.tsx             # Nav links
     │   │   └── breadcrumb.tsx              # Breadcrumb nav
     │   ├── simulations/
     │   │   ├── simulation-list.tsx         # List/grid view
     │   │   ├── simulation-card.tsx         # Card component
     │   │   ├── simulation-status-badge.tsx # Status badge
     │   │   ├── create-simulation-dialog.tsx # Create form
     (client)
     │   │   ├── delete-simulation-dialog.tsx # Delete confirm
     (client)
     │   │   ├── run-controls.tsx            # Run buttons
     (client)
     │   │   └── day-progress-grid.tsx       # Day completion
     grid
     │   ├── replay/
     │   │   ├── day-overview.tsx            # Day header
     │   │   ├── tick-timeline.tsx           # 8-hour timeline
     (client)
     │   │   ├── agent-daily-summary.tsx     # Daily stats
     │   │   ├── environment-card.tsx        # Weather/temp card
     │   │   ├── tick-detail.tsx             # Tick header
     │   │   ├── agent-decision-card.tsx     # Decision display
     │   │   ├── agent-outcome-card.tsx      # Outcome display
     │   │   └── demand-factors-card.tsx     # Demand breakdown
     │   └── charts/
     │       ├── revenue-chart.tsx           # Multi-line chart
     (client)
     │       └── market-share-chart.tsx      # Donut chart
     (client)
     │
     └── lib/
         └── queries/
             ├── simulations.ts              # Simulation queries
             └── replay.ts                   # Re-export replay
     queries

     ---
     Implementation Phases

     Phase 0: Planning Document (CURRENT)

     Task: Write ui-todo-list.md - NO CODE
     - Create comprehensive todo list at src/docs/ui-todo-list.md
     - Document all components, pages, and features to build
     - Organize by feature area with checkboxes
     - Include file paths and brief descriptions

     Phase 1: Foundation (FUTURE)

     1. Install shadcn chart: npx shadcn@latest add chart
     2. Create (dashboard) route group with layout
     3. Build collapsible sidebar component
     4. Create Server Actions file

     Phase 2: Simulations List (FUTURE)

     5. Build simulation list page (RSC)
     6. Create simulation card component
     7. Add status filter dropdown
     8. Build create simulation dialog
     9. Add delete confirmation dialog
     10. Add loading.tsx and error.tsx

     Phase 3: Simulation Detail (FUTURE)

     11. Build simulation detail page (RSC)
     12. Create day progress grid
     13. Build run controls (run day, run all)
     14. Add loading/error states

     Phase 4: Day Replay (FUTURE)

     15. Build day replay page (RSC)
     16. Create environment card
     17. Build tick timeline (interactive)
     18. Create agent daily summary cards
     19. Add revenue chart
     20. Add market share chart

     Phase 5: Tick Replay (FUTURE)

     21. Build tick replay page (RSC)
     22. Create agent decision cards
     23. Create agent outcome cards
     24. Build demand factors card
     25. Add breadcrumb navigation

     ---
     Server Actions (src/app/actions/simulations.ts)

     "use server";

     export async function createSimulation(formData: FormData):
     Promise<{ error?: string; simulation?: {...} }>
     export async function deleteSimulation(id: string):
     Promise<{ error?: string }>
     export async function runSimulationDay(simulationId: string,
      day: number): Promise<{ error?: string; result?: {...} }>
     export async function runFullSimulation(simulationId:
     string): Promise<{ error?: string; result?: {...} }>

     ---
     Key Patterns

     RSC Data Fetching

     // page.tsx (Server Component)
     async function Page({ params }) {
       const data = await queryFunction();
       return <ClientComponent data={data} />;
     }

     Promise Props with use()

     // RSC passes Promise
     <Suspense fallback={<Skeleton />}>
       <Component dataPromise={fetchData()} />
     </Suspense>

     // Client uses use() hook
     const data = use(dataPromise);

     Server Actions with useTransition

     "use client";
     const [isPending, startTransition] = useTransition();

     function handleAction() {
       startTransition(async () => {
         const result = await serverAction();
         if (result.error) { /* handle */ }
       });
     }

     shadcn Chart Pattern

     "use client";
     import { LineChart, Line, XAxis, CartesianGrid } from
     "recharts";
     import { ChartContainer, ChartTooltip, ChartTooltipContent,
     type ChartConfig } from "@/components/ui/chart";

     const chartConfig = {
       agent1: { label: "Agent 1", color: "var(--chart-1)" },
       agent2: { label: "Agent 2", color: "var(--chart-2)" },
     } satisfies ChartConfig;

     export function RevenueChart({ data }: Props) {
       return (
         <ChartContainer config={chartConfig}>
           <LineChart data={data}>
             <CartesianGrid vertical={false} />
             <XAxis dataKey="hour" />
             <ChartTooltip content={<ChartTooltipContent />} />
             <Line dataKey="agent1" stroke="var(--color-agent1)"
     />
             <Line dataKey="agent2" stroke="var(--color-agent2)"
     />
           </LineChart>
         </ChartContainer>
       );
     }

     ---
     Critical Existing Files

     | File                               | Purpose
                               |
     |------------------------------------|----------------------
     --------------------------|
     | src/lib/sim/replay/queries.ts      | loadDayReplay(),
     loadTickReplay()              |
     | src/lib/sim/replay/types.ts        | DayReplayResponse,
     TickReplayResponse          |
     | src/app/api/simulations/schemas.ts | Type definitions for
     simulations               |
     | src/components/ui/*                | shadcn components
     (Card, Button, Dialog, etc.) |
     | src/app/globals.css                | Chart colors
     (--chart-1 through --chart-5)     |

     ---
     UI Todo List

     Layout & Navigation

     - Dashboard layout with sidebar
     - Collapsible sidebar (localStorage persistence)
     - Sidebar navigation links
     - Breadcrumb component

     Simulations List Page

     - RSC page with data fetching
     - Simulation cards/table view
     - Status filter dropdown
     - Create simulation dialog
     - Delete confirmation dialog
     - Loading skeleton
     - Error boundary

     Simulation Detail Page

     - RSC page with simulation data
     - Overview card (name, status, config)
     - Agents list
     - Day progress grid
     - Run controls (run day, run all)
     - Loading/error states

     Day Replay Page

     - RSC page with day data
     - Environment card
     - Tick timeline (8 hours)
     - Agent daily summaries
     - Revenue over ticks chart
     - Market share pie chart
     - Loading/error states

     Tick Replay Page

     - RSC page with tick data
     - Hour/environment header
     - Agent decision cards
     - Agent outcome cards
     - Demand factors breakdown
     - Prev/next tick navigation
     - Loading/error states

     Server Actions

     - createSimulation
     - deleteSimulation
     - runSimulationDay
     - runFullSimulation

     Charts (shadcn/ui chart)

     - Install shadcn chart component (npx shadcn@latest add
     chart)
     - Revenue line chart (multi-line for agents over ticks)
     - Market share donut chart (per-tick or day aggregate)

---

## Testing Checklist (Manual)

- [ ] Simulations list loads and displays correctly
- [ ] Create simulation dialog works
- [ ] Delete simulation with confirmation works
- [ ] Simulation detail shows correct data
- [ ] Run day button triggers simulation
- [ ] Day replay shows all tick data
- [ ] Charts render with correct data
- [ ] Tick replay shows decision/outcome cards
- [ ] Navigation between pages works
- [ ] Loading states display correctly
- [ ] Error states handle gracefully
- [ ] Responsive layout on mobile/tablet/desktop
- [ ] Dark mode colors work
