import { notFound } from "next/navigation";
import { loadDayReplay } from "@/lib/queries/replay";
import { getSimulation } from "@/lib/queries/simulations";
import { DayOverview } from "@/components/replay/day-overview";
import { EnvironmentCard } from "@/components/replay/environment-card";
import { TickTimeline } from "@/components/replay/tick-timeline";
import { AgentDailySummary } from "@/components/replay/agent-daily-summary";
import { RevenueChart } from "@/components/charts/revenue-chart";
import { MarketShareChart } from "@/components/charts/market-share-chart";

interface DayReplayPageProps {
  params: Promise<{ id: string; dayId: string }>;
}

export default async function DayReplayPage({ params }: DayReplayPageProps) {
  const { id, dayId } = await params;

  // Fetch day replay data and simulation details in parallel
  const [dayResult, simulation] = await Promise.all([
    loadDayReplay(dayId),
    getSimulation(id),
  ]);

  if (!dayResult.success || !simulation) {
    notFound();
  }

  const day = dayResult.data;

  return (
    <div className="space-y-6">
      <DayOverview
        day={day.day}
        status={day.status}
        seed={day.seed}
        startedAt={day.startedAt}
        finishedAt={day.finishedAt}
        simulationId={id}
        simulationName={simulation.name}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <EnvironmentCard environment={day.environment} />
          <TickTimeline
            ticks={day.ticks}
            simulationId={id}
            dayId={dayId}
          />
          {day.ticks.length > 0 && (
            <RevenueChart ticks={day.ticks} />
          )}
        </div>

        <div className="space-y-6">
          {day.agentSummaries.length > 0 && (
            <>
              <MarketShareChart agentSummaries={day.agentSummaries} />
              <AgentDailySummary agentSummaries={day.agentSummaries} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
